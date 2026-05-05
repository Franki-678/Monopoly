'use client';
import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Handshake, Swords, CheckCircle2, XCircle, Clock, Lock, ShieldCheck, Flame } from 'lucide-react';
import { toast } from 'sonner';

const api = async (path, opts = {}) => {
  const res = await fetch('/api/' + path, { headers: { 'Content-Type': 'application/json' }, ...opts });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Error');
  return data;
};

const fmt = (n) => '$' + Number(n || 0).toLocaleString('es-AR', { maximumFractionDigits: 0 });

export default function AlliancesTab({ player, players, liquidCash, onChange }) {
  const [alliances, setAlliances] = useState([]);
  const [loading, setLoading] = useState(false);
  const [target, setTarget] = useState('');
  const [pct, setPct] = useState('10');

  const load = async () => {
    try {
      const { alliances } = await api('alliances/list/' + player.id);
      setAlliances(alliances);
    } catch (e) { toast.error(e.message); }
  };

  useEffect(() => { load(); }, [player.id]);

  const propose = async () => {
    if (!target) return toast.error('Elegí un aliado');
    setLoading(true);
    try {
      await api('alliances', { method: 'POST', body: JSON.stringify({ proposer_id: player.id, recipient_id: target, escrow_pct: Number(pct) }) });
      toast.success('Propuesta enviada');
      setTarget(''); setPct('10');
      await load(); onChange?.();
    } catch (e) { toast.error(e.message); } finally { setLoading(false); }
  };

  const act = async (endpoint, id) => {
    setLoading(true);
    try {
      await api('alliances/' + endpoint + '/' + id, { method: 'POST', body: JSON.stringify({ player_id: player.id }) });
      toast.success('Hecho');
      await load(); onChange?.();
    } catch (e) { toast.error(e.message); } finally { setLoading(false); }
  };

  const incoming = alliances.filter(a => a.status === 'PROPOSED' && a.recipient_id === player.id);
  const outgoing = alliances.filter(a => a.status === 'PROPOSED' && a.proposer_id === player.id);
  const active = alliances.filter(a => a.status === 'ACTIVE');
  const history = alliances.filter(a => ['BROKEN', 'DISSOLVED', 'REJECTED', 'CANCELLED'].includes(a.status));

  const otherPlayers = players.filter(p => p.id !== player.id && !p.bankrupt);
  const previewEscrow = Math.round(liquidCash * Number(pct) / 100 * 100) / 100;

  return (
    <div className="grid lg:grid-cols-3 gap-4">
      {/* Propose new */}
      <Card className="bg-zinc-950/80 backdrop-blur border-zinc-900 h-fit">
        <CardHeader>
          <CardTitle className="text-lime-400 font-mono uppercase text-sm flex items-center gap-2"><Handshake className="h-4 w-4" /> Proponer Alianza</CardTitle>
          <CardDescription className="text-zinc-500 text-xs">Bloquea % de cash en escrow. Romperla = perder todo al aliado.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <Label className="text-zinc-400 font-mono text-[10px] uppercase">Aliado</Label>
            <Select value={target} onValueChange={setTarget}>
              <SelectTrigger className="bg-black border-zinc-800 text-white"><SelectValue placeholder="Seleccioná..." /></SelectTrigger>
              <SelectContent className="bg-zinc-950 border-zinc-800 text-white">
                {otherPlayers.map(p => (
                  <SelectItem key={p.id} value={p.id}>{p.username} · NW {fmt(p.net_worth)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-zinc-400 font-mono text-[10px] uppercase">Escrow % (5-30)</Label>
            <Input type="number" min="5" max="30" value={pct} onChange={(e) => setPct(e.target.value)}
              className="bg-black border-zinc-800 text-white font-mono" />
          </div>
          <div className="bg-black border border-zinc-800 rounded p-3 text-xs font-mono space-y-1">
            <div className="flex justify-between"><span className="text-zinc-500">Tu cash:</span><span className="text-white">{fmt(liquidCash)}</span></div>
            <div className="flex justify-between"><span className="text-zinc-500">Escrow a bloquear:</span><span className="text-orange-400 font-bold">{fmt(previewEscrow)}</span></div>
            <div className="flex justify-between border-t border-zinc-800 pt-1 mt-1"><span className="text-zinc-500">Riesgo total:</span><span className="text-red-400 font-bold">{fmt(previewEscrow)}</span></div>
          </div>
          <Button onClick={propose} disabled={loading || !target} className="w-full bg-lime-400 hover:bg-lime-300 text-black font-bold uppercase">
            Enviar Propuesta
          </Button>
        </CardContent>
      </Card>

      {/* Incoming + Active + History */}
      <div className="lg:col-span-2 space-y-4">
        {incoming.length > 0 && (
          <Card className="bg-zinc-950/80 backdrop-blur border-orange-500/30">
            <CardHeader>
              <CardTitle className="text-orange-400 font-mono uppercase text-sm">Propuestas Recibidas ({incoming.length})</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <AnimatePresence>
                {incoming.map(a => (
                  <AllianceRow key={a.id} a={a} player={player} onAccept={() => act('accept', a.id)} onReject={() => act('reject', a.id)} loading={loading} />
                ))}
              </AnimatePresence>
            </CardContent>
          </Card>
        )}

        {outgoing.length > 0 && (
          <Card className="bg-zinc-950/80 backdrop-blur border-zinc-900">
            <CardHeader>
              <CardTitle className="text-zinc-300 font-mono uppercase text-sm">Propuestas Enviadas ({outgoing.length})</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {outgoing.map(a => (
                <AllianceRow key={a.id} a={a} player={player} onCancel={() => act('reject', a.id)} loading={loading} />
              ))}
            </CardContent>
          </Card>
        )}

        <Card className="bg-zinc-950/80 backdrop-blur border-zinc-900">
          <CardHeader>
            <CardTitle className="text-lime-400 font-mono uppercase text-sm flex items-center gap-2">
              <ShieldCheck className="h-4 w-4" /> Alianzas Activas ({active.length})
            </CardTitle>
            <CardDescription className="text-zinc-500 text-xs">Si compras shares de una corp donde tu aliado es CEO → ruptura automática y perdés tu escrow.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {active.length === 0 ? <p className="text-zinc-500 italic text-sm">Sin alianzas activas.</p> :
              active.map(a => (
                <AllianceRow key={a.id} a={a} player={player} onDissolve={() => {
                  if (confirm('Disolver alianza pacíficamente devuelve ambos escrows.')) act('dissolve', a.id);
                }} loading={loading} />
              ))
            }
          </CardContent>
        </Card>

        {history.length > 0 && (
          <Card className="bg-zinc-950/80 backdrop-blur border-zinc-900">
            <CardHeader>
              <CardTitle className="text-zinc-400 font-mono uppercase text-sm">Historial</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {history.slice(0, 10).map(a => (
                <AllianceRow key={a.id} a={a} player={player} readonly />
              ))}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

function AllianceRow({ a, player, onAccept, onReject, onCancel, onDissolve, readonly, loading }) {
  const isProposer = a.proposer_id === player.id;
  const otherName = isProposer ? a.recipient_name : a.proposer_name;
  const otherColor = isProposer ? a.recipient_color : a.proposer_color;
  const myEscrow = isProposer ? a.escrow_proposer : a.escrow_recipient;
  const otherEscrow = isProposer ? a.escrow_recipient : a.escrow_proposer;

  const statusMeta = {
    PROPOSED: { color: 'orange', Icon: Clock, label: 'Pendiente' },
    ACTIVE: { color: 'lime', Icon: Lock, label: 'Activa' },
    BROKEN: { color: 'red', Icon: Swords, label: 'ROTA POR TRAICIÓN' },
    DISSOLVED: { color: 'zinc', Icon: CheckCircle2, label: 'Disuelta' },
    REJECTED: { color: 'zinc', Icon: XCircle, label: 'Rechazada' },
    CANCELLED: { color: 'zinc', Icon: XCircle, label: 'Cancelada' },
  };
  const meta = statusMeta[a.status];
  const { Icon } = meta;

  const stripe = meta.color === 'lime' ? 'bg-lime-400' : meta.color === 'orange' ? 'bg-orange-400' : meta.color === 'red' ? 'bg-red-500' : 'bg-zinc-700';
  const shadow = meta.color === 'lime' ? 'shadow-[0_0_30px_rgba(163,230,53,0.12)]' : meta.color === 'red' ? 'shadow-[0_0_30px_rgba(248,113,113,0.18)]' : '';
  const wasBetrayed = a.status === 'BROKEN' && a.broken_by && a.broken_by !== player.id;
  const wasTraitor = a.status === 'BROKEN' && a.broken_by === player.id;

  return (
    <motion.div layout initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
      className={`relative bg-zinc-900/40 border rounded-lg p-3 ${
        meta.color === 'red' ? 'border-red-500/40' : meta.color === 'lime' ? 'border-lime-500/30' : meta.color === 'orange' ? 'border-orange-500/30' : 'border-zinc-800'
      } ${shadow}`}
    >
      <div className={`absolute left-0 top-0 bottom-0 w-1 rounded-l-lg ${stripe}`} />
      <div className="pl-2">
        <div className="flex items-center justify-between flex-wrap gap-2 mb-2">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full flex items-center justify-center font-black text-black" style={{ backgroundColor: otherColor || '#666' }}>{otherName?.[0] || '?'}</div>
            <div>
              <div className="font-bold text-sm text-white">{isProposer ? 'Tú → ' : ''}{otherName}{!isProposer ? ' → Tú' : ''}</div>
              <div className="text-[10px] font-mono text-zinc-500 uppercase">Propuesta turno {a.proposed_at_turn} · {a.escrow_pct}% escrow</div>
            </div>
          </div>
          <Badge className={`font-mono text-[10px] px-2 py-0 border-0 ${
            meta.color === 'lime' ? 'bg-lime-500/20 text-lime-300' :
            meta.color === 'orange' ? 'bg-orange-500/20 text-orange-300' :
            meta.color === 'red' ? 'bg-red-500/20 text-red-300' :
            'bg-zinc-800 text-zinc-400'
          }`}>
            <Icon className="h-3 w-3 mr-1" /> {meta.label}
          </Badge>
        </div>

        {(a.status === 'ACTIVE' || a.status === 'BROKEN' || a.status === 'DISSOLVED') && (
          <div className="grid grid-cols-2 gap-2 text-[11px] font-mono mb-2">
            <div className="bg-black/40 border border-zinc-800 rounded p-2">
              <div className="text-zinc-500 uppercase text-[9px]">Tu escrow</div>
              <div className="text-lime-400 font-bold">{fmt(myEscrow)}</div>
            </div>
            <div className="bg-black/40 border border-zinc-800 rounded p-2">
              <div className="text-zinc-500 uppercase text-[9px]">Escrow {otherName}</div>
              <div className="text-cyan-400 font-bold">{fmt(otherEscrow)}</div>
            </div>
          </div>
        )}

        {a.status === 'BROKEN' && (
          <div className={`text-xs font-mono mb-2 p-2 rounded border ${wasBetrayed ? 'bg-lime-500/10 border-lime-500/30 text-lime-300' : 'bg-red-500/10 border-red-500/30 text-red-300'}`}>
            <Flame className="h-3 w-3 inline mr-1" />
            {wasBetrayed && <span>Te traicionó. Confiscaste <b>{fmt(Number(a.escrow_proposer) + Number(a.escrow_recipient))}</b> en escrow combinado.</span>}
            {wasTraitor && <span>Rompiste la alianza. Perdiste <b>{fmt(myEscrow)}</b> a favor del aliado.</span>}
            {!wasBetrayed && !wasTraitor && <span>Rota en turno {a.broken_at_turn}</span>}
            {a.break_reason && <div className="text-[10px] opacity-80 mt-1">▸ {a.break_reason}</div>}
          </div>
        )}

        {!readonly && (
          <div className="flex gap-2">
            {onAccept && <Button size="sm" onClick={onAccept} disabled={loading} className="bg-lime-400 hover:bg-lime-300 text-black font-bold h-7 text-xs">Aceptar (bloquea {a.escrow_pct}%)</Button>}
            {onReject && <Button size="sm" variant="ghost" onClick={onReject} disabled={loading} className="text-red-400 hover:text-red-300 h-7 text-xs">Rechazar</Button>}
            {onCancel && <Button size="sm" variant="ghost" onClick={onCancel} disabled={loading} className="text-zinc-400 hover:text-zinc-200 h-7 text-xs">Cancelar propuesta</Button>}
            {onDissolve && <Button size="sm" variant="ghost" onClick={onDissolve} disabled={loading} className="text-orange-400 hover:text-orange-300 h-7 text-xs">Disolver (mutuo)</Button>}
          </div>
        )}
      </div>
    </motion.div>
  );
}
