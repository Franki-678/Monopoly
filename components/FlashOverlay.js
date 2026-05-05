'use client';
import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useState } from 'react';

// type: 'positive' | 'negative' | null
export default function FlashOverlay({ flash, onDone }) {
  const [visible, setVisible] = useState(null);

  useEffect(() => {
    if (!flash) return;
    setVisible(flash);
    const t = setTimeout(() => {
      setVisible(null);
      onDone?.();
    }, 1400);
    return () => clearTimeout(t);
  }, [flash, onDone]);

  const color = visible?.type === 'positive' ? 'rgba(163,230,53,0.28)' : 'rgba(248,113,113,0.28)';

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="pointer-events-none fixed inset-0 z-50"
          style={{ background: `radial-gradient(circle at center, ${color} 0%, transparent 70%)` }}
        >
          {visible.label && (
            <motion.div
              initial={{ y: -20, opacity: 0, scale: 0.9 }}
              animate={{ y: 0, opacity: 1, scale: 1 }}
              exit={{ y: -20, opacity: 0 }}
              className="absolute top-24 left-1/2 -translate-x-1/2"
            >
              <div className={`px-6 py-3 rounded-full border-2 backdrop-blur-md font-black text-lg tracking-wider ${
                visible.type === 'positive'
                  ? 'bg-lime-400/20 border-lime-400 text-lime-300'
                  : 'bg-red-400/20 border-red-400 text-red-300'
              }`}>
                {visible.type === 'positive' ? '+ ' : '− '}{visible.label}
              </div>
            </motion.div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
