'use client';
import { motion } from 'framer-motion';

// Top-down 2D board frame inspired by Plato. Pure CSS/Tailwind.
// Renders a perimeter of pastel cells around the viewport, fixed in background.
// Zero GPU usage: only opacity & transform animations on small subset of cells.

const PASTELS = [
  { bg: '#a7f3d0', label: 'BARRIO 77' },     // mint
  { bg: '#fde68a', label: 'AVENIDA' },        // lemon
  { bg: '#fbcfe8', label: 'CAOS' },           // pink
  { bg: '#bfdbfe', label: 'NEÓN' },           // sky
  { bg: '#fed7aa', label: 'POLVO' },          // peach
  { bg: '#ddd6fe', label: 'TINTA' },          // lavender
  { bg: '#bbf7d0', label: 'ZONA SUR' },       // green
  { bg: '#fecaca', label: 'OXIDO' },          // salmon
  { bg: '#a5f3fc', label: 'GRAFITO' },        // cyan
  { bg: '#fef08a', label: 'HYPE' },           // yellow
  { bg: '#f5d0fe', label: 'ECLIPSE' },        // fuchsia
  { bg: '#bae6fd', label: 'METROPOLIS' },     // azure
];

// Build perimeter layout: 6 cells top, 6 bottom, 3 left, 3 right (between corners)
function buildCells() {
  const top = Array.from({ length: 8 }, (_, i) => ({ row: 'top', idx: i }));
  const right = Array.from({ length: 4 }, (_, i) => ({ row: 'right', idx: i }));
  const bottom = Array.from({ length: 8 }, (_, i) => ({ row: 'bottom', idx: i }));
  const left = Array.from({ length: 4 }, (_, i) => ({ row: 'left', idx: i }));
  return [...top, ...right, ...bottom, ...left];
}

export default function BoardBackground() {
  const cells = buildCells();
  return (
    <div className="fixed inset-0 -z-10 overflow-hidden pointer-events-none bg-[#0a0a0c]">
      {/* Soft radial wash */}
      <div
        className="absolute inset-0 opacity-60"
        style={{
          background:
            'radial-gradient(ellipse at top, rgba(163,230,53,0.08) 0%, transparent 50%), radial-gradient(ellipse at bottom right, rgba(251,146,60,0.06) 0%, transparent 50%)',
        }}
      />
      {/* Inner frame outline */}
      <div className="absolute inset-6 md:inset-10 rounded-2xl border border-zinc-800/60" />

      {/* TOP ROW */}
      <div className="absolute top-6 md:top-10 left-6 md:left-10 right-6 md:right-10 h-12 md:h-14 flex gap-1">
        {cells.filter(c => c.row === 'top').map((c, i) => (
          <Cell key={`t-${i}`} index={i} flat="top" />
        ))}
      </div>
      {/* BOTTOM ROW */}
      <div className="absolute bottom-6 md:bottom-10 left-6 md:left-10 right-6 md:right-10 h-12 md:h-14 flex gap-1">
        {cells.filter(c => c.row === 'bottom').map((c, i) => (
          <Cell key={`b-${i}`} index={i + 12} flat="bottom" />
        ))}
      </div>
      {/* LEFT COLUMN */}
      <div className="absolute top-20 md:top-24 bottom-20 md:bottom-24 left-6 md:left-10 w-12 md:w-14 flex flex-col gap-1">
        {cells.filter(c => c.row === 'left').map((c, i) => (
          <Cell key={`l-${i}`} index={i + 20} flat="left" />
        ))}
      </div>
      {/* RIGHT COLUMN */}
      <div className="absolute top-20 md:top-24 bottom-20 md:bottom-24 right-6 md:right-10 w-12 md:w-14 flex flex-col gap-1">
        {cells.filter(c => c.row === 'right').map((c, i) => (
          <Cell key={`r-${i}`} index={i + 8} flat="right" />
        ))}
      </div>

      {/* Soft veil to keep UI legible */}
      <div className="absolute inset-0 bg-black/45" />
      <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-transparent to-black/60" />
    </div>
  );
}

function Cell({ index, flat }) {
  const palette = PASTELS[index % PASTELS.length];
  // Stagger a slow opacity pulse only on a subset to suggest "life" without GPU cost
  const shouldPulse = index % 4 === 0;
  return (
    <motion.div
      className="flex-1 rounded-md relative overflow-hidden"
      style={{ backgroundColor: palette.bg, opacity: 0.32 }}
      animate={shouldPulse ? { opacity: [0.32, 0.55, 0.32] } : undefined}
      transition={shouldPulse ? { duration: 4 + (index % 3), repeat: Infinity, ease: 'easeInOut', delay: (index % 5) * 0.3 } : undefined}
    >
      <span className="absolute inset-0 flex items-center justify-center text-[8px] md:text-[10px] font-mono font-bold tracking-widest text-black/60 uppercase">
        {palette.label}
      </span>
      {/* tiny accent dot like Monopoly hotel */}
      <span className="absolute top-1 right-1 w-1 h-1 rounded-full bg-black/40" />
    </motion.div>
  );
}
