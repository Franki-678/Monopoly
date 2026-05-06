'use client';
import { useState } from 'react';
import { motion } from 'framer-motion';
import { X, Crown, Loader2, TrendingUp, TrendingDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';

const api = async (path, opts = {}) => {
  const res  = await fetch('/api/' + path, { headers: { 'Content-Type': 'application/json' }, ...opts });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Error');
  return data;
};
const fmt    = (n) => '$' + Number(n || 0).toLocaleString('es-AR', { maximumFractionDigits: 0 });
const fmtDec = (n) => '$' + Number(n || 0).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function corpScore(corp, turn) {
  const t = Math.max(1, turn);
  const incMult   = 1 + 0.01 * Math.pow(t, 1.15);
  const costMult  = Math.pow(1.02, t - 1);
  const sharePrice = Number(corp.fair_market_value) / 100;
  if (sharePrice <= 0) return 1;
  const divPerShare   = (Number(corp.base_income || 0) * incMult) / 100;
  const maintPerShare = sharePrice * 0.015 * costMult;
  const roi = (divPerShare - maintPerShare) / sharePrice;
  if (roi > 0.06) return 5;
  if (roi > 0.04) return 4;
  if (roi > 0.02) return 3;
  if (roi > 0)    return 2;
  return 1;
}

function ScoreFlames({ score }) {
  return (
    <div className="flex gap-0.5">
      {Array.from({ length: 5 }).map((_, i) => (
        <span key={i} className={`text-lg leading-none ${i < score ? 'opacity-100' : 'opacity-15'}`}>🔥</span>
      ))}
    </div>
  );
}

function QuickBtn({ label, sublabel, color, onClick, disabled }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`flex flex-col items-center justify-center p-2.5 rounded-xl border transition-all active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed ${color}`}
    >
      <span className="text-sm font-black leading-none">{label}</span>
      <span className="text-[8px] font-mono mt-0.5 opacity-70">{sublabel}</span>
    </button>
  );
}

export default function CorpDetailModal({ corp, player, myShares = 0, turn, onClose, refresh }) {
  const [customQty, setCustomQty]     = useState('');
  const [customType, setCustomType]   = useState('BUY_SHARES');
  const [loading, setLoading]         = useState(false);

  if (!corp) return null;

  const score      = corpScore(corp, turn);
  const sharePrice = Number(corp.fair_market_value) / 100;
  const buyPrice   = sharePrice * 1.03;
  const sellPrice  = sharePrice * 0.97;
  const supply     = (corp.total_shares || 100) - (corp.owned_shares || 0);
  const isCeo      = corp.ceo_player_id === player.id;

  // Estimated net per share per turn
  const incMult  = 1 + 0.01 * Math.pow(Math.max(1, turn), 1.15);
  const costMult = Math.pow(1.02, Math.max(0, turn - 1));
  const divPerShare   = (Number(corp.base_income || 0) * incMult) / 100;
  const maintPerShare = sharePrice * 0.015 * costMult;
  const netPerShare   = divPerShare - maintPerShare;

  const placeOrder = async (type, qty) => {
    const q = parseInt(qty, 10);
    if (!q || q <= 0) return toast.error('Cantidad inválida');
    setLoading(true);
    try {
      await api('orders', {
        method: 'POST',
        body: JSON.stringify({
          player_id:      player.id,
          order_type:     type,
          corporation_id: corp.id,
          shares:         q,
          limit_price:    null,
        }),
      });
      toast.success(`${type === 'BUY_SHARES' ? `+${q} shares` : `-${q} shares`} de ${corp.name} encolado`);
      setCustomQty('');
      refresh();
      onClose();
    } catch (e) { toast.error(e.message); }
    finally { setLoading(false); }
  };

  return (
    <motion.div
      className="fixed inset-0 z-[300] bg-black/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-2 sm:p-4"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <motion.div
        className="w-full max-w-sm bg-zinc-950 border border-zinc-800 rounded-2xl overflow-hidden shadow-2xl"
        initial={{ y: 60, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 60, opacity: 0 }}
        transition={{ type: 'spring', stiffness: 280, damping: 28 }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start gap-3 p-4 border-b border-zinc-900">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="font-black text-base text-white truncate">{corp.name}</h2>
              {isCeo && (
                <Badge className="bg-orange-500/20 text-orange-300 border-orange-500/30 text-[8px] shrink-0">
                  <Crown className="h-2.5 w-2.5 mr-0.5" />CEO
                </Badge>
              )}
            </div>
            <div className="text-[9px] font-mono text-zinc-500 mt-0.5">
              {corp.district} · <span className="italic text-zinc-400">{corp.tagline}</span>
            </div>
          </div>
          <button onClick={onClose} className="text-zinc-500 hover:text-white transition-colors shrink-0 mt-0.5">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-4 space-y-4 max-h-[70vh] overflow-y-auto" style={{ scrollbarWidth: 'none' }}>
          {/* Score + CEO row */}
          <div className="flex items-center justify-between">
            <div>
              <div className="text-[8px] font-mono uppercase text-zinc-600 mb-1">Rentabilidad</div>
              <ScoreFlames score={score} />
            </div>
            <div className="text-right">
              <div className="text-[8px] font-mono uppercase text-zinc-600 mb-1">CEO actual</div>
              <div className="text-sm font-bold text-white">{corp.ceo_name || 'Vacante'}</div>
            </div>
          </div>

          {/* Stats grid */}
          <div className="grid grid-cols-4 gap-1.5">
            {[
              { label: 'FMV',    value: fmt(corp.fair_market_value), color: 'text-lime-400' },
              { label: '$/Share',value: fmtDec(sharePrice),          color: 'text-cyan-400' },
              { label: 'Disp.',  value: `${supply}/100`,             color: supply > 20 ? 'text-lime-400' : supply > 5 ? 'text-orange-400' : 'text-red-400' },
              { label: 'Neto/sh',value: (netPerShare >= 0 ? '+' : '') + fmtDec(netPerShare), color: netPerShare >= 0 ? 'text-lime-400' : 'text-red-400' },
            ].map(s => (
              <div key={s.label} className="bg-zinc-900/60 rounded-lg p-2 text-center">
                <div className="text-[7px] font-mono uppercase text-zinc-600">{s.label}</div>
                <div className={`text-[10px] font-black font-mono mt-0.5 ${s.color}`}>{s.value}</div>
              </div>
            ))}
          </div>

          {/* My position (if any) */}
          {myShares > 0 && (
            <div className="flex items-center justify-between bg-lime-500/8 border border-lime-500/20 rounded-lg px-3 py-2">
              <span className="text-[10px] font-mono text-lime-500 uppercase">Tu posición</span>
              <span className="font-bold text-lime-300 text-sm font-mono">
                {myShares} shares · {fmt(myShares * sharePrice)}
              </span>
            </div>
          )}

          {/* ── Quick BUY ── */}
          <div>
            <div className="text-[8px] font-mono uppercase text-zinc-500 mb-2 flex items-center gap-1">
              <TrendingUp className="h-2.5 w-2.5 text-lime-400" /> Comprar
            </div>
            <div className="grid grid-cols-3 gap-2">
              {[5, 10, 25].map(qty => (
                <QuickBtn
                  key={qty}
                  label={`+${qty}`}
                  sublabel={`~${fmt(Math.round(qty * buyPrice))}`}
                  color="bg-lime-400/10 hover:bg-lime-400/20 border-lime-500/30 text-lime-300"
                  onClick={() => placeOrder('BUY_SHARES', qty)}
                  disabled={loading || supply < qty}
                />
              ))}
            </div>
          </div>

          {/* ── Quick SELL (only if I have shares) ── */}
          {myShares > 0 && (
            <div>
              <div className="text-[8px] font-mono uppercase text-zinc-500 mb-2 flex items-center gap-1">
                <TrendingDown className="h-2.5 w-2.5 text-red-400" /> Vender
              </div>
              <div className="grid grid-cols-3 gap-2">
                {[...new Set([Math.min(5, myShares), Math.min(10, myShares), myShares])]
                  .filter(v => v > 0)
                  .map(qty => (
                    <QuickBtn
                      key={qty}
                      label={qty === myShares && qty > 10 ? 'Todo' : `-${qty}`}
                      sublabel={`~${fmt(Math.round(qty * sellPrice))}`}
                      color="bg-red-500/10 hover:bg-red-500/20 border-red-500/30 text-red-300"
                      onClick={() => placeOrder('SELL_SHARES', qty)}
                      disabled={loading}
                    />
                  ))}
              </div>
            </div>
          )}

          {/* ── Custom quantity ── */}
          <div className="border-t border-zinc-900 pt-3">
            <div className="text-[8px] font-mono uppercase text-zinc-500 mb-2">Cantidad personalizada</div>
            <div className="flex items-center gap-2 mb-2">
              <button
                onClick={() => setCustomType('BUY_SHARES')}
                className={`flex-1 py-1.5 text-[9px] font-mono uppercase rounded-lg border transition-colors ${
                  customType === 'BUY_SHARES' ? 'bg-lime-400/20 border-lime-500/50 text-lime-300' : 'border-zinc-800 text-zinc-500'
                }`}
              >Comprar</button>
              <button
                onClick={() => setCustomType('SELL_SHARES')}
                className={`flex-1 py-1.5 text-[9px] font-mono uppercase rounded-lg border transition-colors ${
                  customType === 'SELL_SHARES' ? 'bg-red-500/20 border-red-500/50 text-red-300' : 'border-zinc-800 text-zinc-500'
                }`}
              >Vender</button>
            </div>
            <div className="flex gap-2">
              <Input
                type="number"
                min="1"
                value={customQty}
                onChange={e => setCustomQty(e.target.value)}
                placeholder="Cantidad..."
                className="bg-black border-zinc-800 text-white font-mono h-9 text-sm flex-1"
              />
              <Button
                onClick={() => placeOrder(customType, customQty)}
                disabled={loading || !customQty}
                className={`shrink-0 h-9 font-bold text-xs ${
                  customType === 'BUY_SHARES'
                    ? 'bg-lime-400 hover:bg-lime-300 text-black'
                    : 'bg-red-700 hover:bg-red-600 text-white'
                }`}
              >
                {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Encolar'}
              </Button>
            </div>
            {customQty && Number(customQty) > 0 && (
              <p className="text-[9px] font-mono text-zinc-600 mt-1">
                Est.: {customType === 'BUY_SHARES'
                  ? fmt(Math.round(Number(customQty) * buyPrice)) + ' (+3% spread)'
                  : fmt(Math.round(Number(customQty) * sellPrice)) + ' (-3% spread)'}
              </p>
            )}
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
