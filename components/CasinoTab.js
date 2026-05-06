'use client';
import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';

const api = async (path, opts = {}) => {
  const res  = await fetch('/api/' + path, { headers: { 'Content-Type': 'application/json' }, ...opts });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Error');
  return data;
};

const fmt = (n) => '$' + Number(n || 0).toLocaleString('es-AR', { maximumFractionDigits: 0 });

const OUTCOMES = [
  { id: 'JACKPOT',   label: 'JACKPOT',     emoji: '💰', mult: '×6.0',  pct: '4%',  color: 'text-yellow-300', border: 'border-yellow-500/50', bg: 'bg-yellow-500/10' },
  { id: 'WIN',       label: 'GANASTE',     emoji: '🤑', mult: '×2.5',  pct: '23%', color: 'text-lime-300',   border: 'border-lime-500/50',   bg: 'bg-lime-500/10'   },
  { id: 'SMALL_WIN', label: 'ALGO ES ALGO',emoji: '🟡', mult: '×1.5',  pct: '23%', color: 'text-cyan-300',   border: 'border-cyan-500/50',   bg: 'bg-cyan-500/10'   },
  { id: 'LOSE',      label: 'SE FUNDIÓ',   emoji: '💀', mult: '×0',    pct: '50%', color: 'text-red-400',    border: 'border-red-500/50',    bg: 'bg-red-500/10'    },
];

const RESULT_META = Object.fromEntries(OUTCOMES.map(o => [o.id, o]));

export default function CasinoTab({ player, liquidCash, onChange }) {
  const [data,       setData]       = useState(null);
  const [loading,    setLoading]    = useState(true);
  const [betAmount,  setBetAmount]  = useState('');
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    try {
      const d = await api('casino/' + player.id);
      setData(d);
    } catch (e) { toast.error(e.message); }
    finally { setLoading(false); }
  }, [player.id]);

  useEffect(() => { load(); }, [load]);

  const maxBet    = Math.floor(liquidCash * 0.4);
  const betNum    = parseInt(betAmount, 10) || 0;
  const betValid  = betNum >= 100 && betNum <= maxBet;
  const hasBet    = !!data?.currentBet;
  const lastResult = data?.lastResult;

  const quickBet = (pct) => {
    const v = Math.floor(liquidCash * pct / 100);
    setBetAmount(String(Math.max(100, Math.min(v, maxBet))));
  };

  const submit = async () => {
    if (!betValid) return toast.error(`Mínimo $100 · Máximo ${fmt(maxBet)} (40% del cash)`);
    setSubmitting(true);
    try {
      await api('casino', {
        method: 'POST',
        body: JSON.stringify({ player_id: player.id, bet_amount: betNum }),
      });
      toast.success('Apuesta registrada · Se juega a medianoche');
      setBetAmount('');
      await load();
      onChange?.();
    } catch (e) { toast.error(e.message); }
    finally { setSubmitting(false); }
  };

  if (loading) {
    return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-purple-400" /></div>;
  }

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="bg-gradient-to-r from-purple-950/60 to-black border border-purple-800/50 rounded-xl p-3 flex items-center gap-3">
        <span className="text-3xl shrink-0">🎰</span>
        <div className="flex-1">
          <div className="font-black text-purple-300 uppercase tracking-widest text-sm">Casino de Medianoche</div>
          <div className="text-[10px] font-mono text-purple-500 mt-0.5">1 apuesta por turno · máx 40% del cash · resultados a las 00:00 ART</div>
        </div>
      </div>

      {/* Tabla de probabilidades */}
      <Card className="bg-zinc-950 border-zinc-900">
        <CardHeader className="py-2 px-3">
          <CardTitle className="text-purple-400 font-mono uppercase text-xs">Tabla de Pagos</CardTitle>
        </CardHeader>
        <CardContent className="px-3 pb-3">
          <div className="grid grid-cols-2 gap-2">
            {OUTCOMES.map((o) => (
              <div key={o.id} className={`border ${o.border} ${o.bg} rounded-lg p-2.5 text-center`}>
                <div className="text-xl mb-0.5">{o.emoji}</div>
                <div className={`font-black text-sm ${o.color}`}>{o.mult}</div>
                <div className="text-[9px] font-mono text-zinc-500 uppercase">{o.label}</div>
                <div className={`text-[9px] font-mono mt-0.5 ${o.color} opacity-70`}>{o.pct} prob.</div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Apuesta activa o formulario */}
      {hasBet ? (
        <Card className="bg-gradient-to-br from-yellow-950/40 to-black border-yellow-700/50">
          <CardContent className="px-4 py-4 text-center">
            <div className="text-3xl mb-2">⏳</div>
            <div className="font-black text-yellow-300 text-base uppercase">Apuesta en juego</div>
            <div className="font-mono text-3xl font-black text-yellow-400 my-2">{fmt(data.currentBet.bet_amount)}</div>
            <div className="text-[10px] font-mono text-zinc-500">Se resuelve esta noche a las 00:00 ART</div>
            <div className="text-[9px] font-mono text-zinc-600 mt-1">Posible jackpot: {fmt(data.currentBet.bet_amount * 6)}</div>
          </CardContent>
        </Card>
      ) : (
        <Card className="bg-zinc-950 border-zinc-900">
          <CardHeader className="py-2 px-3">
            <CardTitle className="text-purple-400 font-mono uppercase text-xs">Nueva Apuesta</CardTitle>
            <CardDescription className="text-zinc-500 text-[10px]">
              Disponible: {fmt(liquidCash)} · Máx: {fmt(maxBet)}
            </CardDescription>
          </CardHeader>
          <CardContent className="px-3 pb-3 space-y-3">
            {/* Quick bet buttons */}
            <div>
              <Label className="text-zinc-400 font-mono text-[9px] uppercase">Apuesta rápida</Label>
              <div className="flex gap-2 mt-1 flex-wrap">
                {[10, 20, 30, 40].map(pct => (
                  <button
                    key={pct}
                    onClick={() => quickBet(pct)}
                    className="px-3 py-1 border border-purple-700/50 rounded-full text-[10px] font-mono text-purple-300 hover:bg-purple-700/20 transition-colors"
                  >
                    {pct}%
                  </button>
                ))}
              </div>
            </div>

            <div>
              <Label className="text-zinc-400 font-mono text-[9px] uppercase">Monto ($)</Label>
              <Input
                type="number"
                min={100}
                max={maxBet}
                value={betAmount}
                onChange={e => setBetAmount(e.target.value)}
                className="bg-black border-zinc-800 text-white font-mono h-9 text-sm"
                placeholder={`100 – ${maxBet}`}
              />
            </div>

            {betNum >= 100 && (
              <div className="bg-black border border-zinc-800 rounded p-2 text-[10px] font-mono space-y-1">
                {OUTCOMES.map(o => (
                  <div key={o.id} className="flex justify-between">
                    <span className={`${o.color} opacity-80`}>{o.emoji} {o.label} ({o.pct}):</span>
                    <span className={o.id === 'LOSE' ? 'text-red-400' : 'text-lime-400'}>
                      {o.id === 'LOSE' ? `-${fmt(betNum)}` : `+${fmt(betNum * parseFloat(o.mult.slice(1)) - betNum)}`}
                    </span>
                  </div>
                ))}
              </div>
            )}

            <Button
              onClick={submit}
              disabled={submitting || !betValid || maxBet < 100}
              className="w-full bg-purple-600 hover:bg-purple-500 text-white font-bold uppercase tracking-wider text-xs h-9"
            >
              {submitting
                ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                : '🎰 Apostar'}
            </Button>
            {maxBet < 100 && (
              <p className="text-[9px] font-mono text-red-500 text-center">Necesitás al menos $250 para apostar (mínimo $100)</p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Último resultado */}
      {lastResult && (
        <Card className="bg-zinc-950 border-zinc-900">
          <CardHeader className="py-2 px-3">
            <CardTitle className="text-zinc-400 font-mono uppercase text-xs">Último Resultado · T{lastResult.turn_number}</CardTitle>
          </CardHeader>
          <CardContent className="px-3 pb-3">
            {(() => {
              const m   = RESULT_META[lastResult.result] || {};
              const net = Number(lastResult.payout) - Number(lastResult.bet_amount);
              return (
                <div className={`border ${m.border || 'border-zinc-800'} ${m.bg || 'bg-zinc-900/40'} rounded-lg p-4 text-center`}>
                  <div className="text-4xl mb-1">{m.emoji || '🎰'}</div>
                  <div className={`font-black text-lg uppercase ${m.color || 'text-white'}`}>{m.label || lastResult.result}</div>
                  <div className={`font-mono text-2xl font-black my-1 ${net >= 0 ? 'text-lime-400' : 'text-red-400'}`}>
                    {net >= 0 ? '+' : ''}{fmt(net)}
                  </div>
                  <div className="text-[9px] font-mono text-zinc-500">
                    Aposté {fmt(lastResult.bet_amount)} → cobré {fmt(lastResult.payout)}
                  </div>
                </div>
              );
            })()}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
