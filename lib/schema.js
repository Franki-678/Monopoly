import sql from './db';

export async function createSchema() {
  // Players
  await sql`CREATE TABLE IF NOT EXISTS players (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username TEXT UNIQUE NOT NULL,
    pin TEXT NOT NULL,
    liquid_cash NUMERIC(14,2) NOT NULL DEFAULT 0,
    intellectual_capital NUMERIC(14,2) NOT NULL DEFAULT 0,
    is_admin BOOLEAN NOT NULL DEFAULT FALSE,
    bankrupt BOOLEAN NOT NULL DEFAULT FALSE,
    tax_exempt_turns INT NOT NULL DEFAULT 0,
    avatar_color TEXT DEFAULT '#a3e635',
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`;
  // Add player_role column idempotently (safe on existing DBs)
  await sql`ALTER TABLE players ADD COLUMN IF NOT EXISTS player_role TEXT DEFAULT 'DATA_SCIENTIST'`;
  // Add board_position column idempotently (Fase 8)
  await sql`ALTER TABLE players ADD COLUMN IF NOT EXISTS board_position INT DEFAULT 0`;

  await sql`CREATE TABLE IF NOT EXISTS corporations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT UNIQUE NOT NULL,
    district TEXT NOT NULL,
    tagline TEXT,
    fair_market_value NUMERIC(14,2) NOT NULL,
    base_income NUMERIC(14,2) NOT NULL,
    total_shares INT NOT NULL DEFAULT 100,
    ceo_player_id UUID REFERENCES players(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`;

  // Add board_position to corporations (Fase 8 — which physical square a corp occupies)
  await sql`ALTER TABLE corporations ADD COLUMN IF NOT EXISTS board_position INT`;
  await sql`CREATE UNIQUE INDEX IF NOT EXISTS idx_corps_board_pos ON corporations(board_position) WHERE board_position IS NOT NULL`;

  await sql`CREATE TABLE IF NOT EXISTS shareholdings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    player_id UUID REFERENCES players(id) ON DELETE CASCADE,
    corporation_id UUID REFERENCES corporations(id) ON DELETE CASCADE,
    shares INT NOT NULL DEFAULT 0,
    UNIQUE(player_id, corporation_id)
  )`;

  await sql`CREATE TABLE IF NOT EXISTS orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    player_id UUID REFERENCES players(id) ON DELETE CASCADE,
    turn_number INT NOT NULL,
    order_type TEXT NOT NULL,
    corporation_id UUID REFERENCES corporations(id) ON DELETE CASCADE,
    shares INT NOT NULL DEFAULT 0,
    limit_price NUMERIC(14,2),
    status TEXT NOT NULL DEFAULT 'PENDING',
    result_note TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`;

  await sql`CREATE TABLE IF NOT EXISTS transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    turn_number INT NOT NULL,
    player_id UUID REFERENCES players(id) ON DELETE CASCADE,
    tx_type TEXT NOT NULL,
    amount NUMERIC(14,2) NOT NULL,
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`;

  await sql`CREATE TABLE IF NOT EXISTS turn_log (
    turn_number INT PRIMARY KEY,
    resolved_at TIMESTAMPTZ DEFAULT NOW(),
    summary JSONB
  )`;

  await sql`CREATE TABLE IF NOT EXISTS game_state (
    id INT PRIMARY KEY DEFAULT 1,
    current_turn INT NOT NULL DEFAULT 1,
    locked BOOLEAN NOT NULL DEFAULT FALSE,
    CHECK (id = 1)
  )`;

  await sql`CREATE TABLE IF NOT EXISTS daily_rolls (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    player_id UUID REFERENCES players(id) ON DELETE CASCADE,
    turn_number INT NOT NULL,
    roll_value INT NOT NULL CHECK (roll_value BETWEEN 1 AND 6),
    rolled_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (player_id, turn_number)
  )`;
  await sql`CREATE INDEX IF NOT EXISTS idx_daily_rolls_turn ON daily_rolls(turn_number)`;

  await sql`CREATE TABLE IF NOT EXISTS alliances (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    proposer_id UUID REFERENCES players(id) ON DELETE CASCADE,
    recipient_id UUID REFERENCES players(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'PROPOSED',
    escrow_proposer NUMERIC(14,2) NOT NULL DEFAULT 0,
    escrow_recipient NUMERIC(14,2) NOT NULL DEFAULT 0,
    escrow_pct NUMERIC(5,2) NOT NULL DEFAULT 10,
    proposed_at_turn INT NOT NULL,
    accepted_at_turn INT,
    broken_at_turn INT,
    broken_by UUID REFERENCES players(id) ON DELETE SET NULL,
    break_reason TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    CHECK (proposer_id <> recipient_id),
    CHECK (status IN ('PROPOSED','ACTIVE','BROKEN','DISSOLVED','REJECTED','CANCELLED'))
  )`;
  await sql`CREATE INDEX IF NOT EXISTS idx_alliances_parties ON alliances(proposer_id, recipient_id, status)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_alliances_status ON alliances(status)`;

  // --- Tech Tree ---
  await sql`CREATE TABLE IF NOT EXISTS tech_nodes (
    id TEXT PRIMARY KEY,
    branch TEXT NOT NULL,
    tier INT NOT NULL,
    name TEXT NOT NULL,
    description TEXT NOT NULL,
    base_cost INT NOT NULL,
    prereq_id TEXT,
    effect_label TEXT
  )`;
  await sql`CREATE TABLE IF NOT EXISTS tech_unlocks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    player_id UUID REFERENCES players(id) ON DELETE CASCADE,
    node_id TEXT REFERENCES tech_nodes(id) ON DELETE CASCADE,
    unlocked_at_turn INT NOT NULL,
    cost_paid INT NOT NULL,
    status TEXT NOT NULL DEFAULT 'PATENT',
    UNIQUE(player_id, node_id),
    CHECK (status IN ('PATENT','OPEN_SOURCE'))
  )`;
  await sql`CREATE INDEX IF NOT EXISTS idx_tech_unlocks_player ON tech_unlocks(player_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_tech_unlocks_node_status ON tech_unlocks(node_id, status)`;

  // --- Global Achievements ---
  await sql`CREATE TABLE IF NOT EXISTS global_achievements (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT NOT NULL,
    prize_cash NUMERIC(14,2) NOT NULL DEFAULT 0,
    prize_ic NUMERIC(14,2) NOT NULL DEFAULT 0,
    winner_id UUID REFERENCES players(id) ON DELETE SET NULL,
    won_at_turn INT,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`;

  // Seed tech nodes idempotently
  const techSeed = [
    // Ingeniería Financiera
    { id: 'fin-1', branch: 'FINANCIERA', tier: 1, name: 'Análisis Técnico', description: 'Visualizás históricos de FMV detallados.', base_cost: 200, prereq_id: null, effect_label: '+ insight' },
    { id: 'fin-2', branch: 'FINANCIERA', tier: 2, name: 'Arbitraje', description: 'Tu discount de venta cae al 1.5% (en vez de 3%).', base_cost: 400, prereq_id: 'fin-1', effect_label: 'sell -1.5% spread' },
    { id: 'fin-3', branch: 'FINANCIERA', tier: 3, name: 'Hedging', description: 'Tu wealth tax efectivo se reduce 20%.', base_cost: 700, prereq_id: 'fin-2', effect_label: 'tax -20%' },
    { id: 'fin-4', branch: 'FINANCIERA', tier: 4, name: 'HFT Bot', description: 'Premium de compra al 1.5% (en vez de 3%).', base_cost: 1200, prereq_id: 'fin-3', effect_label: 'buy -1.5% spread' },
    // Desarrollo Urbano
    { id: 'urb-1', branch: 'URBANO', tier: 1, name: 'Zonificación', description: 'Tu costo de mantenimiento -10%.', base_cost: 200, prereq_id: null, effect_label: 'maint -10%' },
    { id: 'urb-2', branch: 'URBANO', tier: 2, name: 'Renovación', description: 'Las corps donde sos CEO ganan +2% FMV/turno.', base_cost: 400, prereq_id: 'urb-1', effect_label: 'CEO FMV +2%' },
    { id: 'urb-3', branch: 'URBANO', tier: 3, name: 'Gentrificación', description: 'Cuando sos CEO, recibís +10% extra de dividendos.', base_cost: 700, prereq_id: 'urb-2', effect_label: 'CEO div +10%' },
    { id: 'urb-4', branch: 'URBANO', tier: 4, name: 'Distrito Premium', description: 'Tus corps son inmunes a caídas de FMV por demanda.', base_cost: 1200, prereq_id: 'urb-3', effect_label: 'FMV floor lock' },
    // Logística
    { id: 'log-1', branch: 'LOGISTICA', tier: 1, name: 'Cadena de Suministro', description: 'Recibís +5% extra de IC por turno.', base_cost: 200, prereq_id: null, effect_label: 'IC +5%' },
    { id: 'log-2', branch: 'LOGISTICA', tier: 2, name: 'Just-in-Time', description: 'IC por turno +15% adicional.', base_cost: 400, prereq_id: 'log-1', effect_label: 'IC +15%' },
    { id: 'log-3', branch: 'LOGISTICA', tier: 3, name: 'Red Distribuida', description: 'Reducción de mantenimiento adicional -5%.', base_cost: 700, prereq_id: 'log-2', effect_label: 'maint -5% extra' },
    { id: 'log-4', branch: 'LOGISTICA', tier: 4, name: 'Monopolio Operativo', description: '+5% extra de dividendos cuando holdes >50% de una corp.', base_cost: 1200, prereq_id: 'log-3', effect_label: 'monopoly bonus' },
  ];
  for (const n of techSeed) {
    await sql`
      INSERT INTO tech_nodes (id, branch, tier, name, description, base_cost, prereq_id, effect_label)
      VALUES (${n.id}, ${n.branch}, ${n.tier}, ${n.name}, ${n.description}, ${n.base_cost}, ${n.prereq_id}, ${n.effect_label})
      ON CONFLICT (id) DO UPDATE SET
        branch=EXCLUDED.branch, tier=EXCLUDED.tier, name=EXCLUDED.name,
        description=EXCLUDED.description, base_cost=EXCLUDED.base_cost,
        prereq_id=EXCLUDED.prereq_id, effect_label=EXCLUDED.effect_label
    `;
  }

  // Seed global achievements idempotently
  const achievementsSeed = [
    { id: 'first_ceo',          name: 'El Monopolista Precoz',     description: 'Primero en ser CEO de cualquier corporación',                prize_cash: 500,  prize_ic: 0   },
    { id: 'tier2_tech',         name: 'Mente Brillante',           description: 'Primero en desbloquear un nodo Tier 2 del Tech Tree',        prize_cash: 0,    prize_ic: 200 },
    { id: 'first_alliance',     name: 'El Diplomático',            description: 'Primeros en firmar una alianza activa con escrow',           prize_cash: 300,  prize_ic: 0   },
    { id: 'first_10pct',        name: 'El Inversor Precoz',        description: 'Primero en poseer ≥10 shares de cualquier corporación',      prize_cash: 100,  prize_ic: 0   },
    { id: 'wolf_wall_st',       name: 'El Lobo de Wall Street',    description: 'Primero en ejecutar 5 o más trades en un solo turno',        prize_cash: 300,  prize_ic: 0   },
    { id: 'chapter11_survivor', name: 'Ave Fénix',                 description: 'Primer jugador en recuperarse del Capítulo 11',             prize_cash: 0,    prize_ic: 150 },
  ];
  for (const a of achievementsSeed) {
    await sql`
      INSERT INTO global_achievements (id, name, description, prize_cash, prize_ic)
      VALUES (${a.id}, ${a.name}, ${a.description}, ${a.prize_cash}, ${a.prize_ic})
      ON CONFLICT (id) DO NOTHING
    `;
  }

  await sql`CREATE INDEX IF NOT EXISTS idx_orders_turn ON orders(turn_number, status)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_tx_player_turn ON transactions(player_id, turn_number)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_shares_player ON shareholdings(player_id)`;

  // Ensure game_state row exists
  await sql`INSERT INTO game_state (id, current_turn, locked) VALUES (1, 1, FALSE) ON CONFLICT (id) DO NOTHING`;
}

export async function seedIfEmpty() {
  const [{ count }] = await sql`SELECT COUNT(*)::int AS count FROM players`;
  if (count > 0) return { seeded: false, reason: 'already-seeded' };

  // ──────────────────────────────────────────────────────
  // ROSTER REAL — PINs provisorios, cambiar antes del lanzamiento
  // via /api/reset + ADMIN_SECRET
  // ──────────────────────────────────────────────────────
  const players = [
    { username: 'FRANKI', pin: '0814', is_admin: true,  color: '#a3e635', role: 'DATA_SCIENTIST'   },
    { username: 'CECE',   pin: '1234', is_admin: false, color: '#22d3ee', role: 'ECONOMIST'         },
    { username: 'TOBE',   pin: '5678', is_admin: false, color: '#f97316', role: 'ECONOMIST'         },
    { username: 'SANTI',  pin: '9012', is_admin: false, color: '#ec4899', role: 'PSYCHOLOGIST'      },
    { username: 'BEN',    pin: '3456', is_admin: false, color: '#eab308', role: 'SYSTEMS_ENGINEER'  },
    { username: 'MANU',   pin: '7890', is_admin: false, color: '#8b5cf6', role: 'MECH_ENGINEER'     },
    { username: 'RETA',   pin: '2468', is_admin: false, color: '#34d399', role: 'SYSTEMS_ENGINEER'  },
  ];

  const corps = [
    { name: 'BARRIO 77 SNEAKERS',  district: 'Zona Sur',       tagline: 'Kicks del asfalto' },
    { name: 'CALLE ROJA THREADS',  district: 'Centro',         tagline: 'Hilos rebeldes' },
    { name: 'NEON BAJO TOKYO',     district: 'Distrito Neón',  tagline: 'Luces que no duermen' },
    { name: 'CONCRETO CLUB',       district: 'Zona Industrial', tagline: 'Jersey, hormigón, gloria' },
    { name: 'AVENIDA VAPOR',       district: 'Puerto',         tagline: 'Vinilo y humo' },
    { name: 'HYPE INDUSTRIA',      district: 'Centro',         tagline: 'La fábrica del drop' },
    { name: 'POLVO DORADO CO.',    district: 'Zona Alta',      tagline: 'Oro en polvo, nada fake' },
    { name: 'TINTA ETERNA',        district: 'Barrio Viejo',   tagline: 'Ink para toda la vida' },
    { name: 'CAOS BOUTIQUE',       district: 'Centro',         tagline: 'Orden a través del caos' },
    { name: 'LIENZO URBANO',       district: 'Distrito Arte',  tagline: 'Muros que hablan' },
    { name: 'RUIDO ESTUDIO',       district: 'Zona Norte',     tagline: 'Beats del subte' },
    { name: 'SUR PROFUNDO',        district: 'Zona Sur',       tagline: 'Sangre y denim' },
    { name: 'GRAFITO APPAREL',     district: 'Distrito Neón',  tagline: 'Monochrome mafia' },
    { name: 'METROPOLIS ROPA',     district: 'Centro',         tagline: 'La ciudad se viste sola' },
    { name: 'SMOG COLLECTIVE',     district: 'Zona Industrial', tagline: 'Respiramos hype' },
    { name: 'OXIDO 808',           district: 'Puerto',         tagline: 'Herrumbre premium' },
    { name: 'KAMIKAZE KICKS',      district: 'Zona Alta',      tagline: 'All-in desde el nacimiento' },
    { name: 'RUTA 99 DENIM',       district: 'Zona Norte',     tagline: 'Jeans con kilómetros' },
    { name: 'ALERTA NARANJA',      district: 'Distrito Arte',  tagline: 'Peligroso de usar' },
    { name: 'ECLIPSE BRAND',       district: 'Barrio Viejo',   tagline: 'Oscuridad vendida' },
  ];

  // Insert players
  const playerRows = [];
  for (const p of players) {
    const [row] = await sql`
      INSERT INTO players (username, pin, liquid_cash, intellectual_capital, is_admin, avatar_color, player_role)
      VALUES (${p.username}, ${p.pin}, 5000, 500, ${p.is_admin}, ${p.color}, ${p.role})
      RETURNING id, username, player_role
    `;
    playerRows.push(row);
  }

  // Board layout: 20 squares (0-19).
  //   Square  5 = Prendas   (castigo físico, sin efecto económico)
  //   Square 10 = El Psicólogo ($200 fee)
  //   Square 15 = Prendas
  //   Squares 0-4, 6-9, 11-14, 16-19 = corporaciones (17 casillas)
  //   3 corps quedan "off-board" (tienen posición null)
  const BOARD_CORP_POSITIONS = [0, 1, 2, 3, 4, 6, 7, 8, 9, 11, 12, 13, 14, 16, 17, 18, 19, null, null, null];

  // Insert corps with varied FMV & income
  const corpRows = [];
  for (let i = 0; i < corps.length; i++) {
    const c = corps[i];
    let fmv;
    if (i < 7)       fmv = 800  + Math.floor(Math.random() * 700);
    else if (i < 14) fmv = 1500 + Math.floor(Math.random() * 1500);
    else             fmv = 3000 + Math.floor(Math.random() * 2500);
    const baseIncome = Math.round(fmv * (0.045 + Math.random() * 0.025) * 100) / 100;
    const boardPos = BOARD_CORP_POSITIONS[i] ?? null;
    const [row] = await sql`
      INSERT INTO corporations (name, district, tagline, fair_market_value, base_income, board_position)
      VALUES (${c.name}, ${c.district}, ${c.tagline}, ${fmv}, ${baseIncome}, ${boardPos})
      RETURNING id, name, total_shares
    `;
    corpRows.push(row);
  }

  // Distribute initial shares: 30–60 shares per corp, rest stays in market
  for (const corp of corpRows) {
    const numHolders = 2 + Math.floor(Math.random() * 3);
    const shuffled = [...playerRows].sort(() => Math.random() - 0.5).slice(0, numHolders);
    let remaining = 30 + Math.floor(Math.random() * 30);
    const allocations = [];
    for (let j = 0; j < shuffled.length; j++) {
      const isLast = j === shuffled.length - 1;
      const amt = isLast ? remaining : Math.max(5, Math.floor(remaining / (shuffled.length - j)) + Math.floor(Math.random() * 10) - 5);
      const give = Math.min(amt, remaining);
      remaining -= give;
      allocations.push({ player: shuffled[j], shares: give });
    }
    for (const a of allocations) {
      if (a.shares > 0) {
        await sql`INSERT INTO shareholdings (player_id, corporation_id, shares) VALUES (${a.player.id}, ${corp.id}, ${a.shares})`;
      }
    }
    allocations.sort((a, b) => b.shares - a.shares);
    if (allocations[0] && allocations[0].shares > 0) {
      await sql`UPDATE corporations SET ceo_player_id = ${allocations[0].player.id} WHERE id = ${corp.id}`;
    }
  }

  return { seeded: true, players: playerRows.length, corps: corpRows.length };
}
