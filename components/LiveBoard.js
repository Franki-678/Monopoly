'use client';
import { memo, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

// ── Casillas especiales ───────────────────────────────────────────────────────
const SPECIAL = {
  5:  { emoji: '⚠️', label: 'PRENDA',    fg: '#fcd34d', bg: 'rgba(217,119,6,0.30)',   brd: 'rgba(245,158,11,0.55)' },
  10: { emoji: '🛋️', label: 'PSICÓLOGO', fg: '#f9a8d4', bg: 'rgba(219,39,119,0.22)',  brd: 'rgba(236,72,153,0.55)' },
  15: { emoji: '⚠️', label: 'PRENDA',    fg: '#fcd34d', bg: 'rgba(217,119,6,0.30)',   brd: 'rgba(245,158,11,0.55)' },
};

// Un color por casilla (evita depender de datos de corp para el color)
const CC = [
  '#86efac','#fde68a','#f9a8d4','#93c5fd','#fdba74',
  '#c4b5fd','#6ee7b7','#fca5a5','#67e8f9','#fef08a',
  '#e879f9','#7dd3fc','#a3e635','#fbbf24','#fb7185',
  '#38bdf8','#4ade80','#fb923c','#a78bfa','#34d399',
];

// Posición en grid 6×6 para cada casilla (layout Monopoly horario)
// Top (0-5): fila 1  |  Right (6-9): col 6  |  Bottom (10-15): fila 6  |  Left (16-19): col 1
const GP = {
   0:{r:1,c:1},  1:{r:1,c:2},  2:{r:1,c:3},  3:{r:1,c:4},  4:{r:1,c:5},  5:{r:1,c:6},
  19:{r:2,c:1},                                                              6:{r:2,c:6},
  18:{r:3,c:1},                                                              7:{r:3,c:6},
  17:{r:4,c:1},                                                              8:{r:4,c:6},
  16:{r:5,c:1},                                                              9:{r:5,c:6},
  15:{r:6,c:1}, 14:{r:6,c:2}, 13:{r:6,c:3}, 12:{r:6,c:4}, 11:{r:6,c:5}, 10:{r:6,c:6},
};

const SQUARES = [0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19];

function abbr(name = '') {
  const w = name.trim().split(/\s+/);
  if (w.length === 1) return w[0].slice(0, 6).toUpperCase();
  return w.slice(0, 2).map(p => p.slice(0, 5).toUpperCase()).join('\n');
}

// ── Celda individual (memoizada para 60fps) ───────────────────────────────────
const BoardCell = memo(function BoardCell({ square, playersHere, corpShort, highlighted }) {
  const sp  = SPECIAL[square];
  const cc  = CC[square % CC.length];
  const gp  = GP[square];

  return (
    <motion.div
      className="relative flex flex-col items-center justify-center overflow-hidden select-none"
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
      {/* Número de casilla */}
      <span className="absolute top-[2px] left-[3px] text-[7px] font-mono text-zinc-700 leading-none z-10">
        {square}
      </span>

      {/* Contenido */}
      {sp ? (
        <div className="flex flex-col items-center gap-0 z-10">
          <span className="text-[10px] md:text-[13px] leading-none">{sp.emoji}</span>
          <span className="text-[5px] md:text-[7px] font-mono font-bold uppercase text-center leading-none mt-[2px]"
            style={{ color: sp.fg }}>
            {sp.label}
          </span>
        </div>
      ) : corpShort ? (
        <span
          className="text-[5px] md:text-[7px] font-mono font-bold uppercase text-center leading-tight px-[2px] z-10 whitespace-pre-line"
          style={{ color: cc, textShadow: `0 0 8px ${cc}66` }}
        >
          {corpShort}
        </span>
      ) : null}

      {/* Avatares de jugadores */}
      <AnimatePresence>
        {playersHere.map((p, idx) => (
          <motion.div
            key={p.id}
            className="absolute bottom-[2px] w-3.5 h-3.5 md:w-[17px] md:h-[17px] rounded-full flex items-center justify-center text-[6px] md:text-[7px] font-black text-black ring-[1px] ring-black/50 shadow-lg z-20"
            style={{
              backgroundColor: p.avatar_color,
              willChange: 'transform, opacity',
              left: `calc(50% + ${(idx - (playersHere.length - 1) / 2) * 14}px - 7px)`,
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
const CS = 'clamp(40px, 10vmin, 70px)';

export default function LiveBoard({ players = [], market = [], projectedSquare = null, children }) {
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
      if (c.board_position != null) m[c.board_position] = abbr(c.name);
    });
    return m;
  }, [market]);

  return (
    <div
      className="fixed inset-0 overflow-hidden"
      style={{
        display: 'grid',
        gridTemplateColumns: `${CS} repeat(4, 1fr) ${CS}`,
        gridTemplateRows:    `${CS} repeat(4, 1fr) ${CS}`,
        gap: '1px',
        padding: '2px',
        background: '#0a0a0c',
        backgroundImage:
          'radial-gradient(ellipse at 30% 0%,  rgba(163,230,53,0.07) 0%, transparent 40%),' +
          'radial-gradient(ellipse at 80% 95%, rgba(251,146,60,0.05)  0%, transparent 40%)',
      }}
    >
      {/* 20 casillas perimetrales */}
      {SQUARES.map(sq => (
        <BoardCell
          key={sq}
          square={sq}
          playersHere={playersBySquare[sq] || []}
          corpShort={corpBySquare[sq]}
          highlighted={projectedSquare === sq}
        />
      ))}

      {/* Panel central de contenido: rows 2-5, cols 2-5 */}
      <div
        className="overflow-hidden"
        style={{ gridRow: '2 / 6', gridColumn: '2 / 6' }}
      >
        {children}
      </div>
    </div>
  );
}
