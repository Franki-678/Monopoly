'use client';
import { memo, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

// ── Casillas especiales ───────────────────────────────────────────────────────
const SPECIAL = {
  5:  { emoji: '⚠️', label: 'PRENDA',    fg: '#fcd34d', bg: 'rgba(217,119,6,0.30)',   brd: 'rgba(245,158,11,0.55)' },
  10: { emoji: '🛋️', label: 'PSICÓLOGO', fg: '#f9a8d4', bg: 'rgba(219,39,119,0.22)',  brd: 'rgba(236,72,153,0.55)' },
  15: { emoji: '⚠️', label: 'PRENDA',    fg: '#fcd34d', bg: 'rgba(217,119,6,0.30)',   brd: 'rgba(245,158,11,0.55)' },
  20: { emoji: '🏛️', label: 'EL ESTADO', fg: '#86efac', bg: 'rgba(34,197,94,0.18)',   brd: 'rgba(34,197,94,0.50)' },
  25: { emoji: '⚠️', label: 'PRENDA',    fg: '#fcd34d', bg: 'rgba(217,119,6,0.30)',   brd: 'rgba(245,158,11,0.55)' },
  30: { emoji: '🥷', label: 'MERCADO 🖤', fg: '#c084fc', bg: 'rgba(168,85,247,0.18)',  brd: 'rgba(192,132,252,0.55)' },
};

// District → color band (Monopoly-style)
const DISTRICT_COLORS = {
  'Zona Sur':          '#4ade80',  // green
  'Centro':            '#a78bfa',  // purple
  'Distrito Neón':     '#22d3ee',  // cyan
  'Zona Industrial':   '#fbbf24',  // amber
  'Puerto':            '#60a5fa',  // blue
  'Zona Alta':         '#fde68a',  // gold
  'Barrio Viejo':      '#a8a29e',  // stone
  'Distrito Arte':     '#f472b6',  // pink
  'Zona Norte':        '#fb923c',  // orange
  'Distrito Crypto':   '#818cf8',  // indigo
  'Zona Biopunk':      '#34d399',  // emerald
  'Zona Fantasma':     '#94a3b8',  // slate
  'Distrito Oscuro':   '#f87171',  // red
  'Cima':              '#fbbf24',  // gold (premium)
};

// Un color fallback por casilla (evita depender de datos de corp para el color)
const CC = [
  '#86efac','#fde68a','#f9a8d4','#93c5fd','#fdba74',
  '#c4b5fd','#6ee7b7','#fca5a5','#67e8f9','#fef08a',
  '#e879f9','#7dd3fc','#a3e635','#fbbf24','#fb7185',
  '#38bdf8','#4ade80','#fb923c','#a78bfa','#34d399',
  '#818cf8','#6ee7b7','#f472b6','#22d3ee','#fbbf24',
  '#a8a29e','#60a5fa','#fb923c','#f87171','#94a3b8',
  '#c084fc','#fde68a',
];

// Posición en grid 9×9 para cada casilla (32 casillas perimetrales)
// Top row (0→8):   fila 1, cols 1→9
// Right col (9→15): col 9, filas 2→8
// Bottom row (16→24): fila 9, cols 9→1 (invertido)
// Left col (25→31): col 1, filas 8→2 (invertido)
const GP = {
   0:{r:1,c:1},  1:{r:1,c:2},  2:{r:1,c:3},  3:{r:1,c:4},  4:{r:1,c:5},
   5:{r:1,c:6},  6:{r:1,c:7},  7:{r:1,c:8},  8:{r:1,c:9},
   9:{r:2,c:9}, 10:{r:3,c:9}, 11:{r:4,c:9}, 12:{r:5,c:9},
  13:{r:6,c:9}, 14:{r:7,c:9}, 15:{r:8,c:9},
  16:{r:9,c:9}, 17:{r:9,c:8}, 18:{r:9,c:7}, 19:{r:9,c:6},
  20:{r:9,c:5}, 21:{r:9,c:4}, 22:{r:9,c:3}, 23:{r:9,c:2}, 24:{r:9,c:1},
  25:{r:8,c:1}, 26:{r:7,c:1}, 27:{r:6,c:1}, 28:{r:5,c:1},
  29:{r:4,c:1}, 30:{r:3,c:1}, 31:{r:2,c:1},
};

const SQUARES = Array.from({ length: 32 }, (_, i) => i);

function abbr(name = '') {
  const w = name.trim().split(/\s+/);
  if (w.length === 1) return w[0].slice(0, 6).toUpperCase();
  return w.slice(0, 2).map(p => p.slice(0, 5).toUpperCase()).join('\n');
}

// ── Celda individual (memoizada para 60fps) ───────────────────────────────────
const BoardCell = memo(function BoardCell({ square, playersHere, corpShort, corpDistrict, highlighted, isClickable, onClick }) {
  const sp  = SPECIAL[square];
  const cc  = CC[square % CC.length];
  const gp  = GP[square];
  const districtColor = corpDistrict ? (DISTRICT_COLORS[corpDistrict] || cc) : null;

  return (
    <motion.div
      onClick={isClickable ? onClick : undefined}
      className={`relative flex flex-col items-center justify-center overflow-hidden select-none ${isClickable ? 'cursor-pointer' : ''}`}
      style={{
        gridRow: gp.r,
        gridColumn: gp.c,
        border: '1px solid',
        borderColor: sp?.brd ?? (highlighted ? 'rgba(163,230,53,0.85)' : 'rgba(63,63,70,0.45)'),
        background:   sp?.bg  ?? (highlighted ? 'rgba(163,230,53,0.10)' : 'rgba(12,12,14,0.92)'),
        willChange:   'box-shadow, border-color',
      }}
      animate={highlighted ? {
        boxShadow:   ['0 0 6px rgba(163,230,53,0.3)', '0 0 24px rgba(163,230,53,0.85)', '0 0 6px rgba(163,230,53,0.3)'],
        borderColor: ['rgba(163,230,53,0.5)',          'rgba(163,230,53,1)',              'rgba(163,230,53,0.5)'],
      } : { boxShadow: 'none' }}
      transition={highlighted
        ? { duration: 0.75, repeat: Infinity, ease: 'easeInOut' }
        : { duration: 0.25 }}
    >
      {/* District color band (Monopoly-style top stripe) */}
      {districtColor && !sp && (
        <div
          className="absolute top-0 left-0 right-0 z-10"
          style={{ height: '4px', backgroundColor: districtColor, opacity: 0.85 }}
        />
      )}

      {/* Número de casilla */}
      <span className="absolute top-[2px] left-[3px] text-[6px] font-mono text-zinc-700 leading-none z-10">
        {square}
      </span>

      {/* Contenido */}
      {sp ? (
        <div className="flex flex-col items-center gap-0 z-10">
          <span className="text-[9px] md:text-[12px] leading-none">{sp.emoji}</span>
          <span className="text-[4px] md:text-[6px] font-mono font-bold uppercase text-center leading-none mt-[2px]"
            style={{ color: sp.fg }}>
            {sp.label}
          </span>
        </div>
      ) : corpShort ? (
        <span
          className="text-[4px] md:text-[6px] font-mono font-bold uppercase text-center leading-tight px-[2px] z-10 whitespace-pre-line mt-[4px]"
          style={{ color: districtColor || cc, textShadow: `0 0 8px ${(districtColor || cc)}66` }}
        >
          {corpShort}
        </span>
      ) : null}

      {/* Hover overlay for clickable cells */}
      {isClickable && (
        <div className="absolute inset-0 bg-white/0 hover:bg-white/5 transition-colors z-10 pointer-events-none" />
      )}

      {/* Avatares de jugadores */}
      <AnimatePresence>
        {playersHere.map((p, idx) => (
          <motion.div
            key={p.id}
            title={p.username}
            className="absolute bottom-[2px] w-3.5 h-3.5 md:w-[17px] md:h-[17px] rounded-full flex items-center justify-center text-[5px] md:text-[7px] font-black text-black ring-[1.5px] ring-black/60 shadow-lg z-20"
            style={{
              backgroundColor: p.avatar_color,
              willChange: 'transform, opacity',
              left: `calc(50% + ${(idx - (playersHere.length - 1) / 2) * 13}px - 7px)`,
            }}
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 600, damping: 28, delay: idx * 0.04 }}
          >
            {p.username[0]}
          </motion.div>
        ))}
      </AnimatePresence>
    </motion.div>
  );
});

// ── Tablero principal ─────────────────────────────────────────────────────────
// 9×9 grid: corners are clamp(40px, 10vmin, 68px), inner cells are 1fr
const CS = 'clamp(38px, 9.5vmin, 66px)';

export default function LiveBoard({ players = [], market = [], projectedSquare = null, onCellClick, children }) {
  const playersBySquare = useMemo(() => {
    const m = {};
    players.forEach(p => {
      const pos = p.board_position ?? 0;
      (m[pos] = m[pos] || []).push(p);
    });
    return m;
  }, [players]);

  const corpBySquare = useMemo(() => {
    const m = {};
    (market || []).forEach(c => {
      if (c.board_position != null) m[c.board_position] = { short: abbr(c.name), district: c.district };
    });
    return m;
  }, [market]);

  // Set of squares that have a corp → clickable
  const corpSquares = useMemo(() => {
    const s = new Set();
    (market || []).forEach(c => {
      if (c.board_position != null) s.add(Number(c.board_position));
    });
    return s;
  }, [market]);

  return (
    <div
      className="fixed inset-0 overflow-hidden"
      style={{
        display: 'grid',
        gridTemplateColumns: `${CS} repeat(7, 1fr) ${CS}`,
        gridTemplateRows:    `${CS} repeat(7, 1fr) ${CS}`,
        gap: '1px',
        padding: '2px',
        background: '#0a0a0c',
        backgroundImage:
          'radial-gradient(ellipse at 30% 0%,  rgba(163,230,53,0.07) 0%, transparent 40%),' +
          'radial-gradient(ellipse at 80% 95%, rgba(251,146,60,0.05)  0%, transparent 40%)',
      }}
    >
      {/* 32 casillas perimetrales */}
      {SQUARES.map(sq => (
        <BoardCell
          key={sq}
          square={sq}
          playersHere={playersBySquare[sq] || []}
          corpShort={corpBySquare[sq]?.short}
          corpDistrict={corpBySquare[sq]?.district}
          highlighted={projectedSquare === sq}
          isClickable={corpSquares.has(sq) && !!onCellClick}
          onClick={() => onCellClick?.(sq)}
        />
      ))}

      {/* Panel central de contenido: rows 2-9, cols 2-9 */}
      <div
        className="overflow-hidden"
        style={{ gridRow: '2 / 9', gridColumn: '2 / 9' }}
      >
        {children}
      </div>
    </div>
  );
}
