'use client';
import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { Loader2, Skull, X, Zap, Wallet } from 'lucide-react';

const api = async (path, opts = {}) => {
  const res  = await fetch('/api/' + path, { headers: { 'Content-Type': 'application/json' }, ...opts });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Error');
  return data;
};

const fmt = (n) => '$' + Number(n || 0).toLocaleString('es-AR', { maximumFractionDigits: 0 });

const TYPE_META = {
  AUDIT:    { emoji: '🕵️', color: 'text-yellow-400', border: 'border-yellow-500/40', bg: 'bg-yellow-500/8',  targetLabel: 'Jugador objetivo' },
  HACK:     { emoji: '💻', color: 'text-cyan-400',   border: 'border-cyan-500/40',   bg: 'bg-cyan-500/8',    targetLabel: 'Jugador objetivo' },
  BLACKOUT: { emoji: '⚡', color: 'text-orange-400', border: 'border-orange-500/40', bg: 'bg-orange-500/8',  targetLabel: 'Corporación objetivo' },
  RUMOR:    { emoji: '📰', color: 'text-pink-400',   border: 'border-pink-500/40',   bg: 'bg-pink-500/8',    targetLabel: 'Jugador CEO objetivo' },
  FISCO:    { emoji: '📋', color: 'text-red-400',    border: 'border-red-500/40',    bg: 'bg-red-500/8',     targetLabel: 'Jugador objetivo' },
};

export default function NissaiPanel({ player, players, market, onChange }) {
  const [data,       setData]       = useState(null);
  const [loading,    setLoading]    = useState(true);
  const [selected,   setSelected]   = useState(null);   // sabotage_type
  const [targetPid,  setTargetPid]  = useState('');
  const [targetCid,  setTargetCid]  = useState('');
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    try {
      const d = await api('nissai/' + player.id);
      setData(d);
    } catch (e) { toast.error(e.message); }
    finally { setLoading(false); }
  }, [player.id]);

  useEffect(() => { load(); }, [load]);

  const catalog    = data?.catalog    || [];
  const queued     = data?.orders     || [];
  const ic         = Number(data?.playerIc   || 0);
  const cash       = Number(data?.playerCash || 0);
  const selectedOp = catalog.find(c => c.id === selected);
  const meta       = selected ? TYPE_META[selected] : null;

  const canAfford = selectedOp
    ? (ic >= (selectedOp.cost_ic || 0) && cash >= (selectedOp.cost_cash || 0))
    : false;

  const isCorpTarget = selected === 'BLACKOUT';
  const targetReady  = isCorpTarget ? !!targetCid : !!targetPid;

  const submit = async () => {
    if (!selected || !targetReady) return toast.error('Seleccioná tipo y objetivo');
    if (!canAfford) return toast.error('No tenés recursos suficientes');
    setSubmitting(true);
    try {
      await api('nissai', {
        method: 'POST',
        body: JSON.stringify({
          player_id:        player.id,
          sabotage_type:    selected,
          target_player_id: isCorpTarget ? null : targetPid || null,
          target_corp_id:   isCorpTarget ? targetCid || null : null,
        }),
      });
      toast.success('Sabotaje encolado para medianoche');
      setSelected(null); setTargetPid(''); setTargetCid('');
      await load();
      onChange?.();
    } catch (e) { toast.error(e.message); }
    finally { setSubmitting(false); }
  };

  const cancel = async (orderId) => {
    try {
      await api('nissai/' + orderId, { method: 'DELETE', body: JSON.stringify({ player_id: player.id }) });
      toast.success('Orden cancelada · Recursos devueltos');
      await load();
      onChange?.();
    } catch (e) { toast.error(e.message); }
  };

  if (loading) {
    return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-red-400" /></div>;
  }

  return (
    <div className="space-y-3">
      {/* Header estilo dark market */}
      <div className="bg-gradient-to-r from-red-950/60 to-black border border-red-900/50 rounded-xl p-3 flex items-center gap-3">
        <span className="text-3xl shrink-0">🥷</span>
        <div className="flex-1 min-w-0">
          <div className="font-black text-red-300 uppercase tracking-widest text-sm">El Rey Nissai</div>
          <div className="text-[10px] font-mono text-red-500 mt-0.5">Mercado Negro · Sabotaje por IC / Cash · Resolución 00:00 ART</div>
        </div>
        <div className="text-right shrink-0 space-y-0.5">
          <div className="text-[9px] font-mono text-zinc-500 flex items-center gap-1 justify-end"><Zap className="h-2.5 w-2.5 text-orange-400" />{Math.round(ic).toLocaleString('es-AR')} IC</div>
          <div className="text-[9px] font-mono text-zinc-500 flex items-center gap-1 justify-end"><Wallet className="h-2.5 w-2.5 text-cyan-400" />{fmt(cash)}</div>
        </div>
      </div>

      {/* Catálogo de sabotajes */}
      <Card className="bg-zinc-950 border-zinc-900">
        <CardHeader className="py-2 px-3">
          <CardTitle className="text-red-400 font-mono uppercase text-xs flex items-center gap-1.5">
            <Skull className="h-3.5 w-3.5" /> Elige tu arma
          </CardTitle>
          <CardDescription className="text-zinc-500 text-[10px] font-mono">Resolución en el siguiente turno</CardDescription>
        </CardHeader>
        <CardContent className="px-3 pb-3">
          <div className="grid sm:grid-cols-2 gap-2">
            {catalog.map((op) => {
              const m        = TYPE_META[op.id] || {};
              const isActive = selected === op.id;
              const afford   = ic >= (op.cost_ic || 0) && cash >= (op.cost_cash || 0);
              return (
                <motion.button
                  key={op.id}
                  onClick={() => { if (!afford) return; setSelected(isActive ? null : op.id); setTargetPid(''); setTargetCid(''); }}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.97 }}
                  style={{ willChange: 'transform' }}
                  className={`text-left p-3 rounded-lg border transition-all ${
                    isActive
                      ? `${m.border || 'border-red-500/40'} ${m.bg || 'bg-red-500/8'} shadow-[0_0_16px_rgba(239,68,68,0.15)]`
                      : afford
                        ? 'border-zinc-800 bg-zinc-900/40 hover:border-zinc-700'
                        : 'border-zinc-900 bg-zinc-950/50 opacity-50 cursor-not-allowed'
                  }`}
                >
                  <div className="flex items-start justify-between gap-1 mb-1">
                    <div className="flex items-center gap-1.5">
                      <span className="text-lg">{op.emoji}</span>
                      <span className={`font-bold text-xs ${m.color || 'text-white'}`}>{op.name}</span>
                    </div>
                    {isActive && <div className="w-2 h-2 rounded-full bg-red-400 animate-pulse shrink-0 mt-1" />}
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    {op.cost_ic > 0 && (
                      <span className={`text-[9px] font-mono px-1.5 py-0.5 rounded border ${ic >= op.cost_ic ? 'border-orange-500/40 text-orange-300 bg-orange-500/10' : 'border-red-900 text-red-500 bg-red-950/30'}`}>
                        {op.cost_ic} IC
                      </span>
                    )}
                    {op.cost_cash > 0 && (
                      <span className={`text-[9px] font-mono px-1.5 py-0.5 rounded border ${cash >= op.cost_cash ? 'border-cyan-500/40 text-cyan-300 bg-cyan-500/10' : 'border-red-900 text-red-500 bg-red-950/30'}`}>
                        {fmt(op.cost_cash)}
                      </span>
                    )}
                    <Badge className="text-[8px] border-0 bg-zinc-800 text-zinc-500 font-mono">
                      {op.target === 'CORP' ? 'vs Corp' : 'vs Player'}
                    </Badge>
                  </div>
                </motion.button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Panel de configuración cuando hay selección */}
      <AnimatePresence>
        {selected && selectedOp && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
          >
            <Card className={`border ${meta?.border || 'border-red-700/40'} bg-zinc-950`}>
              <CardHeader className="py-2 px-3">
                <CardTitle className={`font-mono uppercase text-xs flex items-center gap-2 ${meta?.color || 'text-red-400'}`}>
                  <span>{selectedOp.emoji}</span> {selectedOp.name}
                </CardTitle>
                <CardDescription className="text-zinc-500 text-[10px]">
                  {meta?.targetLabel}
                </CardDescription>
              </CardHeader>
              <CardContent className="px-3 pb-3 space-y-3">
                {/* Selector */}
                {isCorpTarget ? (
                  <div>
                    <Label className="text-zinc-400 font-mono text-[9px] uppercase">Corporación objetivo</Label>
                    <Select value={targetCid} onValueChange={setTargetCid}>
                      <SelectTrigger className="bg-black border-zinc-800 text-white text-xs h-8"><SelectValue placeholder="Seleccioná corp..." /></SelectTrigger>
                      <SelectContent className="bg-zinc-950 border-zinc-800 text-white">
                        {market.map(c => (
                          <SelectItem key={c.id} value={c.id} className="text-xs">
                            {c.name} — CEO: {c.ceo_name || 'Vacante'}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ) : (
                  <div>
                    <Label className="text-zinc-400 font-mono text-[9px] uppercase">Jugador objetivo</Label>
                    <Select value={targetPid} onValueChange={setTargetPid}>
                      <SelectTrigger className="bg-black border-zinc-800 text-white text-xs h-8"><SelectValue placeholder="Seleccioná jugador..." /></SelectTrigger>
                      <SelectContent className="bg-zinc-950 border-zinc-800 text-white">
                        {players.filter(p => p.id !== player.id).map(p => (
                          <SelectItem key={p.id} value={p.id} className="text-xs">
                            {p.username}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {/* Costo resumen */}
                <div className="bg-black border border-zinc-800 rounded p-2 text-[10px] font-mono space-y-1">
                  {selectedOp.cost_ic > 0 && (
                    <div className="flex justify-between">
                      <span className="text-zinc-500">Costo IC:</span>
                      <span className={ic >= selectedOp.cost_ic ? 'text-orange-300' : 'text-red-400 font-bold'}>{selectedOp.cost_ic} IC</span>
                    </div>
                  )}
                  {selectedOp.cost_cash > 0 && (
                    <div className="flex justify-between">
                      <span className="text-zinc-500">Costo Cash:</span>
                      <span className={cash >= selectedOp.cost_cash ? 'text-cyan-300' : 'text-red-400 font-bold'}>{fmt(selectedOp.cost_cash)}</span>
                    </div>
                  )}
                  {!canAfford && (
                    <div className="text-red-400 text-[9px] pt-1 border-t border-zinc-800">⚠️ Recursos insuficientes</div>
                  )}
                </div>

                <Button
                  onClick={submit}
                  disabled={submitting || !canAfford || !targetReady}
                  className="w-full bg-red-700 hover:bg-red-600 text-white font-bold uppercase tracking-wider text-xs h-9"
                >
                  {submitting
                    ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    : <><Skull className="h-3.5 w-3.5 mr-1.5" /> Encolar Sabotaje</>}
                </Button>
                <p className="text-[9px] font-mono text-zinc-600 text-center">Se ejecuta al resolver el turno · 00:00 ART</p>
              </CardContent>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Órdenes en cola */}
      {queued.length > 0 && (
        <Card className="bg-zinc-950 border-zinc-900">
          <CardHeader className="py-2 px-3">
            <CardTitle className="text-zinc-400 font-mono uppercase text-xs">Sabotajes encolados</CardTitle>
          </CardHeader>
          <CardContent className="px-3 pb-3 space-y-2">
            <AnimatePresence>
              {queued.map((q) => {
                const m = TYPE_META[q.sabotage_type] || {};
                return (
                  <motion.div
                    key={q.id}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 10 }}
                    className={`flex items-center gap-2 p-2 rounded-lg border ${m.border || 'border-zinc-800'} bg-zinc-900/40`}
                  >
                    <span className="text-base shrink-0">{(catalog.find(c => c.id === q.sabotage_type) || {}).emoji || '🥷'}</span>
                    <div className="flex-1 min-w-0">
                      <div className={`text-xs font-bold ${m.color || 'text-white'}`}>{q.sabotage_type}</div>
                      <div className="text-[9px] font-mono text-zinc-500 truncate">
                        → {q.target_username || q.target_corp_name || '?'}
                      </div>
                    </div>
                    <Badge className="bg-yellow-500/20 text-yellow-300 border-0 text-[9px] font-mono shrink-0">PENDING</Badge>
                    <button
                      onClick={() => cancel(q.id)}
                      className="text-zinc-600 hover:text-red-400 transition-colors shrink-0"
                      title="Cancelar"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
