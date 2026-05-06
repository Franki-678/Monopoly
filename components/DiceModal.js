'use client';
import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Dice1, Dice2, Dice3, Dice4, Dice5, Dice6, Sparkles, MapPin } from 'lucide-react';

const DICE_ICONS = [Dice1, Dice2, Dice3, Dice4, Dice5, Dice6];

const DICE_MSGS = {
  1: 'Pisada corta. 1 casilla.',
  2: 'Paso firme. 2 casillas.',
  3: 'Ritmo estable. 3 casillas.',
  4: 'Zancada. 4 casillas.',
  5: 'Carrera. 5 casillas.',
  6: 'DOPAMINA MÁXIMA. 6 casillas.',
};

const LANDING_INFO = {
  5:  { emoji: '⚠️', desc: '¡Prendas! Preparate.' },
  10: { emoji: '🛋️', desc: 'El Psicólogo. Te cuesta $200.' },
  15: { emoji: '⚠️', desc: '¡Prendas! Preparate.' },
};

const api = async (path, opts = {}) => {
  const res = await fetch('/api/' + path, { headers: { 'Content-Type': 'application/json' }, ...opts });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Error');
  return data;
};

export default function DiceModal({ playerId, turn, playerPosition = 0, onRollComplete, onClose }) {
  const [rolling, setRolling]           = useState(false);
  const [rolledValue, setRolledValue]   = useState(null);
  const [landingSquare, setLanding]     = useState(null);
  const [alreadyRolled, setAlready]     = useState(false);
  const [fakeFace, setFakeFace]         = useState(1);

  useEffect(() => {
    api('dice/status/' + playerId).then(d => {
      if (d.roll) {
        const roll    = d.roll;
        const landing = (playerPosition + roll) % 20;
        setRolledValue(roll);
        setLanding(landing);
        setAlready(true);
        onRollComplete?.({ roll, landing });
      }
    }).catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playerId]);

  const roll = async () => {
    if (rolling || rolledValue) return;
    setRolling(true);
    const spin = setInterval(() => setFakeFace(Math.floor(Math.random() * 6) + 1), 80);
    try {
      const res     = await api('dice/roll', { method: 'POST', body: JSON.stringify({ player_id: playerId }) });
      await new Promise(r => setTimeout(r, 1400));
      clearInterval(spin);
      const landing = (playerPosition + res.roll) % 20;
      setRolledValue(res.roll);
      setLanding(landing);
      onRollComplete?.({ roll: res.roll, landing });
    } catch (e) {
      clearInterval(spin);
      console.error(e);
    } finally {
      setRolling(false);
    }
  };

  const Icon = DICE_ICONS[(rolledValue || fakeFace) - 1];
  const landInfo = landingSquare !== null ? LANDING_INFO[landingSquare] : null;

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-md flex items-center justify-center p-4"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        style={{ willChange: 'opacity' }}
      >
        <motion.div
          className="relative w-full max-w-sm bg-gradient-to-br from-zinc-950 to-black border-2 border-lime-400/30 rounded-2xl p-6 shadow-[0_0_80px_rgba(163,230,53,0.18)]"
          initial={{ scale: 0.85, y: 32, opacity: 0 }}
          animate={{ scale: 1, y: 0, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 220, damping: 22 }}
          style={{ willChange: 'transform, opacity' }}
        >
          {/* Header */}
          <div className="text-center mb-5">
            <div className="inline-flex items-center gap-2 px-3 py-1 border border-lime-400/40 bg-lime-400/10 rounded-full mb-3">
              <Sparkles className="h-3 w-3 text-lime-400" />
              <span className="text-[10px] font-mono uppercase tracking-widest text-lime-300">
                Turno {turn} · Roll diario
              </span>
            </div>
            <h2 className="text-3xl font-black tracking-tighter text-white">
              TIRÁ EL <span className="text-lime-400">DADO</span>
            </h2>
            <p className="text-zinc-600 text-[10px] font-mono uppercase tracking-wider mt-1">
              Pos. actual: casilla {playerPosition}
            </p>
          </div>

          {/* Dado */}
          <div className="flex items-center justify-center my-6">
            <motion.div
              animate={
                rolling
                  ? { rotate: [0, 360, 720, 1080], scale: [1, 1.1, 1] }
                  : rolledValue
                    ? { scale: [1, 1.25, 1], rotate: 0 }
                    : { rotate: 0 }
              }
              transition={rolling ? { duration: 1.4, ease: 'easeOut' } : { duration: 0.35 }}
              className={`w-28 h-28 rounded-2xl border-2 flex items-center justify-center ${
                rolledValue
                  ? 'bg-lime-400/20 border-lime-400 shadow-[0_0_40px_rgba(163,230,53,0.45)]'
                  : 'bg-zinc-900 border-zinc-700'
              }`}
              style={{ willChange: 'transform' }}
            >
              <Icon
                className={`w-20 h-20 ${rolledValue ? 'text-lime-400' : 'text-zinc-400'}`}
                strokeWidth={1.5}
              />
            </motion.div>
          </div>

          {/* Resultado / Acción */}
          <AnimatePresence mode="wait">
            {rolledValue ? (
              <motion.div
                key="result"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="space-y-3"
                style={{ willChange: 'transform, opacity' }}
              >
                <div className="text-center">
                  <div className="text-5xl font-black text-lime-400 font-mono">{rolledValue}</div>
                  <p className="text-zinc-300 text-sm mt-1">{DICE_MSGS[rolledValue]}</p>
                </div>

                {/* Proyección de landing */}
                {landingSquare !== null && (
                  <div className="bg-zinc-900 border border-lime-400/25 rounded-xl p-3 text-center">
                    <div className="flex items-center justify-center gap-1.5 mb-1">
                      <MapPin className="h-3 w-3 text-lime-400" />
                      <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-wider">
                        Aterrizás en
                      </span>
                    </div>
                    <div className="text-2xl font-black text-lime-400 font-mono">
                      Casilla {landingSquare}
                    </div>
                    {landInfo ? (
                      <p className="text-sm text-zinc-300 mt-1 font-mono">
                        {landInfo.emoji} {landInfo.desc}
                      </p>
                    ) : (
                      <p className="text-[10px] text-zinc-600 mt-1 font-mono italic">
                        El tablero ya está iluminado 👆
                      </p>
                    )}
                  </div>
                )}

                {alreadyRolled && (
                  <p className="text-center text-[10px] font-mono text-zinc-600 uppercase">
                    Ya tiraste hoy · 1 tirada por turno
                  </p>
                )}

                <Button
                  onClick={onClose}
                  className="w-full bg-lime-400 hover:bg-lime-300 text-black font-bold uppercase tracking-wider"
                >
                  Ver Tablero
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
