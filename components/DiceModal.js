'use client';
import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Dice1, Dice2, Dice3, Dice4, Dice5, Dice6, Sparkles } from 'lucide-react';

const DICE_ICONS = [Dice1, Dice2, Dice3, Dice4, Dice5, Dice6];
const DICE_MESSAGES = {
  1: 'Pisada corta. Movés 1 casilla.',
  2: 'Paso firme. Movés 2 casillas.',
  3: 'Ritmo estable. Movés 3 casillas.',
  4: 'Zancada. Movés 4 casillas.',
  5: 'Carrera. Movés 5 casillas.',
  6: 'Vuelo. Movés 6 casillas. DOPAMINA MÁXIMA.',
};

const api = async (path, opts = {}) => {
  const res = await fetch('/api/' + path, { headers: { 'Content-Type': 'application/json' }, ...opts });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Error');
  return data;
};

export default function DiceModal({ playerId, turn, onClose }) {
  const [rolling, setRolling] = useState(false);
  const [rolledValue, setRolledValue] = useState(null);
  const [alreadyRolled, setAlreadyRolled] = useState(false);
  const [fakeFace, setFakeFace] = useState(1);

  useEffect(() => {
    // Check if already rolled this turn
    api('dice/status/' + playerId).then((d) => {
      if (d.roll) {
        setRolledValue(d.roll);
        setAlreadyRolled(true);
      }
    }).catch(() => {});
  }, [playerId]);

  const roll = async () => {
    if (rolling || rolledValue) return;
    setRolling(true);
    // Animate random faces while waiting
    const spinInterval = setInterval(() => setFakeFace(Math.floor(Math.random() * 6) + 1), 80);
    try {
      const res = await api('dice/roll', { method: 'POST', body: JSON.stringify({ player_id: playerId }) });
      await new Promise((r) => setTimeout(r, 1400)); // build suspense
      clearInterval(spinInterval);
      setRolledValue(res.roll);
    } catch (e) {
      clearInterval(spinInterval);
      console.error(e);
    } finally {
      setRolling(false);
    }
  };

  const CurrentIcon = DICE_ICONS[(rolledValue || fakeFace) - 1];

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-md flex items-center justify-center p-4"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
      >
        <motion.div
          className="relative w-full max-w-md bg-gradient-to-br from-zinc-950 to-black border-2 border-lime-400/30 rounded-2xl p-8 shadow-[0_0_80px_rgba(163,230,53,0.2)]"
          initial={{ scale: 0.8, y: 40, opacity: 0 }}
          animate={{ scale: 1, y: 0, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 200, damping: 20 }}
        >
          <div className="text-center mb-6">
            <div className="inline-flex items-center gap-2 px-3 py-1 border border-lime-400/40 bg-lime-400/10 rounded-full mb-3">
              <Sparkles className="h-3 w-3 text-lime-400" />
              <span className="text-[10px] font-mono uppercase tracking-widest text-lime-300">Turno {turn} · Roll diario</span>
            </div>
            <h2 className="text-4xl font-black tracking-tighter text-white">
              TIRÁ EL <span className="text-lime-400">DADO</span>
            </h2>
            <p className="text-zinc-500 text-xs font-mono uppercase tracking-wider mt-1">
              Tu suerte de hoy
            </p>
          </div>

          <div className="flex items-center justify-center my-8">
            <motion.div
              animate={rolling ? { rotate: [0, 360, 720, 1080], scale: [1, 1.1, 1] } : rolledValue ? { scale: [1, 1.25, 1], rotate: 0 } : { rotate: 0 }}
              transition={rolling ? { duration: 1.4, ease: 'easeOut' } : { duration: 0.4 }}
              className={`w-32 h-32 rounded-2xl border-2 flex items-center justify-center ${
                rolledValue
                  ? 'bg-lime-400/20 border-lime-400 shadow-[0_0_40px_rgba(163,230,53,0.5)]'
                  : 'bg-zinc-900 border-zinc-700'
              }`}
            >
              <CurrentIcon className={`w-24 h-24 ${rolledValue ? 'text-lime-400' : 'text-zinc-400'}`} strokeWidth={1.5} />
            </motion.div>
          </div>

          <AnimatePresence mode="wait">
            {rolledValue ? (
              <motion.div
                key="result"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="text-center space-y-4"
              >
                <div className="text-5xl font-black text-lime-400 font-mono">{rolledValue}</div>
                <p className="text-zinc-300 text-sm">{DICE_MESSAGES[rolledValue]}</p>
                <p className="text-zinc-500 text-xs italic">Prepará tu estrategia.</p>
                {alreadyRolled && (
                  <p className="text-[10px] font-mono text-zinc-600 uppercase">Ya tiraste hoy · solo 1 tirada por turno</p>
                )}
                <Button
                  onClick={onClose}
                  className="w-full bg-lime-400 hover:bg-lime-300 text-black font-bold uppercase tracking-wider"
                >
                  Entrar al Dashboard
                </Button>
              </motion.div>
            ) : (
              <motion.div key="action" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <Button
                  onClick={roll}
                  disabled={rolling}
                  className="w-full bg-lime-400 hover:bg-lime-300 text-black font-bold uppercase tracking-wider h-14 text-lg"
                >
                  {rolling ? 'Girando...' : 'TIRAR DADO'}
                </Button>
                <p className="text-center text-[10px] font-mono text-zinc-600 uppercase mt-3">
                  1 tirada por turno · inevitable
                </p>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
