'use client';
import { motion } from 'framer-motion';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { CheckCircle2, XCircle, Clock, AlertTriangle, TrendingUp, TrendingDown } from 'lucide-react';

const STATUS_META = {
  PENDING: { color: 'zinc', label: 'EN COLA', Icon: Clock, glow: '' },
  EXECUTED: { color: 'lime', label: 'EJECUTADO', Icon: CheckCircle2, glow: 'shadow-[0_0_20px_rgba(163,230,53,0.15)]' },
  PARTIAL: { color: 'orange', label: 'PARCIAL', Icon: AlertTriangle, glow: 'shadow-[0_0_20px_rgba(251,146,60,0.15)]' },
  REJECTED: { color: 'red', label: 'RECHAZADO', Icon: XCircle, glow: 'shadow-[0_0_20px_rgba(248,113,113,0.12)]' },
};

const COLOR_CLASSES = {
  zinc: 'border-zinc-800 bg-zinc-900/40 text-zinc-400',
  lime: 'border-lime-500/30 bg-lime-500/5 text-lime-300',
  orange: 'border-orange-500/30 bg-orange-500/5 text-orange-300',
  red: 'border-red-500/30 bg-red-500/5 text-red-300',
};

export default function ActionReceipt({ order, onCancel }) {
  const meta = STATUS_META[order.status] || STATUS_META.PENDING;
  const { Icon } = meta;
  const isBuy = order.order_type === 'BUY_SHARES';

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -30 }}
      transition={{ type: 'spring', stiffness: 300, damping: 25 }}
      className={`relative border rounded-lg p-3 ${COLOR_CLASSES[meta.color]} ${meta.glow}`}
    >
      {/* Status stripe */}
      <div className={`absolute left-0 top-0 bottom-0 w-1 rounded-l-lg ${
        meta.color === 'lime' ? 'bg-lime-400' : meta.color === 'orange' ? 'bg-orange-400' : meta.color === 'red' ? 'bg-red-400' : 'bg-zinc-600'
      }`} />

      <div className="flex items-start justify-between gap-2 mb-2 pl-1">
        <div className="flex items-center gap-2 flex-wrap">
          <Badge className={`font-mono text-[9px] px-1.5 py-0 border-0 ${
            isBuy ? 'bg-cyan-500/20 text-cyan-300' : 'bg-pink-500/20 text-pink-300'
          }`}>
            {isBuy ? <TrendingUp className="h-2.5 w-2.5 mr-1" /> : <TrendingDown className="h-2.5 w-2.5 mr-1" />}
            {isBuy ? 'COMPRA' : 'VENTA'}
          </Badge>
          <Badge className={`font-mono text-[9px] px-1.5 py-0 border-0 ${
            meta.color === 'lime' ? 'bg-lime-500/20 text-lime-300' :
            meta.color === 'orange' ? 'bg-orange-500/20 text-orange-300' :
            meta.color === 'red' ? 'bg-red-500/20 text-red-300' :
            'bg-zinc-700/40 text-zinc-400'
          }`}>
            <Icon className="h-2.5 w-2.5 mr-1" />
            {meta.label}
          </Badge>
        </div>
        {order.status === 'PENDING' && onCancel && (
          <Button size="sm" variant="ghost" onClick={() => onCancel(order.id)}
            className="text-red-400 hover:text-red-300 h-6 text-[10px] px-2">
            Cancelar
          </Button>
        )}
      </div>

      <div className="pl-1 space-y-1">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-sm font-bold text-white truncate">{order.corp_name}</span>
          <span className="font-mono text-sm text-white shrink-0">{order.shares} sh{order.limit_price ? ` @ ≤$${Number(order.limit_price).toFixed(2)}` : ''}</span>
        </div>
        {order.result_note && (
          <div className={`text-[11px] font-mono leading-snug ${
            meta.color === 'red' ? 'text-red-400/90' : meta.color === 'orange' ? 'text-orange-300/90' : meta.color === 'lime' ? 'text-lime-300/90' : 'text-zinc-400'
          }`}>
            ▸ {order.result_note}
          </div>
        )}
      </div>
    </motion.div>
  );
}
