'use client';
import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toast } from 'sonner';
import { Loader2, X, Target, Skull } from 'lucide-react';

const api = async (path, opts = {}) => {
  const res  = await fetch('/api/' + path, { headers: { 'Content-Type': 'application/json' }, ...opts });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Error');
  return data;
};

const fmt = (n) => '$' + Number(n || 0).toLocaleString('es-AR', { maximumFractionDigits: 0 });

export default function BountyBoard({ player, players, liquidCash, onChange }) {
  const [data,       setData]       = useState(null);
  const [loading,    setLoading]    = useState(true);
  const [targetId,   setTargetId]   = useState('');
  const [reward,     setReward]     = useState('');
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    try {
      const d = await api('bounty?player_id=' + player.id);
      setData(d);
    } catch (e) { toast.error(e.message); }
    finally { setLoading(false); }
  }, [player.id]);

  useEffect(() => { load(); }, [load]);

  const bounties   = data?.bounties   || [];
  const mine       = data?.mine       || [];
  const rewardNum  = parseInt(reward, 10) || 0;
  const rewardValid = rewardNum >= 200 && rewardNum <= liquidCash;

  const submit = async () => {
    if (!targetId) return toast.error('Seleccioná un objetivo');
    if (!rewardValid) return toast.error(`Mínimo $200 · Máximo ${fmt(liquidCash)}`);
    setSubmitting(true);
    try {
      await api('bounty', {
        method: 'POST',
        body: JSON.stringify({ poster_id: player.id, target_id: targetId, reward_cash: rewardNum }),
      });
      toast.success('Bounty publicado · Válido por 5 turnos');
      setTargetId(''); setReward('');
      await load();
      onChange?.();
    } catch (e) { toast.error(e.message); }
    finally { setSubmitting(false); }
  };

  const cancel = async (id) => {
    if (!confirm('¿Cancelar bounty? Recuperás el 50% del reward.')) return;
    try {
      await api('bounty/' + id, { method: 'DELETE' });
      toast.success('Bounty cancelado · 50% devuelto');
      await load();
      onChange?.();
    } catch (e) { toast.error(e.message); }
  };

  if (loading) {
    return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-amber-400" /></div>;
  }

  // Agrupar bounties por target
  const byTarget = {};
  for (const b of bounties) {
    if (!byTarget[b.target_id]) byTarget[b.target_id] = { username: b.target_username, total: 0, count: 0 };
    byTarget[b.target_id].total += Number(b.reward_cash);
    byTarget[b.target_id].count += 1;
  }
  const targets = Object.entries(byTarget).sort((a, b) => b[1].total - a[1].total);

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="bg-gradient-to-r from-amber-950/60 to-black border border-amber-800/50 rounded-xl p-3 flex items-center gap-3">
        <span className="text-3xl shrink-0">🏴‍☠️</span>
        <div className="flex-1">
          <div className="font-black text-amber-300 uppercase tracking-widest text-sm">Bounty Board</div>
          <div className="text-[10px] font-mono text-amber-600 mt-0.5">Ponele precio a la cabeza de alguien · ×2 si cae en Chapter 11</div>
        </div>
        <div className="text-right shrink-0">
          <div className="text-[9px] font-mono text-zinc-500">Disponible</div>
          <div className="text-xs font-mono font-bold text-amber-400">{fmt(liquidCash)}</div>
        </div>
      </div>

      {/* Wanted board — quiénes tienen bounties */}
      {targets.length > 0 && (
        <Card className="bg-zinc-950 border-amber-800/30">
          <CardHeader className="py-2 px-3">
            <CardTitle className="text-amber-400 font-mono uppercase text-xs flex items-center gap-1.5">
              <Target className="h-3.5 w-3.5" /> Se Busca
            </CardTitle>
            <CardDescription className="text-zinc-500 text-[10px]">Objetivos activos · recompensa total</CardDescription>
          </CardHeader>
          <CardContent className="px-3 pb-3 space-y-2">
            {targets.map(([tid, info]) => {
              const isMe = tid === player.id;
              return (
                <motion.div
                  key={tid}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className={`flex items-center gap-3 p-2.5 rounded-lg border ${
                    isMe ? 'border-red-500/60 bg-red-950/30' : 'border-amber-800/30 bg-amber-950/10'
                  }`}
                >
                  <div className="text-2xl shrink-0">{isMe ? '😱' : '🎯'}</div>
                  <div className="flex-1 min-w-0">
                    <div className={`font-bold text-sm ${isMe ? 'text-red-300' : 'text-amber-200'}`}>
                      {info.username} {isMe && <span className="text-[9px] font-mono text-red-400 uppercase">(¡Vos!)</span>}
                    </div>
                    <div className="text-[9px] font-mono text-zinc-500">{info.count} contrato{info.count > 1 ? 's' : ''} activo{info.count > 1 ? 's' : ''}</div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="font-black text-lg text-amber-400 font-mono">{fmt(info.total)}</div>
                    <div className="text-[8px] font-mono text-amber-600 uppercase">Total en juego</div>
                  </div>
                </motion.div>
              );
            })}
          </CardContent>
        </Card>
      )}

      {/* Formulario nuevo bounty */}
      <Card className="bg-zinc-950 border-zinc-900">
        <CardHeader className="py-2 px-3">
          <CardTitle className="text-amber-400 font-mono uppercase text-xs flex items-center gap-1.5">
            <Skull className="h-3.5 w-3.5" /> Publicar Bounty
          </CardTitle>
          <CardDescription className="text-zinc-500 text-[10px]">
            El dinero queda en escrow · Si el objetivo cae en C11, cobrás ×2 · Válido 5 turnos
          </CardDescription>
        </CardHeader>
        <CardContent className="px-3 pb-3 space-y-3">
          <div>
            <Label className="text-zinc-400 font-mono text-[9px] uppercase">Objetivo</Label>
            <Select value={targetId} onValueChange={setTargetId}>
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

          <div>
            <Label className="text-zinc-400 font-mono text-[9px] uppercase">Recompensa ($)</Label>
            <Input
              type="number"
              min={200}
              max={liquidCash}
              value={reward}
              onChange={e => setReward(e.target.value)}
              className="bg-black border-zinc-800 text-white font-mono h-9 text-sm"
              placeholder="Mínimo $200"
            />
          </div>

          {rewardNum >= 200 && (
            <div className="bg-black border border-zinc-800 rounded p-2 text-[10px] font-mono space-y-1">
              <div className="flex justify-between">
                <span className="text-zinc-500">Tu apuesta:</span>
                <span className="text-amber-300">{fmt(rewardNum)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-500">Si el objetivo cae en C11:</span>
                <span className="text-lime-400 font-bold">+{fmt(rewardNum)} (×2)</span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-500">Si cancelo (50% penalidad):</span>
                <span className="text-red-400">-{fmt(rewardNum * 0.5)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-500">Expira en:</span>
                <span className="text-zinc-400">5 turnos</span>
              </div>
            </div>
          )}

          <Button
            onClick={submit}
            disabled={submitting || !rewardValid || !targetId}
            className="w-full bg-amber-600 hover:bg-amber-500 text-black font-bold uppercase tracking-wider text-xs h-9"
          >
            {submitting
              ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
              : '🏴‍☠️ Publicar Bounty'}
          </Button>
        </CardContent>
      </Card>

      {/* Mis contratos activos */}
      {mine.length > 0 && (
        <Card className="bg-zinc-950 border-zinc-900">
          <CardHeader className="py-2 px-3">
            <CardTitle className="text-zinc-400 font-mono uppercase text-xs">Mis Contratos</CardTitle>
          </CardHeader>
          <CardContent className="px-3 pb-3">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-zinc-800 hover:bg-transparent">
                    {['Objetivo','Reward','Vence en','Estado',''].map(h => (
                      <TableHead key={h} className="text-zinc-500 font-mono uppercase text-[9px] px-2 py-1">{h}</TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <AnimatePresence>
                    {mine.map((b) => {
                      const turnsLeft = b.turns_to_expire - (b.current_turn - b.placed_at_turn);
                      return (
                        <TableRow key={b.id} className="border-zinc-900 hover:bg-zinc-900/30">
                          <TableCell className="px-2 py-2 font-bold text-xs text-amber-200">{b.target_username}</TableCell>
                          <TableCell className="px-2 py-2 font-mono text-xs text-amber-400 font-bold">{fmt(b.reward_cash)}</TableCell>
                          <TableCell className="px-2 py-2">
                            <span className={`text-[9px] font-mono ${turnsLeft <= 1 ? 'text-red-400' : 'text-zinc-400'}`}>
                              T-{Math.max(0, turnsLeft)}
                            </span>
                          </TableCell>
                          <TableCell className="px-2 py-2">
                            <Badge className={`text-[8px] border-0 font-mono ${
                              b.status === 'ACTIVE' ? 'bg-amber-500/20 text-amber-300' :
                              b.status === 'CLAIMED' ? 'bg-lime-500/20 text-lime-300' :
                              'bg-zinc-700 text-zinc-400'
                            }`}>{b.status}</Badge>
                          </TableCell>
                          <TableCell className="px-2 py-2">
                            {b.status === 'ACTIVE' && (
                              <button
                                onClick={() => cancel(b.id)}
                                className="text-zinc-600 hover:text-red-400 transition-colors"
                                title="Cancelar (50% devuelto)"
                              >
                                <X className="h-3.5 w-3.5" />
                              </button>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </AnimatePresence>
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
