'use client';
import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ChevronDown, ChevronRight } from 'lucide-react';

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
    ],
  },
  {
    id: 'techtree',
    emoji: '🔬',
    title: 'Tech Tree (IC)',
    content: [
      'Gastás IC (Intellectual Capital) para desbloquear nodos de 3 ramas.',
      'FINANCIERA: fin-1 (insight) → fin-2 (sell -1.5%) → fin-3 (tax -20%) → fin-4 (buy -1.5%).',
      'URBANO: urb-1 (maint -10%) → urb-2 (CEO FMV +2%/turno) → urb-3 (CEO div +10%) → urb-4 (FMV floor).',
      'LOGÍSTICA: log-1 (IC +5%) → log-2 (IC +15%) → log-3 (maint -5%) → log-4 (monopoly +5% div si holdeás >50%).',
      'Un nodo desbloqueado es PATENTE tuya por 10 turnos. Luego pasa a OPEN_SOURCE y cualquiera se beneficia.',
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
];

export default function SurvivalGuide() {
  const [open,    setOpen]    = useState(false);
  const [section, setSection] = useState(null);

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

              {/* Content: lista de secciones con accordion */}
              <div className="flex-1 overflow-y-auto px-4 py-3 space-y-1.5" style={{ scrollbarWidth: 'thin', scrollbarColor: '#3f3f46 transparent' }}>
                {SECTIONS.map((s) => {
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
                })}
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
