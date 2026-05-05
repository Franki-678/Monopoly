import sql from './db';

// ============ ECONOMY CONSTANTS ============
export const CONFIG = {
  MAINTENANCE_RATE: 0.015,
  PRICE_FLOOR_MULT: 0.5,
  PRICE_CEILING_MULT: 2.5,
  INCOME_POLYNOMIAL_EXP: 1.15,
  INCOME_POLYNOMIAL_COEF: 0.01,
  COST_EXPONENTIAL_BASE: 1.02,
  MARKET_PREMIUM: 1.03,
  MARKET_DISCOUNT: 0.97,
  FMV_ADJUSTMENT_RATE: 0.03,
  BANKRUPTCY_LIQUIDITY_INJECTION: 2000,
  BANKRUPTCY_TAX_EXEMPT_TURNS: 5,
  BEN_SERVER_COST: 50,          // SYSTEMS_ENGINEER: costo fijo por turno
  SANTI_THERAPY_RATE: 0.05,     // PSYCHOLOGIST: 5% comisión sobre escrow/inyección
  BOARD_SIZE: 20,               // Casillas 0-19
  TRANSIT_RENT_RATE: 0.05,      // 5% del FMV cobrado al aterrizaje en corp ajena
  PSICOLOGO_FEE: 200,           // Tarifa fija de la casilla 10 (El Psicólogo)
};

// Mapa de casillas especiales del tablero
export const BOARD_SPECIAL_SQUARES = {
  5:  'PRENDAS',    // castigo físico — aviso solo por Telegram
  10: 'PSICOLOGO',  // sesión $200 cobrada automáticamente
  15: 'PRENDAS',    // castigo físico — aviso solo por Telegram
};

export function incomeMultiplier(turn) {
  return 1 + CONFIG.INCOME_POLYNOMIAL_COEF * Math.pow(turn, CONFIG.INCOME_POLYNOMIAL_EXP);
}
export function costMultiplier(turn) {
  return Math.pow(CONFIG.COST_EXPONENTIAL_BASE, turn - 1);
}

export function calcProgressiveTax(netWorth) {
  const brackets = [
    { threshold: 10000,    rate: 0 },
    { threshold: 50000,    rate: 0.025 },
    { threshold: 150000,   rate: 0.07 },
    { threshold: Infinity, rate: 0.15 },
  ];
  let tax = 0, prev = 0;
  for (const b of brackets) {
    if (netWorth <= prev) break;
    const inBracket = Math.min(netWorth, b.threshold) - prev;
    if (inBracket > 0) tax += inBracket * b.rate;
    prev = b.threshold;
  }
  return Math.round(tax * 100) / 100;
}

export async function getCurrentTurn() {
  const [row] = await sql`SELECT current_turn FROM game_state WHERE id = 1`;
  return row?.current_turn || 1;
}

export async function computeNetWorth(playerId) {
  const [row] = await sql`
    SELECT p.liquid_cash + COALESCE((
      SELECT SUM((s.shares::numeric / c.total_shares) * c.fair_market_value)
      FROM shareholdings s JOIN corporations c ON c.id = s.corporation_id
      WHERE s.player_id = p.id AND s.shares > 0
    ), 0) AS nw
    FROM players p WHERE p.id = ${playerId}
  `;
  return Number(row?.nw || 0);
}

// ============ ACHIEVEMENT HELPER ============
// Awards a global achievement to winnerId if not yet claimed.
// Returns the achievement row if awarded, null if already won.
export async function checkAndAwardAchievement(achievementId, winnerId, turn) {
  const [ach] = await sql`
    UPDATE global_achievements
    SET winner_id = ${winnerId}, won_at_turn = ${turn}
    WHERE id = ${achievementId} AND winner_id IS NULL
    RETURNING id, name, prize_cash, prize_ic
  `;
  if (!ach) return null;

  if (Number(ach.prize_cash) > 0) {
    await sql`UPDATE players SET liquid_cash = liquid_cash + ${ach.prize_cash} WHERE id = ${winnerId}`;
    await sql`
      INSERT INTO transactions (turn_number, player_id, tx_type, amount, description)
      VALUES (${turn}, ${winnerId}, 'ACHIEVEMENT', ${ach.prize_cash}, ${'🏆 ' + ach.name})
    `;
  }
  if (Number(ach.prize_ic) > 0) {
    await sql`UPDATE players SET intellectual_capital = intellectual_capital + ${ach.prize_ic} WHERE id = ${winnerId}`;
    await sql`
      INSERT INTO transactions (turn_number, player_id, tx_type, amount, description)
      VALUES (${turn}, ${winnerId}, 'ACHIEVEMENT', 0, ${'🏆 ' + ach.name + ' (+' + Number(ach.prize_ic) + ' IC)'})
    `;
  }
  return ach;
}

// ============ TURN RESOLUTION (OPTIMIZED) ============
export async function resolveTurn() {
  const turn = await getCurrentTurn();
  const incMult  = incomeMultiplier(turn);
  const costMult = costMultiplier(turn);
  const summary  = { turn, events: [], tradesCount: 0, trades: [], fmv_changes: {}, achievements: [] };

  await sql`UPDATE game_state SET locked = TRUE WHERE id = 1`;

  try {
    // ── Pre-load role map, username map and Psychologist id ──────────────
    const allPlayers  = await sql`SELECT id, player_role, username FROM players`;
    const roleMap     = Object.fromEntries(allPlayers.map(p => [p.id, p.player_role]));
    const usernameMap = Object.fromEntries(allPlayers.map(p => [p.id, p.username]));
    const santiRow    = allPlayers.find(p => p.player_role === 'PSYCHOLOGIST');
    const santiId     = santiRow?.id || null;

    // ===== PHASE 0: ALLIANCE BREACH DETECTION =====
    const activeAlliances = await sql`SELECT * FROM alliances WHERE status = 'ACTIVE'`;
    const pendingBuys = await sql`
      SELECT o.id, o.player_id, o.corporation_id, c.ceo_player_id, c.name AS corp_name
      FROM orders o JOIN corporations c ON c.id = o.corporation_id
      WHERE o.turn_number = ${turn} AND o.status = 'PENDING' AND o.order_type = 'BUY_SHARES'
    `;
    const breachedAllianceIds = new Set();
    for (const all of activeAlliances) {
      for (const b of pendingBuys) {
        const attackerIsParty = b.player_id === all.proposer_id || b.player_id === all.recipient_id;
        if (!attackerIsParty) continue;
        const ally = b.player_id === all.proposer_id ? all.recipient_id : all.proposer_id;
        if (b.ceo_player_id === ally) {
          if (breachedAllianceIds.has(all.id)) continue;
          breachedAllianceIds.add(all.id);
          const attackerId    = b.player_id;
          const victimId      = ally;
          const attackerEscrow = attackerId === all.proposer_id ? Number(all.escrow_proposer) : Number(all.escrow_recipient);
          const victimEscrow   = victimId   === all.proposer_id ? Number(all.escrow_proposer) : Number(all.escrow_recipient);
          const totalEscrow    = attackerEscrow + victimEscrow;

          // Santi (PSYCHOLOGIST) collects 5% therapy fee on the total escrow
          let toVictim = totalEscrow;
          if (santiId && santiId !== victimId && santiId !== attackerId) {
            const commission = Math.round(totalEscrow * CONFIG.SANTI_THERAPY_RATE * 100) / 100;
            toVictim = totalEscrow - commission;
            await sql`UPDATE players SET liquid_cash = liquid_cash + ${commission} WHERE id = ${santiId}`;
            await sql`
              INSERT INTO transactions (turn_number, player_id, tx_type, amount, description)
              VALUES (${turn}, ${santiId}, 'THERAPY_FEE', ${commission},
                ${'Honorarios ruptura alianza (escrow $' + totalEscrow.toFixed(0) + ')'})
            `;
            summary.events.push({ type: 'THERAPY_FEE', recipient: santiId, amount: commission });
          }

          await sql`UPDATE players SET liquid_cash = liquid_cash + ${toVictim} WHERE id = ${victimId}`;
          const reason = 'Acto hostil: intento de compra en ' + b.corp_name + ' (CEO del aliado)';
          await sql`UPDATE alliances SET status = 'BROKEN', broken_at_turn = ${turn}, broken_by = ${attackerId}, break_reason = ${reason} WHERE id = ${all.id}`;
          await sql`INSERT INTO transactions (turn_number, player_id, tx_type, amount, description) VALUES (${turn}, ${victimId}, 'ESCROW_RECOVERY', ${victimEscrow}, 'Recupero tu propio escrow + confiscás el del traidor')`;
          await sql`INSERT INTO transactions (turn_number, player_id, tx_type, amount, description) VALUES (${turn}, ${victimId}, 'ESCROW_SEIZE', ${attackerEscrow}, ${'Escrow confiscado (alianza rota por ataque a ' + b.corp_name + ')'})`;
          await sql`INSERT INTO transactions (turn_number, player_id, tx_type, amount, description) VALUES (${turn}, ${attackerId}, 'ESCROW_FORFEIT', 0, ${'Escrow perdido por romper alianza (ataque a ' + b.corp_name + ')'})`;
          summary.events.push({ type: 'ALLIANCE_BROKEN', alliance_id: all.id, attacker: attackerId, victim: victimId, corp: b.corp_name, forfeit: attackerEscrow });
        }
      }
    }

    // ===== PHASE 1: TRADES =====
    // Pre-load tech holders en Sets para evitar queries por-orden (O(n) → O(1))
    const fin2Holders = new Set((await sql`SELECT DISTINCT player_id FROM tech_unlocks WHERE node_id = 'fin-2'`).map(r => r.player_id));
    const fin4Holders = new Set((await sql`SELECT DISTINCT player_id FROM tech_unlocks WHERE node_id = 'fin-4'`).map(r => r.player_id));
    const urb4Holders = new Set((await sql`SELECT DISTINCT player_id FROM tech_unlocks WHERE node_id = 'urb-4'`).map(r => r.player_id));

    const orders  = await sql`SELECT * FROM orders WHERE turn_number = ${turn} AND status = 'PENDING' ORDER BY created_at ASC`;
    const corps   = await sql`SELECT id, name, fair_market_value, total_shares, district, ceo_player_id FROM corporations`;
    const corpMap = Object.fromEntries(corps.map((c) => [c.id, c]));

    const byCorp = {};
    for (const o of orders) {
      if (!byCorp[o.corporation_id]) byCorp[o.corporation_id] = { buys: [], sells: [] };
      if (o.order_type === 'BUY_SHARES')  byCorp[o.corporation_id].buys.push(o);
      else if (o.order_type === 'SELL_SHARES') byCorp[o.corporation_id].sells.push(o);
    }

    for (const corpId in byCorp) {
      const corp = corpMap[corpId];
      if (!corp) continue;
      const fmv          = Number(corp.fair_market_value);
      const perShare     = fmv / 100;
      const floorPerShare  = perShare * CONFIG.PRICE_FLOOR_MULT;
      const ceilPerShare   = perShare * CONFIG.PRICE_CEILING_MULT;
      const { buys, sells } = byCorp[corpId];

      // SELLS
      for (const o of sells) {
        // fin-2 (Arbitraje): reduce el discount de venta de 3% a 1.5%
        const sellDiscount = fin2Holders.has(o.player_id) ? 0.985 : CONFIG.MARKET_DISCOUNT;
        const sellPrice = Math.max(floorPerShare, Math.min(ceilPerShare, perShare * sellDiscount));
        const [holding] = await sql`SELECT shares FROM shareholdings WHERE player_id = ${o.player_id} AND corporation_id = ${o.corporation_id}`;
        const avail = holding?.shares || 0;
        const qty   = Math.min(o.shares, avail);
        if (qty <= 0) {
          await sql`UPDATE orders SET status = 'REJECTED', result_note = ${'No tienes shares de esta corp (avail: ' + avail + ')'} WHERE id = ${o.id}`;
          continue;
        }
        const revenue = Math.round(qty * sellPrice * 100) / 100;
        await sql`UPDATE shareholdings SET shares = shares - ${qty} WHERE player_id = ${o.player_id} AND corporation_id = ${o.corporation_id}`;
        await sql`UPDATE players SET liquid_cash = liquid_cash + ${revenue} WHERE id = ${o.player_id}`;
        await sql`INSERT INTO transactions (turn_number, player_id, tx_type, amount, description) VALUES (${turn}, ${o.player_id}, 'SELL_SHARES', ${revenue}, ${'Vendió ' + qty + ' shares de ' + corp.name})`;
        const partialNote = qty < o.shares
          ? 'Fill parcial: vendidas ' + qty + '/' + o.shares + ' (stock limitado) @ $' + sellPrice.toFixed(2)
          : 'Ejecutado: vendidas ' + qty + ' @ $' + sellPrice.toFixed(2);
        await sql`UPDATE orders SET status = ${qty < o.shares ? 'PARTIAL' : 'EXECUTED'}, result_note = ${partialNote} WHERE id = ${o.id}`;
        summary.trades.push({ type: 'SELL', corp: corp.name, qty });
      }

      // BUYS — applies role-based price modifier
      for (const o of buys) {
        const buyerRole = roleMap[o.player_id] || null;

        // Role modifier on purchase price
        let roleMultiplier = 1.0;
        if (buyerRole === 'DATA_SCIENTIST') {
          roleMultiplier = 1.10; // +10% on all corp purchases
        } else if (buyerRole === 'MECH_ENGINEER' && corp.district === 'Zona Industrial') {
          roleMultiplier = 0.80; // -20% on industrial corps
        }

        // fin-4 (HFT Bot): reduce el premium de compra de 3% a 1.5%
        const buyPremium = fin4Holders.has(o.player_id) ? 1.015 : CONFIG.MARKET_PREMIUM;

        const buyPrice = Math.max(floorPerShare, Math.min(ceilPerShare, perShare * buyPremium * roleMultiplier));

        if (o.limit_price && Number(o.limit_price) < buyPrice) {
          await sql`UPDATE orders SET status = 'REJECTED', result_note = ${'Price spike: el precio subió a $' + buyPrice.toFixed(2) + ' (tu límite era $' + Number(o.limit_price).toFixed(2) + ')'} WHERE id = ${o.id}`;
          continue;
        }
        const [owned] = await sql`SELECT COALESCE(SUM(shares),0)::int AS total FROM shareholdings WHERE corporation_id = ${corpId}`;
        const marketSupply = (corp.total_shares || 100) - owned.total;
        let qty = Math.min(o.shares, marketSupply);
        if (qty <= 0) {
          await sql`UPDATE orders SET status = 'REJECTED', result_note = 'Sold out: sin shares disponibles en el mercado' WHERE id = ${o.id}`;
          continue;
        }
        const [player]    = await sql`SELECT liquid_cash FROM players WHERE id = ${o.player_id}`;
        const totalCost   = Math.round(qty * buyPrice * 100) / 100;
        let status = 'EXECUTED', note = 'Ejecutado: compradas ' + qty + ' @ $' + buyPrice.toFixed(2);
        let actualQty = qty, actualCost = totalCost;
        if (Number(player.liquid_cash) < totalCost) {
          actualQty = Math.floor(Number(player.liquid_cash) / buyPrice);
          if (actualQty <= 0) {
            await sql`UPDATE orders SET status = 'REJECTED', result_note = ${'Fondos insuficientes: necesitas $' + totalCost.toFixed(2) + ', tienes $' + Number(player.liquid_cash).toFixed(2)} WHERE id = ${o.id}`;
            continue;
          }
          actualCost = Math.round(actualQty * buyPrice * 100) / 100;
          status = 'PARTIAL';
          note   = 'Fill parcial: compradas ' + actualQty + '/' + o.shares + ' (fondos insuficientes) @ $' + buyPrice.toFixed(2);
        } else if (actualQty < o.shares) {
          status = 'PARTIAL';
          note   = 'Fill parcial: compradas ' + actualQty + '/' + o.shares + ' (stock limitado: ' + marketSupply + ' disp.) @ $' + buyPrice.toFixed(2);
        }
        await sql`UPDATE players SET liquid_cash = liquid_cash - ${actualCost} WHERE id = ${o.player_id}`;
        await sql`
          INSERT INTO shareholdings (player_id, corporation_id, shares)
          VALUES (${o.player_id}, ${corpId}, ${actualQty})
          ON CONFLICT (player_id, corporation_id) DO UPDATE SET shares = shareholdings.shares + ${actualQty}
        `;
        await sql`INSERT INTO transactions (turn_number, player_id, tx_type, amount, description) VALUES (${turn}, ${o.player_id}, 'BUY_SHARES', ${-actualCost}, ${'Compró ' + actualQty + ' shares de ' + corp.name})`;
        await sql`UPDATE orders SET status = ${status}, result_note = ${note} WHERE id = ${o.id}`;
        summary.trades.push({ type: 'BUY', corp: corp.name, qty: actualQty });
      }

      // FMV adjust based on net demand
      const netDemand = buys.reduce((s, o) => s + o.shares, 0) - sells.reduce((s, o) => s + o.shares, 0);
      if (netDemand !== 0) {
        let fmvDelta = netDemand * CONFIG.FMV_ADJUSTMENT_RATE * perShare;
        // urb-4 (Distrito Premium): si el CEO tiene este nodo, el FMV es inmune a caídas por ventas
        if (fmvDelta < 0 && corp.ceo_player_id && urb4Holders.has(corp.ceo_player_id)) {
          fmvDelta = 0; // floor activado — absorbe la presión vendedora
        }
        if (fmvDelta !== 0) {
          const newFmv = Math.max(fmv * 0.5, Math.min(fmv * 1.5, fmv + fmvDelta));
          if (Math.abs(newFmv - fmv) > 0.01) {
            await sql`UPDATE corporations SET fair_market_value = ${newFmv} WHERE id = ${corpId}`;
            summary.fmv_changes[corp.name] = { from: fmv, to: Math.round(newFmv * 100) / 100 };
          }
        }
      }
    }
    summary.tradesCount = summary.trades.length;

    // Achievement: first_10pct — first player with ≥10 shares of any corp
    const [holder10] = await sql`SELECT player_id FROM shareholdings WHERE shares >= 10 ORDER BY shares DESC LIMIT 1`;
    if (holder10) {
      const ach = await checkAndAwardAchievement('first_10pct', holder10.player_id, turn);
      if (ach) summary.achievements.push({ id: 'first_10pct', name: ach.name, winner: holder10.player_id, winnerName: usernameMap[holder10.player_id] });
    }

    // Achievement: wolf_wall_st — first player with 5+ executed trades this turn
    const [wolf] = await sql`
      SELECT player_id FROM orders
      WHERE turn_number = ${turn} AND status IN ('EXECUTED','PARTIAL')
      GROUP BY player_id HAVING COUNT(*) >= 5
      ORDER BY COUNT(*) DESC LIMIT 1
    `;
    if (wolf) {
      const ach = await checkAndAwardAchievement('wolf_wall_st', wolf.player_id, turn);
      if (ach) summary.achievements.push({ id: 'wolf_wall_st', name: ach.name, winner: wolf.player_id, winnerName: usernameMap[wolf.player_id] });
    }

    // ===== PHASE 1.5: BOARD MOVEMENT =====
    // Mueve a cada jugador según su tirada del día; resuelve efectos de la casilla.
    const boardRolls = await sql`SELECT player_id, roll_value FROM daily_rolls WHERE turn_number = ${turn}`;
    if (boardRolls.length > 0) {
      const boardPlayers = await sql`SELECT id, username, board_position FROM players`;
      const boardCorps   = await sql`SELECT id, name, fair_market_value, board_position FROM corporations WHERE board_position IS NOT NULL`;
      const corpByPos    = Object.fromEntries(boardCorps.map(c => [Number(c.board_position), c]));

      for (const roll of boardRolls) {
        const pl = boardPlayers.find(p => p.id === roll.player_id);
        if (!pl) continue;
        const oldPos = Number(pl.board_position) || 0;
        const newPos = (oldPos + roll.roll_value) % CONFIG.BOARD_SIZE;
        await sql`UPDATE players SET board_position = ${newPos} WHERE id = ${roll.player_id}`;
        const squareType = BOARD_SPECIAL_SQUARES[newPos];

        if (squareType === 'PSICOLOGO') {
          // Casilla 10 — sesión obligatoria: $200 salen del jugador y van a Santi
          await sql`UPDATE players SET liquid_cash = liquid_cash - ${CONFIG.PSICOLOGO_FEE} WHERE id = ${roll.player_id}`;
          await sql`
            INSERT INTO transactions (turn_number, player_id, tx_type, amount, description)
            VALUES (${turn}, ${roll.player_id}, 'THERAPY_FEE', ${-CONFIG.PSICOLOGO_FEE},
              'Sesión obligatoria: cayó en El Psicólogo (casilla 10)')
          `;
          if (santiId && santiId !== roll.player_id) {
            await sql`UPDATE players SET liquid_cash = liquid_cash + ${CONFIG.PSICOLOGO_FEE} WHERE id = ${santiId}`;
            await sql`
              INSERT INTO transactions (turn_number, player_id, tx_type, amount, description)
              VALUES (${turn}, ${santiId}, 'THERAPY_FEE', ${CONFIG.PSICOLOGO_FEE},
                ${'Honorario sesión tablero con ' + pl.username})
            `;
          }
          summary.events.push({ type: 'PSICOLOGO_VISIT', player_id: roll.player_id, username: pl.username, fee: CONFIG.PSICOLOGO_FEE, position: newPos });

        } else if (squareType === 'PRENDAS') {
          // Casilla 5 o 15 — castigo físico, sin efecto económico; Telegram notifica al grupo
          summary.events.push({ type: 'PRENDAS', player_id: roll.player_id, username: pl.username, position: newPos });

        } else {
          // Casilla de corporación — cobrar alquiler de tránsito si hay accionistas ajenos
          const landedCorp = corpByPos[newPos];
          if (landedCorp) {
            const others = await sql`
              SELECT player_id, shares FROM shareholdings
              WHERE corporation_id = ${landedCorp.id}
                AND player_id != ${roll.player_id}
                AND shares > 0
            `;
            if (others.length > 0) {
              const rent = Math.round(Number(landedCorp.fair_market_value) * CONFIG.TRANSIT_RENT_RATE * 100) / 100;
              if (rent > 0) {
                await sql`UPDATE players SET liquid_cash = liquid_cash - ${rent} WHERE id = ${roll.player_id}`;
                await sql`
                  INSERT INTO transactions (turn_number, player_id, tx_type, amount, description)
                  VALUES (${turn}, ${roll.player_id}, 'TRANSIT_RENT', ${-rent},
                    ${'Alquiler de tránsito: aterrizó en ' + landedCorp.name})
                `;
                // Distribuir el alquiler proporcionalmente entre accionistas ajenos
                const totalOtherShares = others.reduce((s, r) => s + Number(r.shares), 0);
                for (const sh of others) {
                  const portion = Math.round(rent * (Number(sh.shares) / totalOtherShares) * 100) / 100;
                  if (portion > 0) {
                    await sql`UPDATE players SET liquid_cash = liquid_cash + ${portion} WHERE id = ${sh.player_id}`;
                    await sql`
                      INSERT INTO transactions (turn_number, player_id, tx_type, amount, description)
                      VALUES (${turn}, ${sh.player_id}, 'TRANSIT_RENT_INCOME', ${portion},
                        ${'Tránsito cobrado: ' + pl.username + ' aterrizó en ' + landedCorp.name})
                    `;
                  }
                }
                summary.events.push({ type: 'TRANSIT_RENT', player_id: roll.player_id, username: pl.username, corp: landedCorp.name, rent, position: newPos });
              }
            }
          }
        }
      }
    }

    // ===== PHASE 2: DIVIDENDS (bulk CTE with role multipliers) =====
    // Roles applied:
    //   ECONOMIST:     × 1.10
    //   PSYCHOLOGIST:  × 0.85  (lower base income)
    //   MECH_ENGINEER: × 1.02 on Zona Industrial (= +20% × 0.85), × 0.85 elsewhere
    // Tech urb-3 (CEO +10%): applied as extra for CEOs with that node
    await sql`
      WITH divs AS (
        SELECT s.player_id,
               SUM(
                 c.base_income * ${incMult} * (s.shares::numeric / c.total_shares)
                 * CASE p.player_role
                     WHEN 'ECONOMIST'     THEN 1.10
                     WHEN 'PSYCHOLOGIST'  THEN 0.85
                     WHEN 'MECH_ENGINEER' THEN
                       CASE WHEN c.district = 'Zona Industrial' THEN 1.02 ELSE 0.85 END
                     ELSE 1.0
                   END
                 -- urb-3: CEO gets +10% on their own corps (if they own urb-3)
                 * CASE
                     WHEN c.ceo_player_id = s.player_id
                          AND EXISTS (SELECT 1 FROM tech_unlocks tu WHERE tu.player_id = s.player_id AND tu.node_id = 'urb-3')
                     THEN 1.10
                     ELSE 1.0
                   END
                 -- log-4: +5% bonus when holding >50% of a corp
                 * CASE
                     WHEN s.shares::numeric / c.total_shares > 0.5
                          AND EXISTS (SELECT 1 FROM tech_unlocks tu WHERE tu.player_id = s.player_id AND tu.node_id = 'log-4')
                     THEN 1.05
                     ELSE 1.0
                   END
               ) AS amount
        FROM shareholdings s
        JOIN corporations c ON c.id = s.corporation_id
        JOIN players p ON p.id = s.player_id
        WHERE s.shares > 0
        GROUP BY s.player_id
      )
      UPDATE players p SET liquid_cash = liquid_cash + d.amount
      FROM divs d WHERE p.id = d.player_id AND d.amount > 0
    `;
    // Transaction log for dividends (with same role multipliers for accurate records)
    await sql`
      INSERT INTO transactions (turn_number, player_id, tx_type, amount, description)
      SELECT ${turn}, s.player_id, 'DIVIDEND',
             ROUND((
               c.base_income * ${incMult} * (s.shares::numeric / c.total_shares)
               * CASE p.player_role
                   WHEN 'ECONOMIST'     THEN 1.10
                   WHEN 'PSYCHOLOGIST'  THEN 0.85
                   WHEN 'MECH_ENGINEER' THEN
                     CASE WHEN c.district = 'Zona Industrial' THEN 1.02 ELSE 0.85 END
                   ELSE 1.0
                 END
               * CASE
                   WHEN c.ceo_player_id = s.player_id
                        AND EXISTS (SELECT 1 FROM tech_unlocks tu WHERE tu.player_id = s.player_id AND tu.node_id = 'urb-3')
                   THEN 1.10 ELSE 1.0
                 END
               * CASE
                   WHEN s.shares::numeric / c.total_shares > 0.5
                        AND EXISTS (SELECT 1 FROM tech_unlocks tu WHERE tu.player_id = s.player_id AND tu.node_id = 'log-4')
                   THEN 1.05 ELSE 1.0
                 END
             )::numeric, 2),
             'Dividendo ' || c.name || ' (' || s.shares || '%)'
      FROM shareholdings s
      JOIN corporations c ON c.id = s.corporation_id
      JOIN players p ON p.id = s.player_id
      WHERE s.shares > 0
        AND (c.base_income * ${incMult} * (s.shares::numeric / c.total_shares)) > 0.01
    `;

    // ===== PHASE 3: MAINTENANCE (bulk CTE) =====
    // Tech urb-1 reduces maintenance by 10%; tech log-3 reduces by additional 5%.
    await sql`
      WITH mnt AS (
        SELECT s.player_id,
               SUM(
                 (s.shares::numeric / c.total_shares) * c.fair_market_value
                 * ${CONFIG.MAINTENANCE_RATE} * ${costMult}
                 -- urb-1: -10% maintenance
                 * CASE WHEN EXISTS (SELECT 1 FROM tech_unlocks tu WHERE tu.player_id = s.player_id AND tu.node_id = 'urb-1') THEN 0.90 ELSE 1.0 END
                 -- log-3: additional -5% maintenance
                 * CASE WHEN EXISTS (SELECT 1 FROM tech_unlocks tu WHERE tu.player_id = s.player_id AND tu.node_id = 'log-3') THEN 0.95 ELSE 1.0 END
               ) AS amount
        FROM shareholdings s JOIN corporations c ON c.id = s.corporation_id
        WHERE s.shares > 0
        GROUP BY s.player_id
      )
      UPDATE players p SET liquid_cash = liquid_cash - m.amount
      FROM mnt m WHERE p.id = m.player_id AND m.amount > 0
    `;
    await sql`
      INSERT INTO transactions (turn_number, player_id, tx_type, amount, description)
      SELECT ${turn}, s.player_id, 'MAINTENANCE',
             ROUND((-(s.shares::numeric / c.total_shares) * c.fair_market_value * ${CONFIG.MAINTENANCE_RATE} * ${costMult})::numeric, 2),
             'Mantenimiento ' || c.name
      FROM shareholdings s JOIN corporations c ON c.id = s.corporation_id
      WHERE s.shares > 0
        AND ((s.shares::numeric / c.total_shares) * c.fair_market_value * ${CONFIG.MAINTENANCE_RATE} * ${costMult}) > 0.01
    `;

    // SYSTEMS_ENGINEER (BEN): fixed $50 server cost every turn, regardless of bankruptcy
    const [benRow] = await sql`SELECT id FROM players WHERE player_role = 'SYSTEMS_ENGINEER'`;
    if (benRow) {
      await sql`UPDATE players SET liquid_cash = liquid_cash - ${CONFIG.BEN_SERVER_COST} WHERE id = ${benRow.id}`;
      await sql`
        INSERT INTO transactions (turn_number, player_id, tx_type, amount, description)
        VALUES (${turn}, ${benRow.id}, 'SERVER_MAINTENANCE', ${-CONFIG.BEN_SERVER_COST},
          'Costo fijo de servidor (Ing. Sistemas)')
      `;
    }

    // ===== PHASE 4: CEO reassign (bulk) =====
    await sql`
      UPDATE corporations c SET ceo_player_id = top.player_id
      FROM (
        SELECT DISTINCT ON (corporation_id) corporation_id, player_id, shares
        FROM shareholdings WHERE shares > 0
        ORDER BY corporation_id, shares DESC
      ) top
      WHERE c.id = top.corporation_id
    `;
    await sql`UPDATE corporations SET ceo_player_id = NULL WHERE id NOT IN (SELECT corporation_id FROM shareholdings WHERE shares > 0)`;

    // Tech urb-2: CEO's corps gain +2% FMV per turn
    const ceoCorps = await sql`
      SELECT c.id, c.fair_market_value, c.ceo_player_id
      FROM corporations c
      WHERE c.ceo_player_id IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM tech_unlocks tu
          WHERE tu.player_id = c.ceo_player_id AND tu.node_id = 'urb-2'
        )
    `;
    for (const cc of ceoCorps) {
      const newFmv = Math.round(Number(cc.fair_market_value) * 1.02 * 100) / 100;
      await sql`UPDATE corporations SET fair_market_value = ${newFmv} WHERE id = ${cc.id}`;
    }

    // Achievement: first_ceo — award to CEO of the highest-value corp
    const [topCeoRow] = await sql`
      SELECT ceo_player_id FROM corporations
      WHERE ceo_player_id IS NOT NULL
      ORDER BY fair_market_value DESC LIMIT 1
    `;
    if (topCeoRow?.ceo_player_id) {
      const ach = await checkAndAwardAchievement('first_ceo', topCeoRow.ceo_player_id, turn);
      if (ach) summary.achievements.push({ id: 'first_ceo', name: ach.name, winner: topCeoRow.ceo_player_id, winnerName: usernameMap[topCeoRow.ceo_player_id] });
    }

    // ===== PHASE 5: Progressive wealth tax (bulk CTE) =====
    // Roles applied:
    //   ECONOMIST: top bracket rate 12% instead of 15%
    // Tech fin-3: wealth tax × 0.80
    const taxResults = await sql`
      WITH equity AS (
        SELECT s.player_id, SUM((s.shares::numeric / c.total_shares) * c.fair_market_value) AS eq
        FROM shareholdings s JOIN corporations c ON c.id = s.corporation_id
        WHERE s.shares > 0 GROUP BY s.player_id
      ),
      nw AS (
        SELECT p.id, p.tax_exempt_turns, p.player_role,
               (p.liquid_cash + COALESCE(e.eq, 0))::numeric AS net_worth
        FROM players p LEFT JOIN equity e ON e.player_id = p.id
      ),
      tax AS (
        SELECT id, net_worth, tax_exempt_turns,
          CASE WHEN tax_exempt_turns > 0 THEN 0::numeric
          ELSE
            ROUND((
              GREATEST(0, LEAST(net_worth, 50000) - 10000) * 0.025 +
              GREATEST(0, LEAST(net_worth, 150000) - 50000) * 0.07 +
              GREATEST(0, net_worth - 150000) *
                CASE WHEN player_role = 'ECONOMIST' THEN 0.12 ELSE 0.15 END
            )::numeric, 2)
            -- fin-3 (Hedging): reduces effective tax by 20%
            * CASE WHEN EXISTS (
                SELECT 1 FROM tech_unlocks tu WHERE tu.player_id = nw.id AND tu.node_id = 'fin-3'
              ) THEN 0.80 ELSE 1.0 END
          END AS tax_amount
        FROM nw
      )
      UPDATE players p
      SET liquid_cash = CASE WHEN t.tax_amount > 0 THEN p.liquid_cash - t.tax_amount ELSE p.liquid_cash END,
          tax_exempt_turns = GREATEST(0, p.tax_exempt_turns - 1)
      FROM tax t WHERE p.id = t.id
      RETURNING p.id, t.tax_amount, t.net_worth, p.tax_exempt_turns AS remaining_exempt
    `;

    const taxInserts = taxResults.filter(r => Number(r.tax_amount) > 0);
    if (taxInserts.length > 0) {
      const values = taxInserts.map(r => ({
        turn_number: turn,
        player_id: r.id,
        tx_type: 'WEALTH_TAX',
        amount: -Number(r.tax_amount),
        description: 'Impuesto progresivo (NW: $' + Math.round(Number(r.net_worth)) + ')',
      }));
      await sql`INSERT INTO transactions ${sql(values, 'turn_number', 'player_id', 'tx_type', 'amount', 'description')}`;
    }

    // ===== PHASE 5.5: IC ACCUMULATION & PATENT EXPIRATION =====
    // DATA_SCIENTIST generates +20% extra IC; log-1 +5%; log-2 +15%
    const baseIc = 30 + 2 * turn;
    const icRows = await sql`
      SELECT p.id,
        ${baseIc}::numeric
        * (1
            + CASE WHEN EXISTS (SELECT 1 FROM tech_unlocks tu WHERE tu.player_id = p.id AND tu.node_id = 'log-1') THEN 0.05 ELSE 0 END
            + CASE WHEN EXISTS (SELECT 1 FROM tech_unlocks tu WHERE tu.player_id = p.id AND tu.node_id = 'log-2') THEN 0.15 ELSE 0 END
          )
        * CASE p.player_role WHEN 'DATA_SCIENTIST' THEN 1.20 ELSE 1.0 END
        AS amount
      FROM players p
    `;
    for (const r of icRows) {
      const amt = Math.round(Number(r.amount) * 100) / 100;
      await sql`UPDATE players SET intellectual_capital = intellectual_capital + ${amt} WHERE id = ${r.id}`;
      await sql`INSERT INTO transactions (turn_number, player_id, tx_type, amount, description) VALUES (${turn}, ${r.id}, 'IC_GAIN', 0, ${'+' + amt + ' IC (Capital Intelectual)'})`;
    }

    // PATENT → OPEN_SOURCE after 10 turns
    const flipped = await sql`
      UPDATE tech_unlocks
      SET status = 'OPEN_SOURCE'
      WHERE status = 'PATENT' AND (${turn} - unlocked_at_turn) >= 10
      RETURNING node_id, player_id
    `;
    for (const f of flipped) {
      summary.events.push({ type: 'PATENT_EXPIRED', node_id: f.node_id, by: f.player_id });
    }

    // ===== PHASE 6: Chapter 11 check (bulk) =====
    const c11Rows = await sql`
      UPDATE players
      SET liquid_cash = liquid_cash + ${CONFIG.BANKRUPTCY_LIQUIDITY_INJECTION},
          bankrupt = TRUE,
          tax_exempt_turns = ${CONFIG.BANKRUPTCY_TAX_EXEMPT_TURNS}
      WHERE liquid_cash < 0 AND bankrupt = FALSE
      RETURNING id, username
    `;
    if (c11Rows.length > 0) {
      const values = c11Rows.map(r => ({
        turn_number: turn,
        player_id: r.id,
        tx_type: 'CHAPTER_11',
        amount: CONFIG.BANKRUPTCY_LIQUIDITY_INJECTION,
        description: 'Chapter 11: inyección de liquidez + 5 turnos exentos',
      }));
      await sql`INSERT INTO transactions ${sql(values, 'turn_number', 'player_id', 'tx_type', 'amount', 'description')}`;
      for (const r of c11Rows) summary.events.push({ type: 'CHAPTER_11', player_id: r.id, username: r.username });

      // Santi (PSYCHOLOGIST) collects $100 per bankruptcy (5% of $2000 injection)
      if (santiId) {
        const bankedNotSanti = c11Rows.filter(r => r.id !== santiId);
        if (bankedNotSanti.length > 0) {
          const commission = Math.round(CONFIG.BANKRUPTCY_LIQUIDITY_INJECTION * CONFIG.SANTI_THERAPY_RATE) * bankedNotSanti.length;
          await sql`UPDATE players SET liquid_cash = liquid_cash + ${commission} WHERE id = ${santiId}`;
          await sql`
            INSERT INTO transactions (turn_number, player_id, tx_type, amount, description)
            VALUES (${turn}, ${santiId}, 'THERAPY_FEE', ${commission},
              ${'Honorarios terapia: ' + bankedNotSanti.length + ' quiebra(s) en turno ' + turn})
          `;
          summary.events.push({ type: 'THERAPY_FEE', recipient: santiId, amount: commission });
        }
      }
    }

    // Recovery from bankruptcy
    const recoveredRows = await sql`
      UPDATE players SET bankrupt = FALSE
      WHERE liquid_cash >= 500 AND bankrupt = TRUE
      RETURNING id
    `;
    for (const r of recoveredRows) {
      const ach = await checkAndAwardAchievement('chapter11_survivor', r.id, turn);
      if (ach) summary.achievements.push({ id: 'chapter11_survivor', name: ach.name, winner: r.id, winnerName: usernameMap[r.id] });
    }

    // ===== FINALIZE =====
    await sql`
      INSERT INTO turn_log (turn_number, summary)
      VALUES (${turn}, ${sql.json(summary)})
      ON CONFLICT (turn_number) DO UPDATE SET summary = ${sql.json(summary)}, resolved_at = NOW()
    `;
    await sql`UPDATE game_state SET current_turn = current_turn + 1, locked = FALSE WHERE id = 1`;
  } catch (err) {
    await sql`UPDATE game_state SET locked = FALSE WHERE id = 1`;
    throw err;
  }

  return summary;
}
