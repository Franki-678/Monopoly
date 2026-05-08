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
  // Level system: total IC spent (used to compute player level)
  await sql`ALTER TABLE players ADD COLUMN IF NOT EXISTS total_ic_spent NUMERIC DEFAULT 0`;

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
  // Level gate: corps on squares 20-31 require player level >= required_level
  await sql`ALTER TABLE corporations ADD COLUMN IF NOT EXISTS required_level INT DEFAULT 0`;

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
  // El Estado columns (added idempotently)
  await sql`ALTER TABLE game_state ADD COLUMN IF NOT EXISTS state_treasury NUMERIC DEFAULT 0`;
  await sql`ALTER TABLE game_state ADD COLUMN IF NOT EXISTS nissai_market_level INT DEFAULT 1`;

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
  // Personal branch column (role-locked nodes)
  await sql`ALTER TABLE tech_nodes ADD COLUMN IF NOT EXISTS required_role TEXT`;
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
  // Cost formula: T1=100, T2=250, T3=600, T4=1200, T5=2500
  //               T6=5000, T7=9000, T8=15000, T9=24000, T10=38000
  //               T11=60000, T12=90000, T13=130000, T14=180000, T15=240000
  //               T16=310000, T17=390000, T18=480000, T19=580000, T20=700000
  const TIER_COSTS = [0, 100, 250, 600, 1200, 2500, 5000, 9000, 15000, 24000, 38000, 60000, 90000, 130000, 180000, 240000, 310000, 390000, 480000, 580000, 700000];
  const FOG = '[DATOS ENCRIPTADOS - DESBLOQUEA PARA REVELAR]';

  const techSeed = [
    // ── FINANCIERA (fin-1 to fin-20) ──
    { id:'fin-1',  branch:'FINANCIERA', tier:1,  name:'Análisis Técnico',       description:'Visualizás históricos de FMV detallados.',                  effect_label:'+ insight',           prereq_id:null       },
    { id:'fin-2',  branch:'FINANCIERA', tier:2,  name:'Arbitraje',              description:'Tu discount de venta cae al 1.5% (en vez de 3%).',           effect_label:'sell -1.5% spread',   prereq_id:'fin-1'    },
    { id:'fin-3',  branch:'FINANCIERA', tier:3,  name:'Hedging',                description:'Tu wealth tax efectivo se reduce 20%.',                       effect_label:'tax -20%',            prereq_id:'fin-2'    },
    { id:'fin-4',  branch:'FINANCIERA', tier:4,  name:'HFT Bot',                description:'Premium de compra al 1.5% (en vez de 3%).',                  effect_label:'buy -1.5% spread',    prereq_id:'fin-3'    },
    { id:'fin-5',  branch:'FINANCIERA', tier:5,  name:'Dark Pool Access',       description:'Primer acceso al mercado oscuro. +5% retorno en ventas.',     effect_label:'sell +5% bonus',      prereq_id:'fin-4'    },
    { id:'fin-6',  branch:'FINANCIERA', tier:6,  name:'Flash Crash Protocol',   description:FOG, effect_label:'???', prereq_id:'fin-5'    },
    { id:'fin-7',  branch:'FINANCIERA', tier:7,  name:'Leverage Engine',        description:FOG, effect_label:'???', prereq_id:'fin-6'    },
    { id:'fin-8',  branch:'FINANCIERA', tier:8,  name:'Derivatives Desk',       description:FOG, effect_label:'???', prereq_id:'fin-7'    },
    { id:'fin-9',  branch:'FINANCIERA', tier:9,  name:'Sovereign Yield Curve',  description:FOG, effect_label:'???', prereq_id:'fin-8'    },
    { id:'fin-10', branch:'FINANCIERA', tier:10, name:'Algorithmic Underwriter',description:FOG, effect_label:'???', prereq_id:'fin-9'    },
    { id:'fin-11', branch:'FINANCIERA', tier:11, name:'Synthetic CDO',          description:FOG, effect_label:'???', prereq_id:'fin-10'   },
    { id:'fin-12', branch:'FINANCIERA', tier:12, name:'Quantitative Easing',    description:FOG, effect_label:'???', prereq_id:'fin-11'   },
    { id:'fin-13', branch:'FINANCIERA', tier:13, name:'Central Bank Override',  description:FOG, effect_label:'???', prereq_id:'fin-12'   },
    { id:'fin-14', branch:'FINANCIERA', tier:14, name:'Shadow Banking Grid',    description:FOG, effect_label:'???', prereq_id:'fin-13'   },
    { id:'fin-15', branch:'FINANCIERA', tier:15, name:'Systemic Risk Engine',   description:FOG, effect_label:'???', prereq_id:'fin-14'   },
    { id:'fin-16', branch:'FINANCIERA', tier:16, name:'Contagion Protocol',     description:FOG, effect_label:'???', prereq_id:'fin-15'   },
    { id:'fin-17', branch:'FINANCIERA', tier:17, name:'Black Swan Insurance',   description:FOG, effect_label:'???', prereq_id:'fin-16'   },
    { id:'fin-18', branch:'FINANCIERA', tier:18, name:'IMF Backdoor',           description:FOG, effect_label:'???', prereq_id:'fin-17'   },
    { id:'fin-19', branch:'FINANCIERA', tier:19, name:'Omnibus Fund',           description:FOG, effect_label:'???', prereq_id:'fin-18'   },
    { id:'fin-20', branch:'FINANCIERA', tier:20, name:'Infinite Leverage',      description:FOG, effect_label:'???', prereq_id:'fin-19'   },

    // ── URBANO (urb-1 to urb-20) ──
    { id:'urb-1',  branch:'URBANO', tier:1,  name:'Zonificación',         description:'Tu costo de mantenimiento -10%.',                             effect_label:'maint -10%',       prereq_id:null       },
    { id:'urb-2',  branch:'URBANO', tier:2,  name:'Renovación',           description:'Las corps donde sos CEO ganan +2% FMV/turno.',               effect_label:'CEO FMV +2%',      prereq_id:'urb-1'    },
    { id:'urb-3',  branch:'URBANO', tier:3,  name:'Gentrificación',       description:'Cuando sos CEO, recibís +10% extra de dividendos.',          effect_label:'CEO div +10%',     prereq_id:'urb-2'    },
    { id:'urb-4',  branch:'URBANO', tier:4,  name:'Distrito Premium',     description:'Tus corps son inmunes a caídas de FMV por demanda.',         effect_label:'FMV floor lock',   prereq_id:'urb-3'    },
    { id:'urb-5',  branch:'URBANO', tier:5,  name:'Smart City Core',      description:'Cada corp tuya con >30 shares genera +3% FMV pasivo.',        effect_label:'FMV +3% pasivo',   prereq_id:'urb-4'    },
    { id:'urb-6',  branch:'URBANO', tier:6,  name:'Vertical Integration', description:FOG, effect_label:'???', prereq_id:'urb-5'    },
    { id:'urb-7',  branch:'URBANO', tier:7,  name:'Eminent Domain',       description:FOG, effect_label:'???', prereq_id:'urb-6'    },
    { id:'urb-8',  branch:'URBANO', tier:8,  name:'Megaproject Fund',     description:FOG, effect_label:'???', prereq_id:'urb-7'    },
    { id:'urb-9',  branch:'URBANO', tier:9,  name:'Cultural Capital',     description:FOG, effect_label:'???', prereq_id:'urb-8'    },
    { id:'urb-10', branch:'URBANO', tier:10, name:'Urban Surveillance',   description:FOG, effect_label:'???', prereq_id:'urb-9'    },
    { id:'urb-11', branch:'URBANO', tier:11, name:'Gentrification Wave',  description:FOG, effect_label:'???', prereq_id:'urb-10'   },
    { id:'urb-12', branch:'URBANO', tier:12, name:'Corporate Colony',     description:FOG, effect_label:'???', prereq_id:'urb-11'   },
    { id:'urb-13', branch:'URBANO', tier:13, name:'Private Municipality', description:FOG, effect_label:'???', prereq_id:'urb-12'   },
    { id:'urb-14', branch:'URBANO', tier:14, name:'Autonomous Zone',      description:FOG, effect_label:'???', prereq_id:'urb-13'   },
    { id:'urb-15', branch:'URBANO', tier:15, name:'City-State Charter',   description:FOG, effect_label:'???', prereq_id:'urb-14'   },
    { id:'urb-16', branch:'URBANO', tier:16, name:'Neo-Feudal District',  description:FOG, effect_label:'???', prereq_id:'urb-15'   },
    { id:'urb-17', branch:'URBANO', tier:17, name:'District Sovereignty', description:FOG, effect_label:'???', prereq_id:'urb-16'   },
    { id:'urb-18', branch:'URBANO', tier:18, name:'Monopoly Urbano',      description:FOG, effect_label:'???', prereq_id:'urb-17'   },
    { id:'urb-19', branch:'URBANO', tier:19, name:'Terra Nullius',        description:FOG, effect_label:'???', prereq_id:'urb-18'   },
    { id:'urb-20', branch:'URBANO', tier:20, name:'Absolute Domain',      description:FOG, effect_label:'???', prereq_id:'urb-19'   },

    // ── LOGISTICA (log-1 to log-20) ──
    { id:'log-1',  branch:'LOGISTICA', tier:1,  name:'Cadena de Suministro',  description:'Recibís +5% extra de IC por turno.',                        effect_label:'IC +5%',             prereq_id:null       },
    { id:'log-2',  branch:'LOGISTICA', tier:2,  name:'Just-in-Time',          description:'IC por turno +15% adicional.',                              effect_label:'IC +15%',            prereq_id:'log-1'    },
    { id:'log-3',  branch:'LOGISTICA', tier:3,  name:'Red Distribuida',       description:'Reducción de mantenimiento adicional -5%.',                  effect_label:'maint -5% extra',    prereq_id:'log-2'    },
    { id:'log-4',  branch:'LOGISTICA', tier:4,  name:'Monopolio Operativo',   description:'+5% extra de dividendos cuando holdes >50% de una corp.',   effect_label:'monopoly bonus',     prereq_id:'log-3'    },
    { id:'log-5',  branch:'LOGISTICA', tier:5,  name:'Last-Mile Dominance',   description:'Reduce el alquiler de tránsito que pagás a la mitad.',       effect_label:'rent -50%',          prereq_id:'log-4'    },
    { id:'log-6',  branch:'LOGISTICA', tier:6,  name:'Neural Route Optimizer',description:FOG, effect_label:'???', prereq_id:'log-5'    },
    { id:'log-7',  branch:'LOGISTICA', tier:7,  name:'Predictive Inventory',  description:FOG, effect_label:'???', prereq_id:'log-6'    },
    { id:'log-8',  branch:'LOGISTICA', tier:8,  name:'Supply Chain AI',       description:FOG, effect_label:'???', prereq_id:'log-7'    },
    { id:'log-9',  branch:'LOGISTICA', tier:9,  name:'Global Distribution Hub',description:FOG, effect_label:'???', prereq_id:'log-8'   },
    { id:'log-10', branch:'LOGISTICA', tier:10, name:'Port Authority Override',description:FOG, effect_label:'???', prereq_id:'log-9'   },
    { id:'log-11', branch:'LOGISTICA', tier:11, name:'Trade Route Monopoly',  description:FOG, effect_label:'???', prereq_id:'log-10'   },
    { id:'log-12', branch:'LOGISTICA', tier:12, name:'Orbital Logistics',     description:FOG, effect_label:'???', prereq_id:'log-11'   },
    { id:'log-13', branch:'LOGISTICA', tier:13, name:'Automated Warehousing', description:FOG, effect_label:'???', prereq_id:'log-12'   },
    { id:'log-14', branch:'LOGISTICA', tier:14, name:'Dark Freight Network',  description:FOG, effect_label:'???', prereq_id:'log-13'   },
    { id:'log-15', branch:'LOGISTICA', tier:15, name:'Hyperloop Grid',        description:FOG, effect_label:'???', prereq_id:'log-14'   },
    { id:'log-16', branch:'LOGISTICA', tier:16, name:'Stratospheric Cargo',   description:FOG, effect_label:'???', prereq_id:'log-15'   },
    { id:'log-17', branch:'LOGISTICA', tier:17, name:'Subterranean Mesh',     description:FOG, effect_label:'???', prereq_id:'log-16'   },
    { id:'log-18', branch:'LOGISTICA', tier:18, name:'Quantum Routing',       description:FOG, effect_label:'???', prereq_id:'log-17'   },
    { id:'log-19', branch:'LOGISTICA', tier:19, name:'Infinite Throughput',   description:FOG, effect_label:'???', prereq_id:'log-18'   },
    { id:'log-20', branch:'LOGISTICA', tier:20, name:'Omnipresent Supply',    description:FOG, effect_label:'???', prereq_id:'log-19'   },

    // ── RAMA PERSONAL: DATA_SCIENTIST (ds-1 to ds-10) ──
    { id:'ds-1',  branch:'PERSONAL', tier:1,  required_role:'DATA_SCIENTIST', name:'Pipeline Automático',  description:'Tu generación de IC base sube +25% permanente.',   effect_label:'IC +25% base',     prereq_id:null    },
    { id:'ds-2',  branch:'PERSONAL', tier:2,  required_role:'DATA_SCIENTIST', name:'Feature Engineering',  description:'Cada compra tuya reduce el spread un 0.5% extra.', effect_label:'buy -0.5% extra',  prereq_id:'ds-1'  },
    { id:'ds-3',  branch:'PERSONAL', tier:3,  required_role:'DATA_SCIENTIST', name:'Modelo Predictivo',    description:'Revelás el FMV proyectado a 3 turnos de cualquier corp.', effect_label:'FMV forecast',prereq_id:'ds-2' },
    { id:'ds-4',  branch:'PERSONAL', tier:4,  required_role:'DATA_SCIENTIST', name:'Gradient Boosting',    description:'Tu wealth tax se reduce otro 10% acumulativo.',    effect_label:'tax -10% extra',   prereq_id:'ds-3'  },
    { id:'ds-5',  branch:'PERSONAL', tier:5,  required_role:'DATA_SCIENTIST', name:'Neural Alpha',         description:'Generás 2× IC en turnos pares.',                   effect_label:'IC ×2 par',        prereq_id:'ds-4'  },
    { id:'ds-6',  branch:'PERSONAL', tier:6,  required_role:'DATA_SCIENTIST', name:'Reinforcement Loop',   description:FOG, effect_label:'???', prereq_id:'ds-5' },
    { id:'ds-7',  branch:'PERSONAL', tier:7,  required_role:'DATA_SCIENTIST', name:'Adversarial Model',    description:FOG, effect_label:'???', prereq_id:'ds-6' },
    { id:'ds-8',  branch:'PERSONAL', tier:8,  required_role:'DATA_SCIENTIST', name:'Transformer Core',     description:FOG, effect_label:'???', prereq_id:'ds-7' },
    { id:'ds-9',  branch:'PERSONAL', tier:9,  required_role:'DATA_SCIENTIST', name:'AGI Protocol',         description:FOG, effect_label:'???', prereq_id:'ds-8' },
    { id:'ds-10', branch:'PERSONAL', tier:10, required_role:'DATA_SCIENTIST', name:'Singularity Engine',   description:FOG, effect_label:'???', prereq_id:'ds-9' },

    // ── RAMA PERSONAL: ECONOMIST (ec-1 to ec-10) ──
    { id:'ec-1',  branch:'PERSONAL', tier:1,  required_role:'ECONOMIST', name:'Macro Scanner',       description:'Ves el balance completo de todos los jugadores.',    effect_label:'full visibility',  prereq_id:null    },
    { id:'ec-2',  branch:'PERSONAL', tier:2,  required_role:'ECONOMIST', name:'Policy Lever',        description:'Una vez por campaña podés proponer un ajuste de tasa base (+/-5%).', effect_label:'rate control', prereq_id:'ec-1' },
    { id:'ec-3',  branch:'PERSONAL', tier:3,  required_role:'ECONOMIST', name:'Inflation Hedge',     description:'Tus dividendos no pueden caer por eventos macro bajistas.', effect_label:'div macro-immune', prereq_id:'ec-2' },
    { id:'ec-4',  branch:'PERSONAL', tier:4,  required_role:'ECONOMIST', name:'Arbitrage Network',   description:'Venta siempre al precio spot (sin descuento).',         effect_label:'sell 0% discount', prereq_id:'ec-3' },
    { id:'ec-5',  branch:'PERSONAL', tier:5,  required_role:'ECONOMIST', name:'Fiscal Architect',    description:'Tu último bracket impositivo baja 3% permanente.',      effect_label:'tax bracket -3%',  prereq_id:'ec-4' },
    { id:'ec-6',  branch:'PERSONAL', tier:6,  required_role:'ECONOMIST', name:'Central Bank Liaison',description:FOG, effect_label:'???', prereq_id:'ec-5' },
    { id:'ec-7',  branch:'PERSONAL', tier:7,  required_role:'ECONOMIST', name:'Sovereign Fund',      description:FOG, effect_label:'???', prereq_id:'ec-6' },
    { id:'ec-8',  branch:'PERSONAL', tier:8,  required_role:'ECONOMIST', name:'Liquidity Provider',  description:FOG, effect_label:'???', prereq_id:'ec-7' },
    { id:'ec-9',  branch:'PERSONAL', tier:9,  required_role:'ECONOMIST', name:'World Reserve',       description:FOG, effect_label:'???', prereq_id:'ec-8' },
    { id:'ec-10', branch:'PERSONAL', tier:10, required_role:'ECONOMIST', name:'Economic Singularity', description:FOG, effect_label:'???', prereq_id:'ec-9' },

    // ── RAMA PERSONAL: PSYCHOLOGIST (ps-1 to ps-10) ──
    { id:'ps-1',  branch:'PERSONAL', tier:1,  required_role:'PSYCHOLOGIST', name:'Behavioral Audit',    description:'Una vez por turno podés ver las órdenes pendientes de un jugador.', effect_label:'order spy',      prereq_id:null    },
    { id:'ps-2',  branch:'PERSONAL', tier:2,  required_role:'PSYCHOLOGIST', name:'Panic Therapy',       description:'Si un jugador cae en C11, vos recibís +$300 extra.',          effect_label:'+$300/bankrupt',  prereq_id:'ps-1'  },
    { id:'ps-3',  branch:'PERSONAL', tier:3,  required_role:'PSYCHOLOGIST', name:'Group Dynamics',      description:'Tus dividendos +5% cuando hay ≥2 alianzas activas.',            effect_label:'div +5% sociales', prereq_id:'ps-2' },
    { id:'ps-4',  branch:'PERSONAL', tier:4,  required_role:'PSYCHOLOGIST', name:'Cognitive Dissonance',description:'Reduces el impacto de Nissai RUMOR sobre tus corps a -5%.',    effect_label:'RUMOR nerf -50%', prereq_id:'ps-3'  },
    { id:'ps-5',  branch:'PERSONAL', tier:5,  required_role:'PSYCHOLOGIST', name:'Stockholm Protocol',  description:'Cobras honorarios cuando se rompe cualquier alianza (no solo las tuyas).', effect_label:'universal fee', prereq_id:'ps-4' },
    { id:'ps-6',  branch:'PERSONAL', tier:6,  required_role:'PSYCHOLOGIST', name:'Social Engineering',  description:FOG, effect_label:'???', prereq_id:'ps-5' },
    { id:'ps-7',  branch:'PERSONAL', tier:7,  required_role:'PSYCHOLOGIST', name:'Mass Hysteria',       description:FOG, effect_label:'???', prereq_id:'ps-6' },
    { id:'ps-8',  branch:'PERSONAL', tier:8,  required_role:'PSYCHOLOGIST', name:'Cult of Personality', description:FOG, effect_label:'???', prereq_id:'ps-7' },
    { id:'ps-9',  branch:'PERSONAL', tier:9,  required_role:'PSYCHOLOGIST', name:'Reality Distortion',  description:FOG, effect_label:'???', prereq_id:'ps-8' },
    { id:'ps-10', branch:'PERSONAL', tier:10, required_role:'PSYCHOLOGIST', name:'Omniscient Analyst',  description:FOG, effect_label:'???', prereq_id:'ps-9' },

    // ── RAMA PERSONAL: SYSTEMS_ENGINEER (se-1 to se-10) ──
    { id:'se-1',  branch:'PERSONAL', tier:1,  required_role:'SYSTEMS_ENGINEER', name:'Cost Optimization',  description:'Tu costo fijo de servidor baja de $50 a $25/turno.',         effect_label:'server -$25',       prereq_id:null    },
    { id:'se-2',  branch:'PERSONAL', tier:2,  required_role:'SYSTEMS_ENGINEER', name:'Redundant Systems',  description:'Inmunidad total al sabotaje BLACKOUT en tus corps.',           effect_label:'BLACKOUT immune',   prereq_id:'se-1'  },
    { id:'se-3',  branch:'PERSONAL', tier:3,  required_role:'SYSTEMS_ENGINEER', name:'Zero-Day Arsenal',   description:'Tu HACK de Nissai roba 40% de IC (en vez de 30%).',           effect_label:'HACK +10%',         prereq_id:'se-2'  },
    { id:'se-4',  branch:'PERSONAL', tier:4,  required_role:'SYSTEMS_ENGINEER', name:'Distributed Firewall','description':'Inmunidad al sabotaje HACK sobre vos.',                    effect_label:'HACK immune',       prereq_id:'se-3'  },
    { id:'se-5',  branch:'PERSONAL', tier:5,  required_role:'SYSTEMS_ENGINEER', name:'Autonomous Grid',    description:'Tu generación de IC no puede ser reducida por ningún evento.', effect_label:'IC floor lock',     prereq_id:'se-4'  },
    { id:'se-6',  branch:'PERSONAL', tier:6,  required_role:'SYSTEMS_ENGINEER', name:'Neural Firewall',    description:FOG, effect_label:'???', prereq_id:'se-5' },
    { id:'se-7',  branch:'PERSONAL', tier:7,  required_role:'SYSTEMS_ENGINEER', name:'Quantum Encryption', description:FOG, effect_label:'???', prereq_id:'se-6' },
    { id:'se-8',  branch:'PERSONAL', tier:8,  required_role:'SYSTEMS_ENGINEER', name:'AI Oversight',       description:FOG, effect_label:'???', prereq_id:'se-7' },
    { id:'se-9',  branch:'PERSONAL', tier:9,  required_role:'SYSTEMS_ENGINEER', name:'System Singularity', description:FOG, effect_label:'???', prereq_id:'se-8' },
    { id:'se-10', branch:'PERSONAL', tier:10, required_role:'SYSTEMS_ENGINEER', name:'Panopticon Core',    description:FOG, effect_label:'???', prereq_id:'se-9' },

    // ── RAMA PERSONAL: MECH_ENGINEER (me-1 to me-10) ──
    { id:'me-1',  branch:'PERSONAL', tier:1,  required_role:'MECH_ENGINEER', name:'Retrofitting',        description:'El descuento -20% en Zona Industrial se extiende a Zona Norte.',   effect_label:'Norte -20%',        prereq_id:null    },
    { id:'me-2',  branch:'PERSONAL', tier:2,  required_role:'MECH_ENGINEER', name:'Efficiency Protocol', description:'Mantenimiento de tus corps industriales -15% adicional.',          effect_label:'industrial maint-15%', prereq_id:'me-1' },
    { id:'me-3',  branch:'PERSONAL', tier:3,  required_role:'MECH_ENGINEER', name:'Infrastructure Lock',  description:'Tus corps industriales no pueden ser BLACKOUT por 3 turnos.',      effect_label:'BLACKOUT delay',    prereq_id:'me-2'  },
    { id:'me-4',  branch:'PERSONAL', tier:4,  required_role:'MECH_ENGINEER', name:'Robotic Workforce',   description:'+10% dividendos en todas tus corps industriales.',                  effect_label:'industrial div +10%', prereq_id:'me-3' },
    { id:'me-5',  branch:'PERSONAL', tier:5,  required_role:'MECH_ENGINEER', name:'Factory of the Future',description:'Duplicás el ingreso base de una corp industrial que seas CEO.',   effect_label:'CEO income ×2',     prereq_id:'me-4'  },
    { id:'me-6',  branch:'PERSONAL', tier:6,  required_role:'MECH_ENGINEER', name:'Cybernetic Assembly', description:FOG, effect_label:'???', prereq_id:'me-5' },
    { id:'me-7',  branch:'PERSONAL', tier:7,  required_role:'MECH_ENGINEER', name:'Megafactory',         description:FOG, effect_label:'???', prereq_id:'me-6' },
    { id:'me-8',  branch:'PERSONAL', tier:8,  required_role:'MECH_ENGINEER', name:'Resource Singularity',description:FOG, effect_label:'???', prereq_id:'me-7' },
    { id:'me-9',  branch:'PERSONAL', tier:9,  required_role:'MECH_ENGINEER', name:'Industrial Hegemony', description:FOG, effect_label:'???', prereq_id:'me-8' },
    { id:'me-10', branch:'PERSONAL', tier:10, required_role:'MECH_ENGINEER', name:'Iron Monopoly',       description:FOG, effect_label:'???', prereq_id:'me-9' },
  ];

  for (const n of techSeed) {
    const cost = TIER_COSTS[n.tier] || 200;
    const rRole = n.required_role || null;
    await sql`
      INSERT INTO tech_nodes (id, branch, tier, name, description, base_cost, prereq_id, effect_label, required_role)
      VALUES (${n.id}, ${n.branch}, ${n.tier}, ${n.name}, ${n.description}, ${cost}, ${n.prereq_id}, ${n.effect_label}, ${rRole})
      ON CONFLICT (id) DO UPDATE SET
        branch=EXCLUDED.branch, tier=EXCLUDED.tier, name=EXCLUDED.name,
        description=EXCLUDED.description, base_cost=EXCLUDED.base_cost,
        prereq_id=EXCLUDED.prereq_id, effect_label=EXCLUDED.effect_label,
        required_role=EXCLUDED.required_role
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

  // --- El Rey Nissai: Dark Market Sabotage ---
  await sql`CREATE TABLE IF NOT EXISTS nissai_orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    attacker_id UUID REFERENCES players(id) ON DELETE CASCADE,
    target_player_id UUID REFERENCES players(id) ON DELETE SET NULL,
    target_corp_id UUID REFERENCES corporations(id) ON DELETE SET NULL,
    sabotage_type TEXT NOT NULL,
    cost_ic NUMERIC(14,2) NOT NULL DEFAULT 0,
    cost_cash NUMERIC(14,2) NOT NULL DEFAULT 0,
    turn_number INT NOT NULL,
    status TEXT NOT NULL DEFAULT 'PENDING',
    result_note TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    CHECK (sabotage_type IN ('AUDIT','HACK','BLACKOUT','RUMOR','FISCO'))
  )`;
  await sql`CREATE INDEX IF NOT EXISTS idx_nissai_turn ON nissai_orders(turn_number, status)`;

  // --- Casino de Medianoche ---
  await sql`CREATE TABLE IF NOT EXISTS casino_bets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    player_id UUID REFERENCES players(id) ON DELETE CASCADE,
    turn_number INT NOT NULL,
    bet_amount NUMERIC(14,2) NOT NULL,
    result TEXT,
    payout NUMERIC(14,2),
    resolved BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(player_id, turn_number)
  )`;

  // --- Tech Orders (WEGO queue) ---
  await sql`CREATE TABLE IF NOT EXISTS tech_orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    player_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
    node_id TEXT NOT NULL,
    turn_number INT NOT NULL,
    ic_paid INT NOT NULL,
    status TEXT NOT NULL DEFAULT 'PENDING',
    result_note TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(player_id, node_id, turn_number),
    CHECK(status IN ('PENDING','EXECUTED','REJECTED','CANCELLED'))
  )`;
  await sql`CREATE INDEX IF NOT EXISTS idx_tech_orders_turn ON tech_orders(turn_number, status)`;

  // --- Oráculo del Mercado (IC Predictions) ---
  await sql`CREATE TABLE IF NOT EXISTS ic_predictions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    player_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
    corp_id UUID NOT NULL REFERENCES corporations(id) ON DELETE CASCADE,
    turn_number INT NOT NULL,
    ic_bet INT NOT NULL,
    direction TEXT NOT NULL,
    fmv_at_bet NUMERIC NOT NULL,
    resolved BOOLEAN DEFAULT FALSE,
    won BOOLEAN,
    payout_ic INT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(player_id, corp_id, turn_number),
    CHECK(direction IN ('UP','DOWN'))
  )`;
  await sql`CREATE INDEX IF NOT EXISTS idx_ic_predictions_turn ON ic_predictions(turn_number, resolved)`;

  // --- Contratos de Bounty P2P ---
  await sql`CREATE TABLE IF NOT EXISTS bounty_contracts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    poster_id UUID REFERENCES players(id) ON DELETE CASCADE,
    target_id UUID REFERENCES players(id) ON DELETE CASCADE,
    reward_cash NUMERIC(14,2) NOT NULL,
    turns_to_expire INT NOT NULL DEFAULT 5,
    placed_at_turn INT NOT NULL,
    status TEXT NOT NULL DEFAULT 'ACTIVE',
    claimed_by UUID REFERENCES players(id) ON DELETE SET NULL,
    claimed_at_turn INT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    CHECK (poster_id <> target_id),
    CHECK (status IN ('ACTIVE','CLAIMED','EXPIRED','CANCELLED'))
  )`;
  await sql`CREATE INDEX IF NOT EXISTS idx_bounty_status ON bounty_contracts(status, target_id)`;

  // --- Lobby Político (IC sink — market manipulation & perks) ---
  await sql`CREATE TABLE IF NOT EXISTS ic_lobbies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    player_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
    corp_id UUID REFERENCES corporations(id) ON DELETE CASCADE,
    lobby_type TEXT NOT NULL,
    ic_paid INT NOT NULL,
    turn_number INT NOT NULL,
    resolved BOOLEAN DEFAULT FALSE,
    effect_applied TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    CHECK(lobby_type IN ('LOBBY_BULL','LOBBY_BEAR','LOBBY_TAX_BREAK'))
  )`;
  await sql`CREATE INDEX IF NOT EXISTS idx_ic_lobbies_turn ON ic_lobbies(turn_number, resolved)`;

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
    // ── Casillas 0-19 (tablero inicial) ──
    { name: 'BARRIO 77 SNEAKERS',  district: 'Zona Sur',         tagline: 'Kicks del asfalto',          req_level: 0 },
    { name: 'CALLE ROJA THREADS',  district: 'Centro',           tagline: 'Hilos rebeldes',             req_level: 0 },
    { name: 'NEON BAJO TOKYO',     district: 'Distrito Neón',    tagline: 'Luces que no duermen',       req_level: 0 },
    { name: 'CONCRETO CLUB',       district: 'Zona Industrial',  tagline: 'Jersey, hormigón, gloria',   req_level: 0 },
    { name: 'AVENIDA VAPOR',       district: 'Puerto',           tagline: 'Vinilo y humo',              req_level: 0 },
    { name: 'HYPE INDUSTRIA',      district: 'Centro',           tagline: 'La fábrica del drop',        req_level: 0 },
    { name: 'POLVO DORADO CO.',    district: 'Zona Alta',        tagline: 'Oro en polvo, nada fake',    req_level: 0 },
    { name: 'TINTA ETERNA',        district: 'Barrio Viejo',     tagline: 'Ink para toda la vida',      req_level: 0 },
    { name: 'CAOS BOUTIQUE',       district: 'Centro',           tagline: 'Orden a través del caos',    req_level: 0 },
    { name: 'LIENZO URBANO',       district: 'Distrito Arte',    tagline: 'Muros que hablan',           req_level: 0 },
    { name: 'RUIDO ESTUDIO',       district: 'Zona Norte',       tagline: 'Beats del subte',            req_level: 0 },
    { name: 'SUR PROFUNDO',        district: 'Zona Sur',         tagline: 'Sangre y denim',             req_level: 0 },
    { name: 'GRAFITO APPAREL',     district: 'Distrito Neón',    tagline: 'Monochrome mafia',           req_level: 0 },
    { name: 'METROPOLIS ROPA',     district: 'Centro',           tagline: 'La ciudad se viste sola',    req_level: 0 },
    { name: 'SMOG COLLECTIVE',     district: 'Zona Industrial',  tagline: 'Respiramos hype',            req_level: 0 },
    { name: 'OXIDO 808',           district: 'Puerto',           tagline: 'Herrumbre premium',          req_level: 0 },
    { name: 'KAMIKAZE KICKS',      district: 'Zona Alta',        tagline: 'All-in desde el nacimiento', req_level: 0 },
    { name: 'RUTA 99 DENIM',       district: 'Zona Norte',       tagline: 'Jeans con kilómetros',       req_level: 0 },
    { name: 'ALERTA NARANJA',      district: 'Distrito Arte',    tagline: 'Peligroso de usar',          req_level: 0 },
    { name: 'ECLIPSE BRAND',       district: 'Barrio Viejo',     tagline: 'Oscuridad vendida',          req_level: 0 },
    // ── Casillas 21-31 (zona avanzada, nivel requerido) ──
    { name: 'NEXUS HOLDINGS',      district: 'Distrito Crypto',  tagline: 'El dinero no duerme',        req_level: 2 },
    { name: 'HYPERION LABS',       district: 'Zona Biopunk',     tagline: 'Ciencia sin ética',          req_level: 2 },
    { name: 'VOID INDUSTRIES',     district: 'Distrito Crypto',  tagline: 'Vacío y rendimiento',        req_level: 3 },
    { name: 'AURORA CAPITAL',      district: 'Zona Biopunk',     tagline: 'Capital sobre todo',         req_level: 3 },
    { name: 'PHANTOM THREADS',     district: 'Zona Fantasma',    tagline: 'Invisible al mercado',       req_level: 4 },
    { name: 'GRID ZERO',           district: 'Zona Fantasma',    tagline: 'Red de cero',                req_level: 4 },
    { name: 'SABLE FINANCE',       district: 'Distrito Oscuro',  tagline: 'Finanzas en la oscuridad',   req_level: 5 },
    { name: 'CHROME SYNDICATE',    district: 'Distrito Oscuro',  tagline: 'Sindicato del cromo',        req_level: 5 },
    { name: 'APEX HOLDINGS',       district: 'Cima',             tagline: 'Solo los mejores llegan',    req_level: 6 },
    { name: 'ZENITH CORP',         district: 'Cima',             tagline: 'El techo del mercado',       req_level: 7 },
    { name: 'SIGMA PRIME',         district: 'Cima',             tagline: 'La última frontera',         req_level: 8 },
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

  // Board layout: 32 squares (0-31).
  //   Specials: 5=Prendas, 10=Psicólogo, 15=Prendas, 20=El Estado, 25=Prendas, 30=Mercado Negro
  //   Corps on squares: 0-4, 6-9, 11-14, 16-19, 21-24, 26-29, 31 (25 corp squares)
  //   First 20 corps get squares 0-19 (minus specials). Last 11 get squares 21-31 (minus specials).
  const BOARD_CORP_POSITIONS = [
    0, 1, 2, 3, 4,          // corps 0-4
    6, 7, 8, 9,             // corps 5-8  (skip 5=Prendas)
    11, 12, 13, 14,         // corps 9-12 (skip 10=Psicólogo)
    16, 17, 18, 19,         // corps 13-16 (skip 15=Prendas)
    null, null, null,       // corps 17-19 off-board (first 20 corps)
    21, 22, 23, 24,         // corps 20-23 (skip 20=El Estado)
    26, 27, 28, 29,         // corps 24-27 (skip 25=Prendas)
    31,                     // corp 28 (skip 30=Mercado Negro)
    null, null,             // corps 29-30 off-board
  ];

  // Insert corps with varied FMV & income
  const corpRows = [];
  for (let i = 0; i < corps.length; i++) {
    const c = corps[i];
    let fmv;
    if (i < 7)       fmv = 800  + Math.floor(Math.random() * 700);
    else if (i < 14) fmv = 1500 + Math.floor(Math.random() * 1500);
    else if (i < 20) fmv = 3000 + Math.floor(Math.random() * 2500);
    else if (i < 25) fmv = 6000 + Math.floor(Math.random() * 4000);
    else             fmv = 12000 + Math.floor(Math.random() * 8000);
    const baseIncome = Math.round(fmv * (0.045 + Math.random() * 0.025) * 100) / 100;
    const boardPos = BOARD_CORP_POSITIONS[i] ?? null;
    const reqLevel = c.req_level || 0;
    const [row] = await sql`
      INSERT INTO corporations (name, district, tagline, fair_market_value, base_income, board_position, required_level)
      VALUES (${c.name}, ${c.district}, ${c.tagline}, ${fmv}, ${baseIncome}, ${boardPos}, ${reqLevel})
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
