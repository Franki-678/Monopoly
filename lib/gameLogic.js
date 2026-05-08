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
  BOARD_SIZE: 32,               // Casillas 0-31
  TRANSIT_RENT_RATE: 0.05,      // 5% del FMV cobrado al aterrizaje en corp ajena
  PSICOLOGO_FEE: 200,           // Tarifa fija de la casilla especial (El Psicólogo)
  STATE_TREASURY_FACTOR: 1.0,   // Factor de acumulación para el tesoro del Estado
};

// Mapa de casillas especiales del tablero (32 casillas)
export const BOARD_SPECIAL_SQUARES = {
  5:  'PRENDAS',       // castigo físico — aviso solo por Telegram
  10: 'PSICOLOGO',     // sesión $200 cobrada automáticamente
  15: 'PRENDAS',       // castigo físico — aviso solo por Telegram
  20: 'EL_ESTADO',     // El Estado: casillas bloqueadas por nivel
  25: 'PRENDAS',       // castigo físico
  30: 'MERCADO_NEGRO', // Nissai: descuento especial
};

// Umbrales de nivel (basados en IC gastado acumulado)
export const LEVEL_THRESHOLDS = [
  0,       // L1 — todos
  500,     // L2
  1500,    // L3
  3000,    // L4
  6000,    // L5
  12000,   // L6
  25000,   // L7
  50000,   // L8
  100000,  // L9
  200000,  // L10
];

// ── MARKET HOURS (09:00–23:59 ART = UTC-3, no DST) ──
export const MARKET_OPEN_HOUR = 9;
export function isMarketOpen() {
  const now = new Date();
  const artHour = ((now.getUTCHours() - 3) + 24) % 24;
  return artHour >= MARKET_OPEN_HOUR;
}

export function computeLevel(totalIcSpent) {
  let level = 1;
  for (let i = 1; i < LEVEL_THRESHOLDS.length; i++) {
    if (totalIcSpent >= LEVEL_THRESHOLDS[i]) level = i + 1;
    else break;
  }
  return level;
}

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

// ============ EL REY NISSAI — DARK MARKET ============
export const NISSAI_CATALOG = [
  {
    id: 'AUDIT', name: 'Auditoría Sorpresa', emoji: '🕵️',
    desc: 'El objetivo paga el doble de su wealth tax del turno anterior. Inmediato.',
    flavor: 'mandó al fisco a revisarle la billetera',
    cost_ic: 200, cost_cash: 0, target: 'PLAYER',
  },
  {
    id: 'HACK', name: 'Hackeo de Servidores', emoji: '💻',
    desc: 'Robás el 30% del IC ACTUAL del objetivo (mín 50, máx 500 IC). El IC robado te lo quedás vos. Inmediato.',
    flavor: 'le hackeó los servidores a plena luz del día',
    cost_ic: 150, cost_cash: 0, target: 'PLAYER',
  },
  {
    id: 'BLACKOUT', name: 'Corte de Luz', emoji: '⚡',
    desc: 'Los dividendos de una corporación completa se anulan este turno.',
    flavor: 'cortó el suministro eléctrico del datacenter',
    cost_ic: 0, cost_cash: 600, target: 'CORP',
  },
  {
    id: 'RUMOR', name: 'Rumor Bajista', emoji: '📰',
    desc: 'La corp CEO principal del objetivo cae −10% de FMV. Inmediato.',
    flavor: 'esparció un rumor que hundió el mercado',
    cost_ic: 200, cost_cash: 0, target: 'PLAYER',
  },
  {
    id: 'FISCO', name: 'Filtración al Fisco', emoji: '📋',
    desc: 'El objetivo pierde 3 turnos de exención impositiva. Inmediato.',
    flavor: 'lo entregó al fisco como chivo expiatorio',
    cost_ic: 350, cost_cash: 0, target: 'PLAYER',
  },
];

// Resolución en Phase 0.5 — returns blackedOutCorps[] para Phase 2.5
export async function resolveNissaiOrders(sql, turn, incMult, usernameMap, summary) {
  const orders = await sql`
    SELECT n.*,
      ap.username AS attacker_username,
      tp.username AS target_username, tp.intellectual_capital AS target_ic,
      tc.name AS target_corp_name, tc.fair_market_value AS target_corp_fmv
    FROM nissai_orders n
    LEFT JOIN players ap ON ap.id = n.attacker_id
    LEFT JOIN players tp ON tp.id = n.target_player_id
    LEFT JOIN corporations tc ON tc.id = n.target_corp_id
    WHERE n.turn_number = ${turn} AND n.status = 'PENDING'
    ORDER BY n.created_at ASC
  `;
  if (orders.length === 0) return { nissaiResults: [], blackedOutCorps: [] };

  const nissaiResults  = [];
  const blackedOutCorps = [];

  for (const o of orders) {
    let resultNote = '';
    try {
      if (o.sabotage_type === 'AUDIT') {
        const [lastTaxRow] = await sql`
          SELECT COALESCE(SUM(ABS(amount)), 200) AS total
          FROM transactions
          WHERE player_id = ${o.target_player_id} AND turn_number = ${turn - 1} AND tx_type = 'WEALTH_TAX' AND amount < 0
        `;
        const extra = Math.max(100, Math.round(Number(lastTaxRow.total) * 100) / 100);
        await sql`UPDATE players SET liquid_cash = liquid_cash - ${extra} WHERE id = ${o.target_player_id}`;
        await sql`
          INSERT INTO transactions (turn_number, player_id, tx_type, amount, description)
          VALUES (${turn}, ${o.target_player_id}, 'WEALTH_TAX', ${-extra},
            '🕵️ Auditoría Sorpresa (agente anónimo): cargo impositivo adicional')
        `;
        resultNote = `Auditado: -$${extra.toFixed(0)} extra`;
        nissaiResults.push({ type: 'AUDIT', attacker: o.attacker_username, target: o.target_username, amount: extra });

      } else if (o.sabotage_type === 'HACK') {
        const currentIc = Number(o.target_ic || 0);
        const stolen = Math.min(500, Math.max(50, Math.round(currentIc * 0.30)));
        const actualStolen = Math.min(stolen, currentIc);
        if (actualStolen > 0) {
          await sql`UPDATE players SET intellectual_capital = intellectual_capital - ${actualStolen} WHERE id = ${o.target_player_id}`;
          await sql`UPDATE players SET intellectual_capital = intellectual_capital + ${actualStolen} WHERE id = ${o.attacker_id}`;
          await sql`INSERT INTO transactions (turn_number, player_id, tx_type, amount, description) VALUES (${turn}, ${o.target_player_id}, 'IC_GAIN', 0, ${'💻 Hack: -' + actualStolen.toFixed(0) + ' IC robado por agente anónimo'})`;
          await sql`INSERT INTO transactions (turn_number, player_id, tx_type, amount, description) VALUES (${turn}, ${o.attacker_id}, 'IC_GAIN', 0, ${'💻 Hack exitoso a ' + o.target_username + ': +' + actualStolen.toFixed(0) + ' IC'})`;
        }
        resultNote = `Hack: ${actualStolen.toFixed(0)} IC robado`;
        nissaiResults.push({ type: 'HACK', attacker: o.attacker_username, target: o.target_username, amount: actualStolen });

      } else if (o.sabotage_type === 'BLACKOUT') {
        if (o.target_corp_id && o.target_corp_name) {
          blackedOutCorps.push({ corpId: o.target_corp_id, corpName: o.target_corp_name, attackerUsername: o.attacker_username });
          resultNote = `Corte de Luz en ${o.target_corp_name}: dividendos anulados`;
          nissaiResults.push({ type: 'BLACKOUT', attacker: o.attacker_username, corp: o.target_corp_name, totalDamage: 0 });
        }

      } else if (o.sabotage_type === 'RUMOR') {
        const [topCorp] = await sql`
          SELECT id, name, fair_market_value FROM corporations
          WHERE ceo_player_id = ${o.target_player_id}
          ORDER BY fair_market_value DESC LIMIT 1
        `;
        if (topCorp) {
          const newFmv = Math.max(Number(topCorp.fair_market_value) * 0.10,
            Math.round(Number(topCorp.fair_market_value) * 0.90 * 100) / 100);
          await sql`UPDATE corporations SET fair_market_value = ${newFmv} WHERE id = ${topCorp.id}`;
          resultNote = `Rumor: ${topCorp.name} FMV -10%`;
          nissaiResults.push({ type: 'RUMOR', attacker: o.attacker_username, target: o.target_username, corp: topCorp.name, fmvDrop: Number(topCorp.fair_market_value) - newFmv });
        } else {
          // Refund si el target no tiene CEO corp
          await sql`UPDATE players SET intellectual_capital = intellectual_capital + ${o.cost_ic} WHERE id = ${o.attacker_id}`;
          resultNote = 'Rumor sin efecto: objetivo sin corps CEO (IC reembolsado)';
          nissaiResults.push({ type: 'RUMOR', attacker: o.attacker_username, target: o.target_username, corp: null, fmvDrop: 0 });
        }

      } else if (o.sabotage_type === 'FISCO') {
        await sql`UPDATE players SET tax_exempt_turns = GREATEST(0, tax_exempt_turns - 3) WHERE id = ${o.target_player_id}`;
        await sql`INSERT INTO transactions (turn_number, player_id, tx_type, amount, description) VALUES (${turn}, ${o.target_player_id}, 'WEALTH_TAX', 0, '📋 Filtración al Fisco (anónimo): -3 turnos de exención')`;
        resultNote = `Fisco: 3 exenciones eliminadas de ${o.target_username}`;
        nissaiResults.push({ type: 'FISCO', attacker: o.attacker_username, target: o.target_username });
      }

      await sql`UPDATE nissai_orders SET status = 'EXECUTED', result_note = ${resultNote} WHERE id = ${o.id}`;
    } catch (err2) {
      await sql`UPDATE nissai_orders SET status = 'FAILED', result_note = ${'Error: ' + err2.message} WHERE id = ${o.id}`;
    }
  }

  summary.nissaiResults = nissaiResults;
  return { nissaiResults, blackedOutCorps };
}

// ============ CASINO DE MEDIANOCHE ============
// Mission 5 rebalance: 60% LOSE, 18% WIN, 18% SMALL_WIN, 4% JACKPOT
const CASINO_OUTCOMES = [
  { result: 'JACKPOT', mult: 6.0, label: '🎰 JACKPOT ×6',   prob: 0.04 },
  { result: 'WIN',     mult: 2.5, label: '💰 WIN ×2.5',     prob: 0.18 },
  { result: 'SMALL',   mult: 1.5, label: '✨ SMALL ×1.5',   prob: 0.18 },
  { result: 'LOSE',    mult: 0.0, label: '💀 PERDISTE TODO', prob: 0.60 },
];

export async function resolveCasinoBets(sql, turn, usernameMap, summary) {
  const bets = await sql`
    SELECT cb.*, p.username
    FROM casino_bets cb
    JOIN players p ON p.id = cb.player_id
    WHERE cb.turn_number = ${turn} AND cb.resolved = FALSE
  `;
  if (bets.length === 0) return [];

  const casinoResults = [];
  for (const bet of bets) {
    const rand = Math.random();
    let cumProb = 0, outcome = CASINO_OUTCOMES[CASINO_OUTCOMES.length - 1];
    for (const o of CASINO_OUTCOMES) {
      cumProb += o.prob;
      if (rand < cumProb) { outcome = o; break; }
    }
    const betAmount = Number(bet.bet_amount);
    const payout    = Math.round(betAmount * outcome.mult * 100) / 100;
    const net       = payout - betAmount; // profit/loss on top of already-deducted stake

    if (payout > 0) {
      await sql`UPDATE players SET liquid_cash = liquid_cash + ${payout} WHERE id = ${bet.player_id}`;
      await sql`INSERT INTO transactions (turn_number, player_id, tx_type, amount, description) VALUES (${turn}, ${bet.player_id}, 'CASINO', ${payout}, ${'🎰 Casino ' + outcome.label + ': devuelto $' + payout.toFixed(0)})`;
    }
    // If LOSE: payout=0, cash was already deducted on bet placement — nothing more to do

    await sql`UPDATE casino_bets SET resolved = TRUE, result = ${outcome.result}, payout = ${payout} WHERE id = ${bet.id}`;
    casinoResults.push({ player: bet.username, player_id: bet.player_id, betAmount, result: outcome.result, label: outcome.label, payout, net });
  }

  summary.casinoResults = casinoResults;
  return casinoResults;
}

// ============ CONTRATOS DE BOUNTY P2P ============
export async function resolveBountyContracts(sql, turn, usernameMap, summary) {
  // Expire old contracts
  await sql`
    UPDATE bounty_contracts SET status = 'EXPIRED'
    WHERE status = 'ACTIVE' AND (${turn} - placed_at_turn) >= turns_to_expire
  `;

  // Check if any active-contract targets went bankrupt this turn (chapter 11 triggered)
  const c11PlayerIds = (summary.events || [])
    .filter(e => e.type === 'CHAPTER_11')
    .map(e => e.player_id);

  if (c11PlayerIds.length === 0) return [];
  const bountyResults = [];

  for (const victimId of c11PlayerIds) {
    // Find all active bounties on this target
    const bounties = await sql`
      SELECT bc.*, pp.username AS poster_username
      FROM bounty_contracts bc
      JOIN players pp ON pp.id = bc.poster_id
      WHERE bc.target_id = ${victimId} AND bc.status = 'ACTIVE'
      ORDER BY bc.created_at ASC
    `;
    if (bounties.length === 0) continue;

    // The largest poster wins the glory (they put the most money on the line)
    const topBounty = bounties.reduce((a, b) => Number(a.reward_cash) >= Number(b.reward_cash) ? a : b);
    const reward = Number(topBounty.reward_cash);

    // Pay the poster (they already locked up the reward_cash when posting)
    // The reward_cash was deducted when the bounty was posted, now we release it × 2 as winner bonus
    const prize = reward * 2;
    await sql`UPDATE players SET liquid_cash = liquid_cash + ${prize} WHERE id = ${topBounty.poster_id}`;
    await sql`
      INSERT INTO transactions (turn_number, player_id, tx_type, amount, description)
      VALUES (${turn}, ${topBounty.poster_id}, 'ACHIEVEMENT', ${prize},
        ${'🏴‍☠️ Bounty cobrado: ' + usernameMap[victimId] + ' fue al Capítulo 11 (+$' + prize.toFixed(0) + ')'})
    `;

    // Mark all bounties on this target as claimed
    await sql`
      UPDATE bounty_contracts
      SET status = 'CLAIMED', claimed_by = ${topBounty.poster_id}, claimed_at_turn = ${turn}
      WHERE target_id = ${victimId} AND status = 'ACTIVE'
    `;

    // Refund non-winning posters their stake
    const otherPosters = bounties.filter(b => b.poster_id !== topBounty.poster_id);
    for (const b of otherPosters) {
      await sql`UPDATE players SET liquid_cash = liquid_cash + ${b.reward_cash} WHERE id = ${b.poster_id}`;
    }

    bountyResults.push({
      type: 'BOUNTY_CLAIMED',
      victim: usernameMap[victimId] || victimId,
      claimedBy: topBounty.poster_username,
      prize,
      otherPosters: otherPosters.length,
    });
  }

  summary.bountyResults = bountyResults;
  return bountyResults;
}

// ============ GLOBAL EVENTS ============
// Fires at end of each turn with 40% probability.
// Each event targets either a DISTRICT (all corps in that zone) or ALL corps.

const GLOBAL_EVENTS = [
  // District booms
  { id: 'zona_sur_boom',        type: 'DISTRICT_FMV', district: 'Zona Sur',        pct: 0.12,  label: '🏗️ BOOM EN ZONA SUR',        desc: 'La renovación urbana disparó el valor de las corps del barrio.' },
  { id: 'centro_crack',         type: 'DISTRICT_FMV', district: 'Centro',          pct: -0.10, label: '📉 CRACK EN EL CENTRO',        desc: 'Sobreoferta en el Centro. Los FMV caen.' },
  { id: 'industrial_huelga',    type: 'DISTRICT_FMV', district: 'Zona Industrial', pct: -0.08, label: '⚡ HUELGA ZONA INDUSTRIAL',     desc: 'Paro de operarios. Las industriales pierden valor.' },
  { id: 'neon_rave',            type: 'DISTRICT_FMV', district: 'Distrito Neón',   pct: 0.15,  label: '🌟 FESTIVAL NEÓN',             desc: 'El festival anual estalló. Las corps del Neón suben fuerte.' },
  { id: 'puerto_contrabando',   type: 'DISTRICT_FMV', district: 'Puerto',          pct: 0.10,  label: '🚢 CONTRABANDO EN EL PUERTO', desc: 'El mercado informal infló los valores portuarios.' },
  { id: 'zona_alta_crash',      type: 'DISTRICT_FMV', district: 'Zona Alta',       pct: -0.12, label: '💎 DEBACLE EN LA ZONA ALTA',   desc: 'Los ricos se asustaron y vendieron todo.' },
  { id: 'arte_galeria',         type: 'DISTRICT_FMV', district: 'Distrito Arte',   pct: 0.09,  label: '🎨 GALERÍA VIRAL',             desc: 'Una colección viral valorizó el barrio.' },
  { id: 'norte_incendio',       type: 'DISTRICT_FMV', district: 'Zona Norte',      pct: -0.07, label: '🔥 INCENDIO ZONA NORTE',       desc: 'Cobertura mediática negativa, los FMVs retroceden.' },
  // Macro events
  { id: 'macro_bull',           type: 'ALL_FMV',      district: null,              pct: 0.07,  label: '🐂 MERCADO ALCISTA GLOBAL',   desc: 'Ciclo expansivo. Todos los FMVs suben un 7%.' },
  { id: 'macro_bear',           type: 'ALL_FMV',      district: null,              pct: -0.07, label: '🐻 MERCADO BAJISTA GLOBAL',   desc: 'Recesión técnica. Todos los FMVs bajan un 7%.' },
  { id: 'macro_ic_boom',        type: 'IC_BONUS',     district: null,              pct: 0.30,  label: '🧠 BOOM TECNOLÓGICO GLOBAL',  desc: 'Ola de innovación: todos reciben +30% de IC este turno.' },
  { id: 'macro_tax_holiday',    type: 'TAX_REFUND',   district: null,              pct: 0.50,  label: '🎁 FERIADO IMPOSITIVO',       desc: 'El gobierno devuelve la mitad del impuesto del turno anterior a todos.' },
];

export async function maybeFireGlobalEvent(sql, turn, summary) {
  // 40% de probabilidad por turno
  if (Math.random() > 0.40) return null;

  // No repetir el mismo evento en los últimos 5 turnos
  const recentRows = await sql`
    SELECT summary->>'globalEvent' AS ev
    FROM turn_log
    WHERE turn_number >= ${turn - 5} AND summary ? 'globalEvent'
  `;
  const recentIds = new Set(recentRows.map(r => r.ev ? JSON.parse(r.ev)?.id : null).filter(Boolean));
  const pool = GLOBAL_EVENTS.filter(e => !recentIds.has(e.id));
  if (pool.length === 0) return null;

  const ev = pool[Math.floor(Math.random() * pool.length)];

  if (ev.type === 'DISTRICT_FMV') {
    // Ajustar FMV de todas las corps del distrito
    const corps = await sql`
      SELECT id, fair_market_value FROM corporations
      WHERE district = ${ev.district}
    `;
    for (const c of corps) {
      const newFmv = Math.max(
        Number(c.fair_market_value) * 0.1,
        Math.round(Number(c.fair_market_value) * (1 + ev.pct) * 100) / 100
      );
      await sql`UPDATE corporations SET fair_market_value = ${newFmv} WHERE id = ${c.id}`;
      // Registrar en fmv_changes para el Telegram summary
      const prev = summary.fmv_changes[c.id] || { from: Number(c.fair_market_value), to: Number(c.fair_market_value) };
      summary.fmv_changes[c.id] = { from: prev.from, to: newFmv };
    }

  } else if (ev.type === 'ALL_FMV') {
    const corps = await sql`SELECT id, name, fair_market_value FROM corporations`;
    for (const c of corps) {
      const newFmv = Math.max(
        Number(c.fair_market_value) * 0.1,
        Math.round(Number(c.fair_market_value) * (1 + ev.pct) * 100) / 100
      );
      await sql`UPDATE corporations SET fair_market_value = ${newFmv} WHERE id = ${c.id}`;
      if (!summary.fmv_changes[c.name]) {
        summary.fmv_changes[c.name] = { from: Number(c.fair_market_value), to: newFmv };
      }
    }

  } else if (ev.type === 'IC_BONUS') {
    const players = await sql`SELECT id FROM players`;
    for (const p of players) {
      // Calcular el IC que iban a recibir (aproximado, sin tech) y agregar bonus
      const baseIc  = Math.round((30 + 2 * turn) * ev.pct * 100) / 100;
      await sql`UPDATE players SET intellectual_capital = intellectual_capital + ${baseIc} WHERE id = ${p.id}`;
      await sql`
        INSERT INTO transactions (turn_number, player_id, tx_type, amount, description)
        VALUES (${turn}, ${p.id}, 'IC_GAIN', 0, ${'🌐 Evento global: ' + ev.label + ' (+' + baseIc + ' IC bonus)'})
      `;
    }

  } else if (ev.type === 'TAX_REFUND') {
    // Devolver la mitad del wealth tax del turno anterior a cada jugador
    const taxRows = await sql`
      SELECT player_id, SUM(amount) AS total_tax
      FROM transactions
      WHERE turn_number = ${turn - 1} AND tx_type = 'WEALTH_TAX'
      GROUP BY player_id
    `;
    for (const r of taxRows) {
      const refund = Math.round(Math.abs(Number(r.total_tax)) * 0.5 * 100) / 100;
      if (refund > 0) {
        await sql`UPDATE players SET liquid_cash = liquid_cash + ${refund} WHERE id = ${r.player_id}`;
        await sql`
          INSERT INTO transactions (turn_number, player_id, tx_type, amount, description)
          VALUES (${turn}, ${r.player_id}, 'WEALTH_TAX', ${refund},
            ${'🌐 Reembolso feriado impositivo (50% tax T' + (turn - 1) + ')'})
        `;
      }
    }
  }

  return { id: ev.id, type: ev.type, label: ev.label, desc: ev.desc, district: ev.district, pct: ev.pct };
}

// ============ TECH ORDERS — WEGO QUEUE RESOLUTION (Phase 5.6) ============
export async function resolveTechOrders(sql, turn, usernameMap, summary) {
  const pending = await sql`
    SELECT tord.*, tn.name AS node_name, tn.branch, tn.tier, tn.prereq_id, tn.required_role,
      p.player_role
    FROM tech_orders tord
    JOIN tech_nodes tn ON tn.id = tord.node_id
    JOIN players p ON p.id = tord.player_id
    WHERE tord.turn_number = ${turn} AND tord.status = 'PENDING'
    ORDER BY tord.created_at ASC
  `;
  if (pending.length === 0) return [];

  const nodeClaims  = {};  // nodeId → playerId of patent winner this turn
  const techResults = [];

  for (const o of pending) {
    const nodeId   = o.node_id;
    const playerId = o.player_id;

    // Check prereq fulfilled
    if (o.prereq_id) {
      const [prereq] = await sql`SELECT id FROM tech_unlocks WHERE player_id = ${playerId} AND node_id = ${o.prereq_id}`;
      if (!prereq) {
        await sql`UPDATE players SET intellectual_capital = intellectual_capital + ${o.ic_paid} WHERE id = ${playerId}`;
        await sql`UPDATE tech_orders SET status = 'REJECTED', result_note = 'Prerequisito no cumplido — IC reembolsado' WHERE id = ${o.id}`;
        techResults.push({ type: 'TECH_REJECTED', player: usernameMap[playerId], node: o.node_name, reason: 'prereq' });
        continue;
      }
    }

    // Already unlocked? refund
    const [existing] = await sql`SELECT id FROM tech_unlocks WHERE player_id = ${playerId} AND node_id = ${nodeId}`;
    if (existing) {
      await sql`UPDATE players SET intellectual_capital = intellectual_capital + ${o.ic_paid} WHERE id = ${playerId}`;
      await sql`UPDATE tech_orders SET status = 'REJECTED', result_note = 'Ya desbloqueado — IC reembolsado' WHERE id = ${o.id}`;
      continue;
    }

    // Role check for personal branch
    if (o.required_role && o.required_role !== o.player_role) {
      await sql`UPDATE players SET intellectual_capital = intellectual_capital + ${o.ic_paid} WHERE id = ${playerId}`;
      await sql`UPDATE tech_orders SET status = 'REJECTED', result_note = 'Rol incorrecto — IC reembolsado' WHERE id = ${o.id}`;
      continue;
    }

    // WEGO conflict: another player already claimed patent this same turn (FIFO)
    if (nodeClaims[nodeId] && nodeClaims[nodeId] !== playerId) {
      await sql`UPDATE players SET intellectual_capital = intellectual_capital + ${o.ic_paid} WHERE id = ${playerId}`;
      await sql`UPDATE tech_orders SET status = 'REJECTED', result_note = ${'Patente ganada por ' + (usernameMap[nodeClaims[nodeId]] || '?') + ' (FIFO) — IC reembolsado'} WHERE id = ${o.id}`;
      techResults.push({ type: 'TECH_CONFLICT', player: usernameMap[playerId], node: o.node_name, winner: usernameMap[nodeClaims[nodeId]] });
      continue;
    }

    // Pre-existing patent blocks non-BEN players
    const [globalState] = await sql`
      SELECT BOOL_OR(status = 'PATENT') AS has_patent, BOOL_OR(status = 'OPEN_SOURCE') AS is_os
      FROM tech_unlocks WHERE node_id = ${nodeId}
    `;
    const existingPatent = globalState?.has_patent && !globalState?.is_os;
    const isOs = globalState?.is_os || false;
    const isBen = o.player_role === 'SYSTEMS_ENGINEER';

    if (!isBen && existingPatent) {
      await sql`UPDATE players SET intellectual_capital = intellectual_capital + ${o.ic_paid} WHERE id = ${playerId}`;
      await sql`UPDATE tech_orders SET status = 'REJECTED', result_note = 'Patente exclusiva ajena — IC reembolsado' WHERE id = ${o.id}`;
      techResults.push({ type: 'TECH_BLOCKED', player: usernameMap[playerId], node: o.node_name });
      continue;
    }

    // Grant unlock
    const isPersonalNode = /^(ds|ec|ps|se|me)-/.test(nodeId);
    const newStatus = (isPersonalNode || (!isOs && !isBen)) ? 'PATENT' : 'OPEN_SOURCE';

    await sql`
      INSERT INTO tech_unlocks (player_id, node_id, unlocked_at_turn, cost_paid, status)
      VALUES (${playerId}, ${nodeId}, ${turn}, ${o.ic_paid}, ${newStatus})
      ON CONFLICT (player_id, node_id) DO NOTHING
    `;
    await sql`UPDATE players SET total_ic_spent = COALESCE(total_ic_spent, 0) + ${o.ic_paid} WHERE id = ${playerId}`;
    await sql`
      INSERT INTO transactions (turn_number, player_id, tx_type, amount, description)
      VALUES (${turn}, ${playerId}, 'TECH_UNLOCK', 0, ${'⚗️ Tech: ' + o.node_name + ' (' + (newStatus === 'PATENT' ? 'Patente 🔐' : 'Open Source 🌐') + ')'})
    `;

    if (newStatus === 'PATENT') nodeClaims[nodeId] = playerId;

    await sql`UPDATE tech_orders SET status = 'EXECUTED', result_note = ${newStatus === 'PATENT' ? 'Patente adquirida' : 'Open Source desbloqueado'} WHERE id = ${o.id}`;

    if (o.tier >= 2) await checkAndAwardAchievement('tier2_tech', playerId, turn);

    techResults.push({ type: 'TECH_UNLOCKED', player: usernameMap[playerId], node: o.node_name, status: newStatus });
  }

  summary.techResults = techResults;
  return techResults;
}

// ============ ORÁCULO DEL MERCADO — IC PREDICTIONS (Phase 7.8) ============
// Win: direction matches FMV move ≥ 0.5% → 2.2× IC
// Tie: |FMV change| < 0.5% → full refund
// Loss: wrong direction → IC lost (already deducted at bet time)
export async function resolveIcPredictions(sql, turn, usernameMap, summary) {
  const preds = await sql`
    SELECT ip.*, c.fair_market_value AS current_fmv, c.name AS corp_name
    FROM ic_predictions ip
    JOIN corporations c ON c.id = ip.corp_id
    WHERE ip.turn_number = ${turn} AND ip.resolved = FALSE
  `;
  if (preds.length === 0) return [];

  const oracleResults = [];

  for (const p of preds) {
    const fmvAtBet   = Number(p.fmv_at_bet);
    const currentFmv = Number(p.current_fmv);
    const icBet      = Number(p.ic_bet);
    const pctChange  = fmvAtBet > 0 ? (currentFmv - fmvAtBet) / fmvAtBet : 0;

    let won = null, payoutIc = 0, resultLabel = 'TIE';

    if (Math.abs(pctChange) < 0.005) {
      // Tie < 0.5% change — full refund
      payoutIc = icBet;
      resultLabel = 'TIE';
    } else {
      const wentUp = currentFmv > fmvAtBet;
      won = (p.direction === 'UP' && wentUp) || (p.direction === 'DOWN' && !wentUp);
      if (won) {
        payoutIc   = Math.round(icBet * 2.2);
        resultLabel = 'WIN';
      } else {
        payoutIc   = 0;
        resultLabel = 'LOSS';
      }
    }

    if (payoutIc > 0) {
      await sql`UPDATE players SET intellectual_capital = intellectual_capital + ${payoutIc} WHERE id = ${p.player_id}`;
      await sql`
        INSERT INTO transactions (turn_number, player_id, tx_type, amount, description)
        VALUES (${turn}, ${p.player_id}, 'IC_GAIN', 0,
          ${'🔮 Oráculo ' + resultLabel + ': ' + p.corp_name + ' (' + p.direction + ') → +' + payoutIc + ' IC'})
      `;
    } else if (resultLabel === 'LOSS') {
      await sql`
        INSERT INTO transactions (turn_number, player_id, tx_type, amount, description)
        VALUES (${turn}, ${p.player_id}, 'IC_GAIN', 0,
          ${'🔮 Oráculo LOSS: ' + p.corp_name + ' (' + p.direction + ') → -' + icBet + ' IC perdido'})
      `;
    }

    await sql`UPDATE ic_predictions SET resolved = TRUE, won = ${won}, payout_ic = ${payoutIc} WHERE id = ${p.id}`;

    oracleResults.push({
      player:    usernameMap[p.player_id],
      player_id: p.player_id,
      corp:      p.corp_name,
      direction: p.direction,
      icBet, fmvAtBet, currentFmv,
      pctChange: Math.round(pctChange * 10000) / 100,
      result:    resultLabel,
      payoutIc,
    });
  }

  summary.oracleResults = oracleResults;
  return oracleResults;
}

// ============ LOBBY POLÍTICO — IC SINK (Phase 6.5) ============
// LOBBY_BULL  (200 IC): selected corp gets +8% FMV bump next resolution — public
// LOBBY_BEAR  (300 IC): selected corp gets -8% FMV drop — public, can target rivals
// LOBBY_TAX_BREAK (350 IC): player gets +2 turns tax exemption — public
export const LOBBY_CATALOG = [
  { id: 'LOBBY_BULL',      name: 'Pump Mediático',   emoji: '📣', desc: 'Tu corp elegida sube +8% FMV al cierre del turno. Visible para todos.',                 ic_cost: 200, target: 'CORP' },
  { id: 'LOBBY_BEAR',      name: 'Short Institucional', emoji: '🐻', desc: 'Cualquier corp baja -8% FMV al cierre del turno. Visible para todos.',               ic_cost: 300, target: 'CORP' },
  { id: 'LOBBY_TAX_BREAK', name: 'Exención Fiscal',  emoji: '🏛️', desc: '+2 turnos de exención impositiva. Se revela en el gossip feed del turno siguiente.',    ic_cost: 350, target: 'SELF' },
];

export async function resolveLobbyActions(sql, turn, usernameMap, summary) {
  const lobbies = await sql`
    SELECT il.*, p.username, c.name AS corp_name, c.fair_market_value AS corp_fmv
    FROM ic_lobbies il
    JOIN players p ON p.id = il.player_id
    LEFT JOIN corporations c ON c.id = il.corp_id
    WHERE il.turn_number = ${turn} AND il.resolved = FALSE
    ORDER BY il.created_at ASC
  `;
  if (lobbies.length === 0) return [];

  const lobbyResults = [];

  for (const l of lobbies) {
    let effectApplied = '';
    try {
      if (l.lobby_type === 'LOBBY_BULL' && l.corp_id) {
        const fmv = Number(l.corp_fmv || 0);
        const newFmv = Math.round(fmv * 1.08 * 100) / 100;
        await sql`UPDATE corporations SET fair_market_value = ${newFmv} WHERE id = ${l.corp_id}`;
        effectApplied = `${l.corp_name} FMV +8%: $${fmv.toFixed(0)} → $${newFmv.toFixed(0)}`;
        lobbyResults.push({ type: 'LOBBY_BULL', player: usernameMap[l.player_id], corp: l.corp_name, fmvDelta: newFmv - fmv });
        await sql`INSERT INTO transactions (turn_number, player_id, tx_type, amount, description) VALUES (${turn}, ${l.player_id}, 'IC_GAIN', 0, ${'📣 Lobby Pump: ' + l.corp_name + ' +8% FMV'})`;
      } else if (l.lobby_type === 'LOBBY_BEAR' && l.corp_id) {
        const fmv = Number(l.corp_fmv || 0);
        const newFmv = Math.max(fmv * 0.1, Math.round(fmv * 0.92 * 100) / 100);
        await sql`UPDATE corporations SET fair_market_value = ${newFmv} WHERE id = ${l.corp_id}`;
        effectApplied = `${l.corp_name} FMV -8%: $${fmv.toFixed(0)} → $${newFmv.toFixed(0)}`;
        lobbyResults.push({ type: 'LOBBY_BEAR', player: usernameMap[l.player_id], corp: l.corp_name, fmvDelta: newFmv - fmv });
        await sql`INSERT INTO transactions (turn_number, player_id, tx_type, amount, description) VALUES (${turn}, ${l.player_id}, 'IC_GAIN', 0, ${'🐻 Lobby Short: ' + l.corp_name + ' -8% FMV'})`;
      } else if (l.lobby_type === 'LOBBY_TAX_BREAK') {
        await sql`UPDATE players SET tax_exempt_turns = COALESCE(tax_exempt_turns, 0) + 2 WHERE id = ${l.player_id}`;
        effectApplied = `+2 turnos exención fiscal`;
        lobbyResults.push({ type: 'LOBBY_TAX_BREAK', player: usernameMap[l.player_id] });
        await sql`INSERT INTO transactions (turn_number, player_id, tx_type, amount, description) VALUES (${turn}, ${l.player_id}, 'IC_GAIN', 0, '🏛️ Lobby Exención Fiscal: +2 turnos')`;
      }
      await sql`UPDATE ic_lobbies SET resolved = TRUE, effect_applied = ${effectApplied} WHERE id = ${l.id}`;
    } catch (e) {
      await sql`UPDATE ic_lobbies SET resolved = TRUE, effect_applied = ${'ERROR: ' + e.message} WHERE id = ${l.id}`;
    }
  }

  summary.lobbyResults = lobbyResults;
  return lobbyResults;
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

    // ===== PHASE 0.5: NISSAI DARK MARKET RESOLUTION =====
    const { blackedOutCorps } = await resolveNissaiOrders(sql, turn, incMult, usernameMap, summary);

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
            const rent = Math.round(Number(landedCorp.fair_market_value) * CONFIG.TRANSIT_RENT_RATE * 100) / 100;

            // Alliance rent exemption: if the landing player is allied with ANY shareholder, skip rent
            let allianceExempt = false;
            if (others.length > 0 && rent > 0) {
              const shareholderIds = others.map(o => o.player_id);
              const allianceCheck = await sql`
                SELECT id FROM alliances
                WHERE status = 'ACTIVE'
                  AND (
                    (proposer_id = ${roll.player_id} AND recipient_id = ANY(${shareholderIds}))
                    OR (recipient_id = ${roll.player_id} AND proposer_id = ANY(${shareholderIds}))
                  )
                LIMIT 1
              `;
              if (allianceCheck.length > 0) {
                allianceExempt = true;
                summary.events.push({ type: 'ALLIANCE_RENT_EXEMPT', player_id: roll.player_id, username: pl.username, corp: landedCorp.name, rent, position: newPos });
              }
            }

            if (others.length > 0 && rent > 0 && !allianceExempt) {
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
            } else if (others.length === 0 && rent > 0 && Number(landedCorp.board_position) >= 20) {
              // Corp en casilla avanzada sin accionistas → renta va al Tesoro del Estado
              await sql`UPDATE players SET liquid_cash = liquid_cash - ${rent} WHERE id = ${roll.player_id}`;
              await sql`UPDATE game_state SET state_treasury = COALESCE(state_treasury, 0) + ${rent} WHERE id = 1`;
              await sql`
                INSERT INTO transactions (turn_number, player_id, tx_type, amount, description)
                VALUES (${turn}, ${roll.player_id}, 'TRANSIT_RENT', ${-rent},
                  ${'Tránsito estatal: aterrizó en ' + landedCorp.name + ' (Tesoro del Estado)'})
              `;
              summary.events.push({ type: 'STATE_RENT', player_id: roll.player_id, username: pl.username, corp: landedCorp.name, rent, position: newPos });
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

    // ===== PHASE 2.5: BLACKOUT REVERSAL (Nissai — Corte de Luz) =====
    // Reverse dividends for corps that were blacked out this turn
    for (const { corpId, corpName, attackerUsername } of blackedOutCorps) {
      // Match dividend transactions inserted in Phase 2 for this corp
      const divTxs = await sql`
        SELECT player_id, ABS(amount)::numeric AS amt
        FROM transactions
        WHERE turn_number = ${turn}
          AND tx_type = 'DIVIDEND'
          AND description LIKE ${'Dividendo ' + corpName + '%'}
      `;
      let totalBlacked = 0;
      for (const d of divTxs) {
        const amt = Math.round(Number(d.amt) * 100) / 100;
        if (amt > 0) {
          await sql`UPDATE players SET liquid_cash = liquid_cash - ${amt} WHERE id = ${d.player_id}`;
          await sql`
            INSERT INTO transactions (turn_number, player_id, tx_type, amount, description)
            VALUES (${turn}, ${d.player_id}, 'DIVIDEND', ${-amt},
              ${'⚡ Corte de Luz: dividendo de ' + corpName + ' anulado (Nissai)'})
          `;
          totalBlacked += amt;
        }
      }
      // Patch totalDamage into nissaiResults for the Telegram summary
      if (summary.nissaiResults) {
        const r = summary.nissaiResults.find(x => x.type === 'BLACKOUT' && x.corp === corpName);
        if (r) r.totalDamage = totalBlacked;
      }
    }

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

    // SYSTEMS_ENGINEER: fixed $50 server cost every turn per player with this role
    const sysEngRows = await sql`SELECT id FROM players WHERE player_role = 'SYSTEMS_ENGINEER'`;
    for (const seRow of sysEngRows) {
      await sql`UPDATE players SET liquid_cash = liquid_cash - ${CONFIG.BEN_SERVER_COST} WHERE id = ${seRow.id}`;
      await sql`
        INSERT INTO transactions (turn_number, player_id, tx_type, amount, description)
        VALUES (${turn}, ${seRow.id}, 'SERVER_MAINTENANCE', ${-CONFIG.BEN_SERVER_COST},
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
        SELECT p.id AS player_id, p.tax_exempt_turns, p.player_role,
               (p.liquid_cash + COALESCE(e.eq, 0))::numeric AS net_worth
        FROM players p LEFT JOIN equity e ON e.player_id = p.id
      ),
      tax AS (
        SELECT n.player_id, n.net_worth, n.tax_exempt_turns,
          CASE WHEN n.tax_exempt_turns > 0 THEN 0::numeric
          ELSE
            ROUND((
              GREATEST(0, LEAST(n.net_worth, 50000) - 10000) * 0.025 +
              GREATEST(0, LEAST(n.net_worth, 150000) - 50000) * 0.07 +
              GREATEST(0, n.net_worth - 150000) *
                CASE WHEN n.player_role = 'ECONOMIST' THEN 0.12 ELSE 0.15 END
            )::numeric, 2)
            -- fin-3 (Hedging): reduces effective tax by 20%
            * CASE WHEN EXISTS (
                SELECT 1 FROM tech_unlocks tu WHERE tu.player_id = n.player_id AND tu.node_id = 'fin-3'
              ) THEN 0.80 ELSE 1.0 END
          END AS tax_amount
        FROM nw n
      )
      UPDATE players p
      SET liquid_cash = CASE WHEN t.tax_amount > 0 THEN p.liquid_cash - t.tax_amount ELSE p.liquid_cash END,
          tax_exempt_turns = GREATEST(0, p.tax_exempt_turns - 1)
      FROM tax t WHERE p.id = t.player_id
      RETURNING p.id AS player_id, t.tax_amount, t.net_worth, p.tax_exempt_turns AS remaining_exempt
    `;

    const taxInserts = taxResults.filter(r => Number(r.tax_amount) > 0);
    if (taxInserts.length > 0) {
      const values = taxInserts.map(r => ({
        turn_number: turn,
        player_id: r.player_id,
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
    // Personal branch nodes (ds-/ec-/ps-/se-/me- prefixes) NEVER expire
    const flipped = await sql`
      UPDATE tech_unlocks
      SET status = 'OPEN_SOURCE'
      WHERE status = 'PATENT'
        AND (${turn} - unlocked_at_turn) >= 10
        AND node_id NOT LIKE 'ds-%'
        AND node_id NOT LIKE 'ec-%'
        AND node_id NOT LIKE 'ps-%'
        AND node_id NOT LIKE 'se-%'
        AND node_id NOT LIKE 'me-%'
      RETURNING node_id, player_id
    `;
    for (const f of flipped) {
      summary.events.push({ type: 'PATENT_EXPIRED', node_id: f.node_id, by: f.player_id });
    }

    // ===== PHASE 5.55: ALLIANCE IC SYNERGY BONUS =====
    // Active allies who both hold shares in the same corp get +5% base IC per shared corp (max 3 corps)
    const activeAlliancesForIc = await sql`SELECT proposer_id, recipient_id FROM alliances WHERE status = 'ACTIVE'`;
    for (const al of activeAlliancesForIc) {
      const [sharedCorpsRow] = await sql`
        SELECT COUNT(DISTINCT s1.corporation_id)::int AS cnt
        FROM shareholdings s1
        JOIN shareholdings s2 ON s1.corporation_id = s2.corporation_id
        WHERE s1.player_id = ${al.proposer_id} AND s2.player_id = ${al.recipient_id}
          AND s1.shares > 0 AND s2.shares > 0
      `;
      const sharedCount = Number(sharedCorpsRow?.cnt || 0);
      if (sharedCount > 0) {
        const bonusIc = Math.round(baseIc * 0.05) * Math.min(sharedCount, 3);
        for (const pid of [al.proposer_id, al.recipient_id]) {
          await sql`UPDATE players SET intellectual_capital = intellectual_capital + ${bonusIc} WHERE id = ${pid}`;
          await sql`INSERT INTO transactions (turn_number, player_id, tx_type, amount, description) VALUES (${turn}, ${pid}, 'IC_GAIN', 0, ${'🤝 Bono IC alianza: ' + sharedCount + ' corp(s) compartida(s) (+' + bonusIc + ' IC)'})`;
        }
      }
    }

    // ===== PHASE 5.6: TECH ORDERS (WEGO queue resolution) =====
    await resolveTechOrders(sql, turn, usernameMap, summary);

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

    // ===== PHASE 6.5: CASINO DE MEDIANOCHE =====
    await resolveCasinoBets(sql, turn, usernameMap, summary);

    // ===== PHASE 6.7: BOUNTY CONTRACTS =====
    await resolveBountyContracts(sql, turn, usernameMap, summary);

    // ===== PHASE 7: GLOBAL EVENT (40% de probabilidad por turno) =====
    const globalEvent = await maybeFireGlobalEvent(sql, turn, summary);
    if (globalEvent) summary.globalEvent = globalEvent;

    // ===== PHASE 7.8: ORÁCULO DEL MERCADO resolution =====
    await resolveIcPredictions(sql, turn, usernameMap, summary);

    // ===== PHASE 7.9: LOBBY POLÍTICO resolution =====
    await resolveLobbyActions(sql, turn, usernameMap, summary);

    // ===== PHASE 7.5: UPDATE NISSAI MARKET LEVEL based on state treasury =====
    const [treasuryRow] = await sql`SELECT COALESCE(state_treasury, 0) AS treasury FROM game_state WHERE id = 1`;
    const treasury = Number(treasuryRow?.treasury || 0);
    let nissaiLevel = 1;
    if (treasury >= 50000) nissaiLevel = 5;
    else if (treasury >= 20000) nissaiLevel = 4;
    else if (treasury >= 8000) nissaiLevel = 3;
    else if (treasury >= 2000) nissaiLevel = 2;
    await sql`UPDATE game_state SET nissai_market_level = ${nissaiLevel} WHERE id = 1`;

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
