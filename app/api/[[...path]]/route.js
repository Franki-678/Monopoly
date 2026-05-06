import { NextResponse } from 'next/server';
import sql from '@/lib/db';
import { createSchema, seedIfEmpty } from '@/lib/schema';
import { resolveTurn, getCurrentTurn, computeNetWorth, CONFIG, checkAndAwardAchievement } from '@/lib/gameLogic';

const json = (data, status = 200) => NextResponse.json(data, { status });
const err = (message, status = 400) => NextResponse.json({ error: message }, { status });

async function route(request, method, path) {
  const p = path.join('/');

  // --- SETUP ---
  if (p === 'init' && method === 'POST') {
    await createSchema();
    const seed = await seedIfEmpty();
    return json({ ok: true, seed });
  }

  if (p === 'reset' && method === 'POST') {
    const body = await request.json().catch(() => ({}));
    if (body.secret !== process.env.ADMIN_SECRET) return err('Secret inválido', 403);
    await sql`DROP TABLE IF EXISTS tech_unlocks, tech_nodes, alliances, daily_rolls, turn_log, transactions, orders, shareholdings, corporations, game_state, players CASCADE`;
    await createSchema();
    const seed = await seedIfEmpty();
    return json({ ok: true, reset: true, seed });
  }

  // --- AUTH ---
  if (p === 'auth/login' && method === 'POST') {
    const { username, pin } = await request.json();
    if (!username || !pin) return err('Usuario y PIN requeridos');
    const [player] = await sql`SELECT id, username, is_admin, avatar_color, player_role, board_position FROM players WHERE username = ${username.toUpperCase()} AND pin = ${pin}`;
    if (!player) return err('Credenciales inválidas', 401);
    return json({ player });
  }

  // --- GAME STATE ---
  if (p === 'game/state' && method === 'GET') {
    const [state] = await sql`SELECT current_turn, locked FROM game_state WHERE id = 1`;
    return json(state || { current_turn: 1, locked: false });
  }

  // --- DASHBOARD ---
  if (p.startsWith('dashboard/') && method === 'GET') {
    const playerId = p.split('/')[1];
    const [player] = await sql`SELECT id, username, liquid_cash, intellectual_capital, bankrupt, tax_exempt_turns, is_admin, avatar_color, player_role, board_position FROM players WHERE id = ${playerId}`;
    if (!player) return err('Jugador no encontrado', 404);

    const turn = await getCurrentTurn();
    const netWorth = await computeNetWorth(playerId);

    // Portfolio
    const portfolio = await sql`
      SELECT s.shares, c.id AS corp_id, c.name, c.district, c.tagline, c.fair_market_value, c.base_income, c.ceo_player_id, c.total_shares,
        (SELECT username FROM players WHERE id = c.ceo_player_id) AS ceo_name
      FROM shareholdings s
      JOIN corporations c ON c.id = s.corporation_id
      WHERE s.player_id = ${playerId} AND s.shares > 0
      ORDER BY s.shares DESC
    `;

    // Last turn's income audit (all transactions from previous resolved turn)
    const auditTurn = turn - 1;
    const audit = auditTurn > 0
      ? await sql`SELECT tx_type, amount, description, created_at FROM transactions WHERE player_id = ${playerId} AND turn_number = ${auditTurn} ORDER BY created_at ASC`
      : [];

    // Pending orders for current turn
    const pendingOrders = await sql`
      SELECT o.id, o.order_type, o.shares, o.limit_price, o.status, o.result_note, c.name AS corp_name
      FROM orders o
      JOIN corporations c ON c.id = o.corporation_id
      WHERE o.player_id = ${playerId} AND o.turn_number = ${turn}
      ORDER BY o.created_at DESC
    `;

    // Last global event (from last resolved turn)
    let lastGlobalEvent = null;
    if (auditTurn > 0) {
      const [logRow] = await sql`SELECT summary FROM turn_log WHERE turn_number = ${auditTurn}`;
      if (logRow?.summary?.globalEvent) lastGlobalEvent = logRow.summary.globalEvent;
    }

    return json({
      player: { ...player, liquid_cash: Number(player.liquid_cash), intellectual_capital: Number(player.intellectual_capital) },
      turn,
      netWorth: Math.round(netWorth * 100) / 100,
      portfolio,
      audit,
      pendingOrders,
      auditTurn,
      lastGlobalEvent,
    });
  }

  // --- MARKET ---
  if (p === 'market' && method === 'GET') {
    const rows = await sql`
      SELECT c.id, c.name, c.district, c.tagline, c.fair_market_value, c.base_income, c.total_shares,
        c.board_position, c.ceo_player_id,
        (SELECT username FROM players WHERE id = c.ceo_player_id) AS ceo_name,
        COALESCE((SELECT SUM(shares) FROM shareholdings WHERE corporation_id = c.id), 0)::int AS owned_shares
      FROM corporations c
      ORDER BY c.fair_market_value DESC
    `;
    return json({ market: rows });
  }

  // --- PLAYERS (leaderboard) ---
  if (p === 'players' && method === 'GET') {
    const players = await sql`SELECT id, username, liquid_cash, bankrupt, tax_exempt_turns, avatar_color, player_role, board_position FROM players ORDER BY username ASC`;
    const enriched = [];
    for (const pl of players) {
      const nw = await computeNetWorth(pl.id);
      enriched.push({ ...pl, liquid_cash: Number(pl.liquid_cash), net_worth: Math.round(nw * 100) / 100 });
    }
    enriched.sort((a, b) => b.net_worth - a.net_worth);
    return json({ players: enriched });
  }

  // --- ORDERS ---
  if (p === 'orders' && method === 'POST') {
    const body = await request.json();
    const { player_id, order_type, corporation_id, shares, limit_price } = body;
    if (!player_id || !order_type || !corporation_id || !shares) return err('Campos requeridos faltantes');
    if (!['BUY_SHARES', 'SELL_SHARES'].includes(order_type)) return err('Tipo de orden inválido');
    const qty = parseInt(shares, 10);
    if (qty <= 0) return err('Cantidad debe ser positiva');
    const turn = await getCurrentTurn();
    const [state] = await sql`SELECT locked FROM game_state WHERE id = 1`;
    if (state?.locked) return err('Turno bloqueado, resolviendo...');
    const [order] = await sql`
      INSERT INTO orders (player_id, turn_number, order_type, corporation_id, shares, limit_price)
      VALUES (${player_id}, ${turn}, ${order_type}, ${corporation_id}, ${qty}, ${limit_price || null})
      RETURNING *
    `;
    return json({ order });
  }

  if (p.startsWith('orders/') && method === 'DELETE') {
    const orderId = p.split('/')[1];
    const [order] = await sql`SELECT status FROM orders WHERE id = ${orderId}`;
    if (!order) return err('Orden no encontrada', 404);
    if (order.status !== 'PENDING') return err('Orden ya procesada', 400);
    await sql`DELETE FROM orders WHERE id = ${orderId}`;
    return json({ ok: true });
  }

  // --- TECH TREE ---
  if (p.startsWith('tech/tree/') && method === 'GET') {
    const playerId = p.split('/')[2];
    const nodes = await sql`SELECT * FROM tech_nodes ORDER BY branch ASC, tier ASC`;
    const myUnlocks = await sql`SELECT node_id, status, unlocked_at_turn FROM tech_unlocks WHERE player_id = ${playerId}`;
    const allUnlocks = await sql`
      SELECT node_id, COUNT(*)::int AS holders,
        BOOL_OR(status = 'OPEN_SOURCE') AS is_open_source,
        MIN(unlocked_at_turn) AS first_unlocked_turn
      FROM tech_unlocks
      GROUP BY node_id
    `;
    const myMap = Object.fromEntries(myUnlocks.map(u => [u.node_id, u]));
    const allMap = Object.fromEntries(allUnlocks.map(u => [u.node_id, u]));
    const turn = await getCurrentTurn();

    const enriched = nodes.map(n => {
      const mine = myMap[n.id];
      const global = allMap[n.id];
      const prereqMet = !n.prereq_id || (myMap[n.prereq_id] != null);
      const isOpenSource = global?.is_open_source || false;
      const turnsToOpenSource = global ? Math.max(0, 10 - (turn - global.first_unlocked_turn)) : null;
      const effectiveCost = mine ? 0 : (isOpenSource ? Math.round(n.base_cost * 0.25) : n.base_cost);
      let status;
      if (mine) status = mine.status; // PATENT or OPEN_SOURCE for me
      else if (!prereqMet) status = 'LOCKED';
      else if (global && !isOpenSource) status = 'PATENTED_BY_OTHER'; // someone else has patent
      else if (isOpenSource) status = 'AVAILABLE_OS';
      else status = 'AVAILABLE'; // first to unlock = patent
      return {
        ...n,
        status,
        effective_cost: effectiveCost,
        turns_to_open_source: turnsToOpenSource,
        global_holders: global?.holders || 0,
      };
    });
    return json({ nodes: enriched, current_turn: turn });
  }

  if (p === 'tech/unlock' && method === 'POST') {
    const { player_id, node_id } = await request.json();
    if (!player_id || !node_id) return err('Faltan campos');
    const [node] = await sql`SELECT * FROM tech_nodes WHERE id = ${node_id}`;
    if (!node) return err('Nodo no existe', 404);
    const [existing] = await sql`SELECT id FROM tech_unlocks WHERE player_id = ${player_id} AND node_id = ${node_id}`;
    if (existing) return err('Ya tienes este nodo');
    if (node.prereq_id) {
      const [prereq] = await sql`SELECT id FROM tech_unlocks WHERE player_id = ${player_id} AND node_id = ${node.prereq_id}`;
      if (!prereq) return err('Prerequisito no cumplido');
    }
    const [player] = await sql`SELECT intellectual_capital, player_role FROM players WHERE id = ${player_id}`;
    const isBen = player.player_role === 'SYSTEMS_ENGINEER';
    const isEconomist = player.player_role === 'ECONOMIST';

    // Check global status: if any player has PATENT (not OS), block (unless BEN — bypasses patents).
    const [globalState] = await sql`
      SELECT
        BOOL_OR(status = 'PATENT') AS has_patent,
        BOOL_OR(status = 'OPEN_SOURCE') AS is_os
      FROM tech_unlocks WHERE node_id = ${node_id}
    `;
    if (!isBen && globalState?.has_patent && !globalState?.is_os) {
      return err('Patente exclusiva de otro jugador. Esperá a que se vuelva Open Source.');
    }
    // BEN always enters at OPEN_SOURCE (pays full base cost, skips patent queue)
    const isOpenSource = isBen ? true : (globalState?.is_os || false);
    let cost = isOpenSource ? Math.round(node.base_cost * 0.25) : node.base_cost;
    if (isBen && !globalState?.is_os) cost = node.base_cost; // full cost for BEN patent bypass
    if (isEconomist) cost = Math.round(cost * 1.20); // ECONOMIST pays +20% (bureaucracy tax)

    if (Number(player.intellectual_capital) < cost) return err('IC insuficiente: necesitás ' + cost + ', tenés ' + Math.floor(player.intellectual_capital));
    const turn = await getCurrentTurn();
    await sql`UPDATE players SET intellectual_capital = intellectual_capital - ${cost} WHERE id = ${player_id}`;
    const newStatus = isOpenSource ? 'OPEN_SOURCE' : 'PATENT';
    await sql`INSERT INTO tech_unlocks (player_id, node_id, unlocked_at_turn, cost_paid, status) VALUES (${player_id}, ${node_id}, ${turn}, ${cost}, ${newStatus})`;
    await sql`INSERT INTO transactions (turn_number, player_id, tx_type, amount, description) VALUES (${turn}, ${player_id}, 'TECH_UNLOCK', 0, ${'Desbloqueado: ' + node.name + ' (' + (newStatus === 'PATENT' ? 'Patente ' : 'Open Source ') + cost + ' IC)'})`;

    // Award tier2_tech achievement to first player to unlock a tier-2 (or higher) node
    if (node.tier >= 2) {
      await checkAndAwardAchievement('tier2_tech', player_id, turn);
    }

    return json({ ok: true, status: newStatus, cost });
  }

  // --- ALLIANCES ---
  if (p === 'alliances' && method === 'POST') {
    const { proposer_id, recipient_id, escrow_pct } = await request.json();
    if (!proposer_id || !recipient_id) return err('proposer_id y recipient_id requeridos');
    if (proposer_id === recipient_id) return err('No podés aliarte contigo mismo');
    const pct = Math.max(5, Math.min(30, Number(escrow_pct || 10)));
    // Block if there's already an active/proposed alliance between these two
    const [existing] = await sql`
      SELECT id FROM alliances
      WHERE status IN ('PROPOSED','ACTIVE')
        AND ((proposer_id = ${proposer_id} AND recipient_id = ${recipient_id})
          OR (proposer_id = ${recipient_id} AND recipient_id = ${proposer_id}))
    `;
    if (existing) return err('Ya existe una alianza activa o propuesta entre ustedes');
    const turn = await getCurrentTurn();
    const [a] = await sql`
      INSERT INTO alliances (proposer_id, recipient_id, escrow_pct, proposed_at_turn)
      VALUES (${proposer_id}, ${recipient_id}, ${pct}, ${turn}) RETURNING *
    `;
    return json({ alliance: a });
  }

  if (p.startsWith('alliances/list/') && method === 'GET') {
    const playerId = p.split('/')[2];
    const rows = await sql`
      SELECT a.*,
        (SELECT username FROM players WHERE id = a.proposer_id) AS proposer_name,
        (SELECT avatar_color FROM players WHERE id = a.proposer_id) AS proposer_color,
        (SELECT username FROM players WHERE id = a.recipient_id) AS recipient_name,
        (SELECT avatar_color FROM players WHERE id = a.recipient_id) AS recipient_color,
        (SELECT username FROM players WHERE id = a.broken_by) AS broken_by_name
      FROM alliances a
      WHERE a.proposer_id = ${playerId} OR a.recipient_id = ${playerId}
      ORDER BY 
        CASE a.status 
          WHEN 'PROPOSED' THEN 1 
          WHEN 'ACTIVE' THEN 2 
          WHEN 'BROKEN' THEN 3 
          ELSE 4 
        END, a.created_at DESC
    `;
    return json({ alliances: rows });
  }

  if (p.startsWith('alliances/accept/') && method === 'POST') {
    const allianceId = p.split('/')[2];
    const { player_id } = await request.json();
    const [a] = await sql`SELECT * FROM alliances WHERE id = ${allianceId}`;
    if (!a) return err('Alianza no encontrada', 404);
    if (a.recipient_id !== player_id) return err('Solo el destinatario puede aceptar', 403);
    if (a.status !== 'PROPOSED') return err('La alianza no está pendiente');
    const turn = await getCurrentTurn();
    // Lock escrow from both parties
    const [proposer] = await sql`SELECT liquid_cash FROM players WHERE id = ${a.proposer_id}`;
    const [recipient] = await sql`SELECT liquid_cash FROM players WHERE id = ${a.recipient_id}`;
    const pct = Number(a.escrow_pct) / 100;
    const proposerEscrow = Math.round(Number(proposer.liquid_cash) * pct * 100) / 100;
    const recipientEscrow = Math.round(Number(recipient.liquid_cash) * pct * 100) / 100;
    if (proposerEscrow <= 0 || recipientEscrow <= 0) return err('Uno de los jugadores no tiene cash suficiente');
    await sql`UPDATE players SET liquid_cash = liquid_cash - ${proposerEscrow} WHERE id = ${a.proposer_id}`;
    await sql`UPDATE players SET liquid_cash = liquid_cash - ${recipientEscrow} WHERE id = ${a.recipient_id}`;
    await sql`
      UPDATE alliances SET status = 'ACTIVE', accepted_at_turn = ${turn},
        escrow_proposer = ${proposerEscrow}, escrow_recipient = ${recipientEscrow}
      WHERE id = ${allianceId}
    `;
    await sql`INSERT INTO transactions (turn_number, player_id, tx_type, amount, description) VALUES (${turn}, ${a.proposer_id}, 'ESCROW_LOCK', ${-proposerEscrow}, ${'Escrow alianza bloqueado (' + pct * 100 + '%)'})`;
    await sql`INSERT INTO transactions (turn_number, player_id, tx_type, amount, description) VALUES (${turn}, ${a.recipient_id}, 'ESCROW_LOCK', ${-recipientEscrow}, ${'Escrow alianza bloqueado (' + pct * 100 + '%)'})`;

    // first_alliance: award $300 to BOTH parties for the first alliance ever formed.
    // Uses direct UPDATE to keep atomicity; the WHERE winner_id IS NULL ensures only one alliance wins.
    const [ach] = await sql`
      UPDATE global_achievements SET winner_id = ${a.proposer_id}, won_at_turn = ${turn}
      WHERE id = 'first_alliance' AND winner_id IS NULL
      RETURNING prize_cash
    `;
    if (ach) {
      const prize = Number(ach.prize_cash);
      await sql`UPDATE players SET liquid_cash = liquid_cash + ${prize} WHERE id = ${a.proposer_id}`;
      await sql`UPDATE players SET liquid_cash = liquid_cash + ${prize} WHERE id = ${a.recipient_id}`;
      await sql`INSERT INTO transactions (turn_number, player_id, tx_type, amount, description) VALUES (${turn}, ${a.proposer_id}, 'ACHIEVEMENT', ${prize}, 'Logro: Primera alianza del juego')`;
      await sql`INSERT INTO transactions (turn_number, player_id, tx_type, amount, description) VALUES (${turn}, ${a.recipient_id}, 'ACHIEVEMENT', ${prize}, 'Logro: Primera alianza del juego')`;
    }

    return json({ ok: true, achievement: ach ? 'first_alliance' : null });
  }

  if (p.startsWith('alliances/reject/') && method === 'POST') {
    const allianceId = p.split('/')[2];
    const { player_id } = await request.json();
    const [a] = await sql`SELECT * FROM alliances WHERE id = ${allianceId}`;
    if (!a) return err('Alianza no encontrada', 404);
    if (a.status !== 'PROPOSED') return err('No está pendiente');
    const isParty = a.proposer_id === player_id || a.recipient_id === player_id;
    if (!isParty) return err('No sos parte', 403);
    const newStatus = a.proposer_id === player_id ? 'CANCELLED' : 'REJECTED';
    await sql`UPDATE alliances SET status = ${newStatus} WHERE id = ${allianceId}`;
    return json({ ok: true });
  }

  if (p.startsWith('alliances/dissolve/') && method === 'POST') {
    const allianceId = p.split('/')[2];
    const { player_id } = await request.json();
    const [a] = await sql`SELECT * FROM alliances WHERE id = ${allianceId}`;
    if (!a) return err('Alianza no encontrada', 404);
    if (a.status !== 'ACTIVE') return err('La alianza no está activa');
    const isParty = a.proposer_id === player_id || a.recipient_id === player_id;
    if (!isParty) return err('No sos parte', 403);
    const turn = await getCurrentTurn();
    // Peaceful dissolution: return escrow to each party
    await sql`UPDATE players SET liquid_cash = liquid_cash + ${a.escrow_proposer} WHERE id = ${a.proposer_id}`;
    await sql`UPDATE players SET liquid_cash = liquid_cash + ${a.escrow_recipient} WHERE id = ${a.recipient_id}`;
    await sql`INSERT INTO transactions (turn_number, player_id, tx_type, amount, description) VALUES (${turn}, ${a.proposer_id}, 'ESCROW_RETURN', ${a.escrow_proposer}, 'Disolución pacífica de alianza')`;
    await sql`INSERT INTO transactions (turn_number, player_id, tx_type, amount, description) VALUES (${turn}, ${a.recipient_id}, 'ESCROW_RETURN', ${a.escrow_recipient}, 'Disolución pacífica de alianza')`;
    await sql`UPDATE alliances SET status = 'DISSOLVED', broken_at_turn = ${turn}, broken_by = ${player_id}, break_reason = 'Disolución mutua pacífica' WHERE id = ${allianceId}`;
    return json({ ok: true });
  }

  // --- DICE ROLL (daily) ---
  if (p === 'dice/roll' && method === 'POST') {
    const { player_id } = await request.json();
    if (!player_id) return err('player_id requerido');
    const turn = await getCurrentTurn();
    // Check if already rolled
    const [existing] = await sql`SELECT roll_value FROM daily_rolls WHERE player_id = ${player_id} AND turn_number = ${turn}`;
    if (existing) return json({ roll: existing.roll_value, already_rolled: true, turn });
    const roll = Math.floor(Math.random() * 6) + 1;
    await sql`INSERT INTO daily_rolls (player_id, turn_number, roll_value) VALUES (${player_id}, ${turn}, ${roll})`;
    return json({ roll, already_rolled: false, turn });
  }

  if (p.startsWith('dice/status/') && method === 'GET') {
    const playerId = p.split('/')[2];
    const turn = await getCurrentTurn();
    const [row] = await sql`SELECT roll_value, rolled_at FROM daily_rolls WHERE player_id = ${playerId} AND turn_number = ${turn}`;
    return json({ turn, roll: row?.roll_value || null, rolled_at: row?.rolled_at || null });
  }

  // --- ADMIN: RESOLVE TURN ---
  if (p === 'admin/resolve-turn' && method === 'POST') {
    const body = await request.json().catch(() => ({}));
    const { admin_id } = body;
    const [admin] = await sql`SELECT is_admin FROM players WHERE id = ${admin_id}`;
    if (!admin?.is_admin) return err('Solo admin puede resolver turno', 403);
    const summary = await resolveTurn();
    return json({ ok: true, summary });
  }

  // --- TURN HISTORY ---
  if (p === 'admin/turn-log' && method === 'GET') {
    const logs = await sql`SELECT turn_number, resolved_at, summary FROM turn_log ORDER BY turn_number DESC LIMIT 20`;
    return json({ logs });
  }

  // --- CONFIG (for UI display) ---
  if (p === 'config' && method === 'GET') {
    return json({ config: CONFIG });
  }

  return err('Ruta no encontrada: ' + p, 404);
}

export async function GET(request, { params }) {
  try { return await route(request, 'GET', (await params).path || []); }
  catch (e) { console.error(e); return err(e.message || 'Error interno', 500); }
}
export async function POST(request, { params }) {
  try { return await route(request, 'POST', (await params).path || []); }
  catch (e) { console.error(e); return err(e.message || 'Error interno', 500); }
}
export async function DELETE(request, { params }) {
  try { return await route(request, 'DELETE', (await params).path || []); }
  catch (e) { console.error(e); return err(e.message || 'Error interno', 500); }
}
export async function PUT(request, { params }) {
  try { return await route(request, 'PUT', (await params).path || []); }
  catch (e) { console.error(e); return err(e.message || 'Error interno', 500); }
}
