'use client';
import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ChevronDown, ChevronRight, BookOpen, Search } from 'lucide-react';

const SECTIONS = [
  {
    id: 'wego',
    emoji: '⏱️',
    title: 'Sistema WEGO',
    content: [
      'Todos los jugadores envían sus órdenes en silencio durante el día.',
      'A las 00:00 ART el cron de Vercel resuelve el turno automáticamente.',
      'Las fases de resolución son: Alianzas → Trades → Tablero → Dividendos → Mantenimiento → CEO → Impuesto → IC → Quiebra.',
      'Solo tenés 1 tirada de dado por turno. Si no tiraste, el modal te aparece al entrar.',
    ],
  },
  {
    id: 'board',
    emoji: '🏙️',
    title: 'Tablero (20 casillas)',
    content: [
      '17 casillas tienen corporaciones — aterrizás y pagás alquiler de tránsito (5% del FMV) a los accionistas de esa corp.',
      'Casilla 5 y 15 → ⚠️ PRENDAS: cumplís el castigo físico acordado por el grupo.',
      'Casilla 10 → 🛋️ EL PSICÓLOGO: pagás $200 automáticamente. El dinero va a SANTI (rol Psicólogo).',
      '3 corporaciones están off-board (sin casilla) — no generan tránsito.',
    ],
  },
  {
    id: 'market',
    emoji: '📈',
    title: 'Mercado y FMV',
    content: [
      'FMV = Fair Market Value (valor total de la corporación).',
      'Precio por share = FMV / 100 shares totales.',
      'Comprar sube el FMV; vender lo baja (3% de ajuste por share neto).',
      'Compra con +3% premium, venta con -3% discount (se reduce al 1.5% con tech fin-2/fin-4).',
      'Banda de precio: ×0.5 mínimo / ×2.5 máximo del FMV base.',
    ],
  },
  {
    id: 'taxes',
    emoji: '💸',
    title: 'Impuesto Progresivo',
    content: [
      '0% sobre los primeros $10.000 de Net Worth.',
      '2.5% sobre $10.001 – $50.000.',
      '7% sobre $50.001 – $150.000.',
      '15% sobre todo lo que supere $150.000 (12% si sos ECONOMIST).',
      'El tech fin-3 (Hedging) reduce tu impuesto efectivo un 20%.',
      'Chapter 11 otorga 5 turnos de exención impositiva.',
    ],
  },
  {
    id: 'escrow',
    emoji: '🤝',
    title: 'Alianzas y Escrow',
    content: [
      'Podés proponer alianzas con otro jugador bloqueando un % de tu cash en escrow.',
      'Si alguien intenta comprar shares de una corp cuyo CEO es tu aliado → ruptura automática.',
      'Al romperse: el traidor pierde su escrow, que va íntegro a la víctima.',
      'SANTI (Psicólogo) cobra el 5% del total de escrow como honorario terapéutico.',
      'Las alianzas disueltas de mutuo acuerdo devuelven el escrow sin penalidad.',
      'Beneficio activo: si aterrizás en una corp donde tu aliado es accionista, el alquiler de tránsito se cancela.',
      'IC Synergy: por cada corp que ambos aliados holdean juntos, ambos reciben +5% del IC base del turno (máx ×3).',
    ],
  },
  {
    id: 'techtree',
    emoji: '🔬',
    title: 'Tech Tree (IC)',
    content: [
      'Gastás IC (Intellectual Capital) para desbloquear nodos de 3 ramas + 1 Personal.',
      'FINANCIERA: fin-1 (insight) → fin-2 (sell -1.5%) → fin-3 (tax -20%) → fin-4 (buy -1.5%).',
      'URBANO: urb-1 (maint -10%) → urb-2 (CEO FMV +2%/turno) → urb-3 (CEO div +10%) → urb-4 (FMV floor).',
      'LOGÍSTICA: log-1 (IC +5%) → log-2 (IC +15%) → log-3 (maint -5%) → log-4 (monopoly +5% div si holdeás >50%).',
      'Un nodo desbloqueado es PATENTE tuya por 10 turnos. Luego pasa a OPEN_SOURCE y cualquiera se beneficia.',
      'Los nodos Tier 6+ están cubiertos por niebla de guerra — no se ve su descripción hasta desbloquearlos.',
    ],
  },
  {
    id: 'bankruptcy',
    emoji: '💀',
    title: 'Quiebra (Chapter 11)',
    content: [
      'Si tu cash cae a negativo al final del turno → Chapter 11 automático.',
      'Recibís una inyección de $2.000 de liquidez de emergencia.',
      'Quedás 5 turnos exento de impuestos.',
      'SANTI cobra el 5% de la inyección como honorarios.',
      'Para recuperarte: llegá a $500 de cash nuevamente. El sistema lo detecta automáticamente.',
      'Prevención: balanceá dividendos contra mantenimiento (1.5% del FMV × % que holdeás, por turno).',
    ],
  },
  {
    id: 'events',
    emoji: '🌐',
    title: 'Eventos Globales',
    content: [
      'Cada turno tiene un 40% de probabilidad de disparar un Evento Global.',
      'DISTRICT FMV: todas las corps de un barrio suben o bajan (entre -12% y +15%).',
      'ALL FMV: el mercado entero sube o baja un 7% (bull/bear).',
      'IC BOOM: todos reciben un bonus del 30% del IC base del turno.',
      'TAX HOLIDAY: el gobierno te devuelve el 50% del impuesto del turno anterior.',
      'No se repite el mismo evento en los últimos 5 turnos.',
      'El bot de Telegram avisa al grupo qué evento ocurrió y en qué zona.',
    ],
  },
  {
    id: 'roles',
    emoji: '🎭',
    title: 'Roles',
    content: [
      'DATA SCIENTIST (FRANKI): +5% precio de compra. Genera más IC base.',
      'ECONOMIST (CECE / TOBE): +10% dividendos, top bracket impositivo al 12%.',
      'PSYCHOLOGIST (SANTI): -15% dividendos base, cobra honorarios en terapia/escrow/quiebra.',
      'SYSTEMS ENGINEER (BEN / RETA): paga $50 fijos de servidor por turno, sin importar quiebra.',
      'MECH ENGINEER (MANU): -20% precio de compra en Zona Industrial.',
    ],
  },
  {
    id: 'lobby',
    emoji: '🏛️',
    title: 'Lobby Político',
    content: [
      'Nuevo sink de IC — quemás capital intelectual para influir en el mercado.',
      '📣 Pump Mediático (200 IC): sube el FMV de una corp elegida un 8% al resolver el turno.',
      '🐻 Short Institucional (300 IC): baja el FMV de una corp elegida un 8% al resolver el turno.',
      '🏛️ Exención Fiscal (350 IC): te otorga 2 turnos extra de exención impositiva (apilable con Chapter 11).',
      'Todas las órdenes de Lobby son públicas — el gossip feed avisa a todos quién hizo qué.',
      'Cancelar una orden antes de medianoche devuelve el 50% del IC.',
      'Solo podés tener 1 lobby activo a la vez.',
    ],
  },
];

const DICTIONARY = [
  {
    term: 'FMV',
    full: 'Fair Market Value',
    emoji: '💹',
    category: 'mercado',
    def: 'Es el valor total de una corporación en el momento actual. Determina el precio de cada share (FMV ÷ 100). Sube cuando se compran acciones y baja cuando se venden. También se ve afectado por eventos globales y lobbies.',
    formula: 'Precio por share = FMV ÷ 100 shares',
  },
  {
    term: 'Spread',
    full: 'Diferencial Compra/Venta',
    emoji: '↔️',
    category: 'mercado',
    def: 'La diferencia entre el precio al que comprás (Ask) y el precio al que vendés (Bid). En Distrito 77, comprás con un +3% sobre el FMV y vendés con un -3% de descuento. Con los techs fin-2 y fin-4, ese spread se reduce al 1.5%.',
    formula: 'Compra = precio × 1.03 | Venta = precio × 0.97',
  },
  {
    term: 'IC',
    full: 'Intellectual Capital',
    emoji: '⚡',
    category: 'progresion',
    def: 'El recurso secundario del juego. Se acumula cada turno de forma automática según una fórmula que escala con el número de turno y tu rol. Se usa para desbloquear nodos del Tech Tree y hacer lobbies políticos. No se puede transferir.',
    formula: 'IC base = 30 + 2×turno | DATA SCIENTIST ×1.5 | ECONOMIST ×1.2 | Resto ×1.0',
  },
  {
    term: 'Net Worth',
    full: 'Patrimonio Neto',
    emoji: '🏦',
    category: 'economia',
    def: 'La base imponible para el impuesto progresivo. Se calcula sumando tu cash más el valor de mercado de todas tus acciones. Cuanto más alto tu NW, mayor es el tramo impositivo que te aplica.',
    formula: 'NW = cash + Σ(shares_poseídos × precio_actual)',
  },
  {
    term: 'Dividendo',
    full: 'Dividend',
    emoji: '💰',
    category: 'economia',
    def: 'Ingreso pasivo que recibís por holdear acciones. Cada turno, las corps distribuyen un porcentaje del FMV entre sus accionistas proporcional a sus shares. El ECONOMIST tiene +10% de yield. El PSYCHOLOGIST tiene -15%.',
    formula: 'Div = FMV × yield_rate × (mis_shares ÷ 100)',
  },
  {
    term: 'Yield',
    full: 'Tasa de Dividendo',
    emoji: '📊',
    category: 'economia',
    def: 'El porcentaje del FMV que una corporación distribuye como dividendo por turno. Cada corp tiene su propia tasa base. El rol del jugador y ciertos techs (urb-3 si sos CEO) pueden modificarla. A mayor yield, más ingreso pasivo pero también más riesgo de quiebra si el FMV cae.',
  },
  {
    term: 'Mantenimiento',
    full: 'Maintenance Cost',
    emoji: '🔧',
    category: 'economia',
    def: 'El costo de holdear acciones cada turno. Es el 1.5% del FMV de la corp multiplicado por tu porcentaje de tenencia. Si tenés el 30% de una corp con FMV $10.000, pagás $45/turno. El tech urb-1 reduce este costo un 10%.',
    formula: 'Maint = FMV × 0.015 × (mis_shares ÷ 100)',
  },
  {
    term: 'Flujo',
    full: 'Net Cash Flow',
    emoji: '🌊',
    category: 'economia',
    def: 'La diferencia entre lo que entra (dividendos + alquileres cobrados) y lo que sale (mantenimiento + alquileres pagados + impuestos) por turno. Un Flujo positivo significa que tu posición se sostiene sola. Un Flujo negativo te va consumiendo el cash.',
    formula: 'Flujo = dividendos - mantenimiento - impuesto - alquileres_pagados + alquileres_cobrados',
  },
  {
    term: 'Transit Rent',
    full: 'Alquiler de Tránsito',
    emoji: '🚏',
    category: 'tablero',
    def: 'Cuando aterrizás en una casilla con corporación, pagás el 5% del FMV de esa corp distribuido entre todos sus accionistas (proporcional a shares). Si sos vos el único accionista, te lo pagás a vos mismo (cero efecto). Si tenés alianza con un accionista, el alquiler se exime.',
    formula: 'Alquiler = FMV × 0.05 distribuido por % de shares',
  },
  {
    term: 'Escrow',
    full: 'Depósito en Garantía',
    emoji: '🔒',
    category: 'alianzas',
    def: 'El cash que bloqueás al proponer una alianza. Queda congelado y no podés usarlo mientras la alianza está activa. Si traicionás (comprás shares de una corp cuyo CEO es tu aliado), perdés todo tu escrow que va a la víctima. La disolución amistosa lo devuelve completo.',
  },
  {
    term: 'Chapter 11',
    full: 'Bancarrota / Reestructuración',
    emoji: '💀',
    category: 'economia',
    def: 'Estado de quiebra que se activa automáticamente si tu cash baja a cero al final del turno. Recibís $2.000 de liquidez de emergencia, 5 turnos de exención impositiva, y SANTI cobra el 5% como honorario. Para salir: alcanzá $500 de cash.',
  },
  {
    term: 'Patente',
    full: 'Patent — Nodo Tech Exclusivo',
    emoji: '🔐',
    category: 'progresion',
    def: 'Cuando sos el primero en desbloquear un nodo del Tech Tree, lo patenteás por 10 turnos. Solo vos recibís sus beneficios durante ese período. Después pasa a Open Source y todos se benefician. Los nodos de la Rama Personal son patente permanente.',
  },
  {
    term: 'Open Source',
    full: 'Nodo Tech Público',
    emoji: '🌐',
    category: 'progresion',
    def: 'Estado de un nodo del Tech Tree una vez vencida la patente (10 turnos). Cualquier jugador se beneficia automáticamente del efecto aunque no haya pagado IC. El costo de desbloquearlo en Open Source es un 25% del costo original.',
  },
  {
    term: 'ROI',
    full: 'Return on Investment',
    emoji: '📈',
    category: 'mercado',
    def: 'Cuánto ganás en proporción a lo que invertiste. En Distrito 77 podés calcular el ROI de una posición comparando el yield anualizado contra el spread que pagaste al comprar. Un ROI alto significa que tus shares te generan mucho retorno relativo al costo de entrada.',
    formula: 'ROI = (ganancia neta ÷ costo de entrada) × 100%',
  },
  {
    term: 'CEO',
    full: 'Chief Executive Officer',
    emoji: '👑',
    category: 'corporaciones',
    def: 'El jugador con mayor cantidad de shares en una corporación. Si tenés más del 50% de las acciones, sos CEO y podés activar el efecto de techs como urb-2 (FMV +2%/turno) y urb-3 (+10% dividendos). Si alguien te supera en shares, perdés el CEO.',
  },
  {
    term: 'Fog of War',
    full: 'Niebla de Guerra',
    emoji: '👁️',
    category: 'progresion',
    def: 'Los nodos Tier 6 o superior del Tech Tree aparecen cifrados: nombre visible, descripción oculta. No sabés qué hace un nodo hasta desbloquearlo o que alguien más lo patente. Crea incertidumbre estratégica en la fase avanzada del juego.',
  },
  {
    term: 'Lobby Político',
    full: 'IC Sink de Influencia',
    emoji: '🏛️',
    category: 'progresion',
    def: 'Mecánica que permite quemar IC para manipular el mercado o conseguir beneficios fiscales. Hay 3 tipos: Pump Mediático (sube FMV +8%), Short Institucional (baja FMV -8%) y Exención Fiscal (+2 turnos sin impuesto). Todas son públicas y visibles en el gossip feed.',
  },
  {
    term: 'FMV Base',
    full: 'FMV de Referencia',
    emoji: '⚓',
    category: 'mercado',
    def: 'El FMV inicial de una corporación al comienzo del juego. Sirve como ancla para calcular la banda de precio (mínimo ×0.5, máximo ×2.5 del FMV base). Ningún evento ni compra puede llevarte fuera de esa banda.',
  },
  {
    term: 'Flame Score',
    full: 'Índice de Actividad',
    emoji: '🔥',
    category: 'mercado',
    def: 'Métrica interna que pondera el volumen de operaciones recientes en una corporación. Las corps con más operaciones aparecen primero en el Market. Las corps bloqueadas por nivel aparecen siempre al final.',
  },
  {
    term: 'WEGO',
    full: '"We Go" — Simultaneous Turn System',
    emoji: '⏱️',
    category: 'sistema',
    def: 'Sistema de turnos donde todos los jugadores actúan en paralelo sin ver los movimientos del otro, y las acciones se resuelven simultáneamente a la noche. Elimina la ventaja de "ir primero" y hace que la estrategia sea sobre predicción, no sobre reacción.',
  },
  {
    term: 'Bear / Bull',
    full: 'Mercado Bajista / Alcista',
    emoji: '🐻🐂',
    category: 'mercado',
    def: 'Bear: el mercado global cae (-7% en todos los FMV). Bull: el mercado sube (+7%). Son eventos globales aleatorios que afectan a todas las corporaciones al mismo tiempo. También podés desencadenar un bear local con el Short Institucional del Lobby Político.',
  },
  {
    term: 'IC Synergy',
    full: 'Bono IC de Alianza',
    emoji: '🤝',
    category: 'alianzas',
    def: 'Beneficio de las alianzas activas: por cada corporación que ambos aliados holdean simultáneamente, ambos reciben +5% del IC base del turno. Máximo 3 corps compartidas (= +15% extra). Se acredita en la fase 5.55 de resolución.',
    formula: '+5% IC base por corp compartida, máx ×3 = hasta +15%',
  },
];

const CATEGORIES = [
  { id: 'todos', label: 'Todos' },
  { id: 'mercado', label: '📈 Mercado' },
  { id: 'economia', label: '💰 Economía' },
  { id: 'progresion', label: '🔬 Progresión' },
  { id: 'alianzas', label: '🤝 Alianzas' },
  { id: 'tablero', label: '🏙️ Tablero' },
  { id: 'corporaciones', label: '🏢 Corps' },
  { id: 'sistema', label: '⚙️ Sistema' },
];

function DictionaryView() {
  const [query, setQuery] = useState('');
  const [cat, setCat] = useState('todos');
  const [expanded, setExpanded] = useState(null);

  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim();
    return DICTIONARY.filter(d => {
      const matchCat = cat === 'todos' || d.category === cat;
      const matchQ = !q || d.term.toLowerCase().includes(q) || d.full.toLowerCase().includes(q) || d.def.toLowerCase().includes(q);
      return matchCat && matchQ;
    }).sort((a, b) => a.term.localeCompare(b.term));
  }, [query, cat]);

  return (
    <div className="space-y-3">
      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-500" />
        <input
          type="text"
          placeholder="Buscar término..."
          value={query}
          onChange={e => setQuery(e.target.value)}
          className="w-full bg-zinc-900 border border-zinc-800 rounded-lg pl-8 pr-3 py-2 text-xs text-zinc-200 placeholder-zinc-600 font-mono focus:outline-none focus:border-lime-500/50"
        />
      </div>
      {/* Category filter */}
      <div className="flex gap-1 flex-wrap">
        {CATEGORIES.map(c => (
          <button
            key={c.id}
            onClick={() => setCat(c.id)}
            className={`px-2.5 py-1 rounded-full text-[9px] font-mono uppercase font-bold border transition-all ${
              cat === c.id
                ? 'bg-lime-500/20 border-lime-500/40 text-lime-300'
                : 'border-zinc-800 text-zinc-500 hover:text-zinc-300'
            }`}
          >
            {c.label}
          </button>
        ))}
      </div>

      {/* Terms */}
      <div className="space-y-1">
        {filtered.map(d => {
          const isOpen = expanded === d.term;
          return (
            <div key={d.term} className="border border-zinc-800 rounded-xl overflow-hidden">
              <button
                onClick={() => setExpanded(isOpen ? null : d.term)}
                className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-zinc-900/60 transition-colors text-left"
              >
                <span className="text-base shrink-0">{d.emoji}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-2 flex-wrap">
                    <span className="font-black text-sm text-lime-400 font-mono">{d.term}</span>
                    <span className="text-[10px] text-zinc-500 font-mono">{d.full}</span>
                  </div>
                </div>
                {isOpen
                  ? <ChevronDown className="h-3.5 w-3.5 text-lime-400 shrink-0" />
                  : <ChevronRight className="h-3.5 w-3.5 text-zinc-600 shrink-0" />}
              </button>
              <AnimatePresence>
                {isOpen && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2, ease: 'easeInOut' }}
                    className="overflow-hidden"
                  >
                    <div className="px-4 pb-3 pt-1 space-y-2">
                      <p className="text-[11px] text-zinc-400 font-mono leading-relaxed">{d.def}</p>
                      {d.formula && (
                        <div className="bg-zinc-900/70 border border-zinc-700/50 rounded-lg px-3 py-1.5">
                          <span className="text-[10px] font-mono text-cyan-400">{d.formula}</span>
                        </div>
                      )}
                      <span className={`inline-block text-[9px] font-mono uppercase px-2 py-0.5 rounded-full border ${
                        d.category === 'mercado' ? 'border-cyan-700/40 text-cyan-400 bg-cyan-500/10' :
                        d.category === 'economia' ? 'border-yellow-700/40 text-yellow-400 bg-yellow-500/10' :
                        d.category === 'progresion' ? 'border-purple-700/40 text-purple-400 bg-purple-500/10' :
                        d.category === 'alianzas' ? 'border-lime-700/40 text-lime-400 bg-lime-500/10' :
                        d.category === 'tablero' ? 'border-blue-700/40 text-blue-400 bg-blue-500/10' :
                        d.category === 'corporaciones' ? 'border-orange-700/40 text-orange-400 bg-orange-500/10' :
                        'border-zinc-700/40 text-zinc-400 bg-zinc-800/40'
                      }`}>{d.category}</span>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })}
        {filtered.length === 0 && (
          <p className="text-zinc-600 text-xs italic text-center py-6 font-mono">No hay términos que coincidan.</p>
        )}
      </div>
    </div>
  );
}

export default function SurvivalGuide() {
  const [open,    setOpen]    = useState(false);
  const [section, setSection] = useState(null);
  const [tab,     setTab]     = useState('guia'); // 'guia' | 'dict'

  return (
    <>
      {/* Botón flotante ? */}
      <motion.button
        onClick={() => setOpen(true)}
        whileHover={{ scale: 1.1 }}
        whileTap={{ scale: 0.95 }}
        className="fixed bottom-5 right-5 z-50 w-11 h-11 rounded-full bg-lime-400 text-black font-black text-lg shadow-[0_0_24px_rgba(163,230,53,0.5)] flex items-center justify-center select-none"
        style={{ willChange: 'transform' }}
        aria-label="Guía de supervivencia"
      >
        ?
      </motion.button>

      {/* Modal */}
      <AnimatePresence>
        {open && (
          <motion.div
            className="fixed inset-0 z-[200] bg-black/85 backdrop-blur-md flex items-end sm:items-center justify-center p-2 sm:p-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={(e) => { if (e.target === e.currentTarget) setOpen(false); }}
          >
            <motion.div
              className="w-full max-w-lg bg-zinc-950 border border-lime-400/25 rounded-2xl overflow-hidden shadow-[0_0_60px_rgba(163,230,53,0.12)] max-h-[85vh] flex flex-col"
              initial={{ y: 40, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 40, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 260, damping: 26 }}
            >
              {/* Header */}
              <div className="shrink-0 flex items-center justify-between px-5 py-4 border-b border-zinc-900">
                <div>
                  <h2 className="text-lg font-black tracking-tighter text-white">
                    GUÍA DE <span className="text-lime-400">SUPERVIVENCIA</span>
                  </h2>
                  <p className="text-[10px] font-mono text-zinc-500 uppercase tracking-wider mt-0.5">
                    Distrito 77 · WEGO System · Todo lo que necesitás saber
                  </p>
                </div>
                <button onClick={() => setOpen(false)} className="text-zinc-500 hover:text-white transition-colors">
                  <X className="h-5 w-5" />
                </button>
              </div>

              {/* Tab switcher */}
              <div className="shrink-0 flex gap-1 px-4 pt-3 pb-2">
                <button
                  onClick={() => setTab('guia')}
                  className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-[11px] font-mono font-bold uppercase border transition-all ${
                    tab === 'guia'
                      ? 'bg-lime-500/15 border-lime-500/40 text-lime-300'
                      : 'border-zinc-800 text-zinc-500 hover:text-zinc-300'
                  }`}
                >
                  📋 Guía
                </button>
                <button
                  onClick={() => setTab('dict')}
                  className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-[11px] font-mono font-bold uppercase border transition-all ${
                    tab === 'dict'
                      ? 'bg-cyan-500/15 border-cyan-500/40 text-cyan-300'
                      : 'border-zinc-800 text-zinc-500 hover:text-zinc-300'
                  }`}
                >
                  <BookOpen className="h-3 w-3" /> Diccionario
                </button>
              </div>

              {/* Content */}
              <div className="flex-1 overflow-y-auto px-4 py-2 space-y-1.5" style={{ scrollbarWidth: 'thin', scrollbarColor: '#3f3f46 transparent' }}>
                {tab === 'guia' ? (
                  SECTIONS.map((s) => {
                    const isOpen = section === s.id;
                    return (
                      <div key={s.id} className="border border-zinc-800 rounded-xl overflow-hidden">
                        <button
                          onClick={() => setSection(isOpen ? null : s.id)}
                          className="w-full flex items-center gap-3 px-4 py-3 hover:bg-zinc-900/60 transition-colors text-left"
                        >
                          <span className="text-lg shrink-0">{s.emoji}</span>
                          <span className="font-bold text-sm text-white flex-1">{s.title}</span>
                          {isOpen
                            ? <ChevronDown className="h-4 w-4 text-lime-400 shrink-0" />
                            : <ChevronRight className="h-4 w-4 text-zinc-500 shrink-0" />}
                        </button>
                        <AnimatePresence>
                          {isOpen && (
                            <motion.div
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: 'auto', opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                              transition={{ duration: 0.22, ease: 'easeInOut' }}
                              className="overflow-hidden"
                            >
                              <ul className="px-4 pb-4 pt-1 space-y-1.5">
                                {s.content.map((line, i) => (
                                  <li key={i} className="flex items-start gap-2 text-xs text-zinc-400 font-mono leading-relaxed">
                                    <span className="text-lime-400 shrink-0 mt-0.5">›</span>
                                    <span>{line}</span>
                                  </li>
                                ))}
                              </ul>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    );
                  })
                ) : (
                  <DictionaryView />
                )}
              </div>

              {/* Footer */}
              <div className="shrink-0 border-t border-zinc-900 px-5 py-3">
                <p className="text-[9px] font-mono text-zinc-600 text-center uppercase tracking-widest">
                  Turno resuelto 00:00 ART · Sistema WEGO · Dic 2025
                </p>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
