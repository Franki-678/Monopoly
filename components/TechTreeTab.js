'use client';
import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Lock, Unlock, Crown, GitBranch, Zap, ShieldCheck, TrendingUp, Truck, User, EyeOff, Clock, X } from 'lucide-react';
import { toast } from 'sonner';

const api = async (path, opts = {}) => {
  const res = await fetch('/api/' + path, { headers: { 'Content-Type': 'application/json' }, ...opts });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Error');
  return data;
};

const BRANCH_META = {
  FINANCIERA: {
    label: 'Ingeniería Financiera', Icon: TrendingUp,
    accent: 'cyan', accentBg: 'bg-cyan-500/10', accentBorder: 'border-cyan-500/30',
    accentText: 'text-cyan-400', stripe: 'bg-cyan-400',
  },
  URBANO: {
    label: 'Desarrollo Urbano', Icon: ShieldCheck,
    accent: 'lime', accentBg: 'bg-lime-500/10', accentBorder: 'border-lime-500/30',
    accentText: 'text-lime-400', stripe: 'bg-lime-400',
  },
  LOGISTICA: {
    label: 'Logística', Icon: Truck,
    accent: 'orange', accentBg: 'bg-orange-500/10', accentBorder: 'border-orange-500/30',
    accentText: 'text-orange-400', stripe: 'bg-orange-400',
  },
  PERSONAL: {
    label: 'Rama Personal', Icon: User,
    accent: 'purple', accentBg: 'bg-purple-500/10', accentBorder: 'border-purple-500/30',
    accentText: 'text-purple-400', stripe: 'bg-purple-400',
  },
};

const ROLE_BRANCH_PREFIX = {
  DATA_SCIENTIST:   'ds',
  ECONOMIST:        'ec',
  PSYCHOLOGIST:     'ps',
  SYSTEMS_ENGINEER: 'se',
  MECH_ENGINEER:    'me',
};

const ROLE_LABELS = {
  DATA_SCIENTIST:   'Data Scientist',
  ECONOMIST:        'Economista',
  PSYCHOLOGIST:     'Psicólogo/a',
  SYSTEMS_ENGINEER: 'Ing. Sistemas',
  MECH_ENGINEER:    'Ing. Mecánico/a',
};

const FOG_TEXT = '[DATOS ENCRIPTADOS — DESBLOQUEA PARA REVELAR]';

export default function TechTreeTab({ player, ic, onChange }) {
  const [tree,    setTree]    = useState(null);
  const [loading, setLoading] = useState(false);
  const [branch,  setBranch]  = useState('FINANCIERA');

  const load = async () => {
    try {
      const data = await api('tech/tree/' + player.id);
      setTree(data);
    } catch (e) { toast.error(e.message); }
  };
  useEffect(() => { load(); }, [player.id]);

  const queue = async (nodeId) => {
    if (!confirm('¿Encolar este nodo? El IC se reserva ahora y se resuelve a medianoche.')) return;
    setLoading(true);
    try {
      const res = await api('tech/unlock', { method: 'POST', body: JSON.stringify({ player_id: player.id, node_id: nodeId }) });
      toast.success(res.status === 'QUEUED' ? '⏳ Encolado — se resuelve a medianoche' : res.status === 'PATENT' ? '🔐 Patente adquirida' : '🌐 Open Source desbloqueado');
      await load();
      onChange?.();
    } catch (e) { toast.error(e.message); } finally { setLoading(false); }
  };

  const cancelQueue = async (orderId) => {
    if (!confirm('¿Cancelar y recuperar el IC?')) return;
    setLoading(true);
    try {
      await api('tech/orders/' + orderId, { method: 'DELETE', body: JSON.stringify({ player_id: player.id }) });
      toast.success('✅ Orden cancelada — IC reembolsado');
      await load();
      onChange?.();
    } catch (e) { toast.error(e.message); } finally { setLoading(false); }
  };

  if (!tree) return <div className="text-zinc-500 text-sm py-8 text-center">Cargando árbol tecnológico...</div>;

  const myRole = player.player_role || 'DATA_SCIENTIST';
  const personalPrefix = ROLE_BRANCH_PREFIX[myRole] || 'ds';

  const allBranches = ['FINANCIERA', 'URBANO', 'LOGISTICA', 'PERSONAL'];

  return (
    <div className="space-y-3">
      {/* IC Header */}
      <div className="flex items-center justify-between flex-wrap gap-2 bg-zinc-950 border border-zinc-900 rounded-xl px-3 py-2">
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2 px-3 py-1.5 bg-orange-500/10 border border-orange-500/30 rounded-full">
            <Zap className="h-4 w-4 text-orange-400" />
            <span className="font-mono text-sm font-bold text-orange-400">{Math.floor(ic).toLocaleString('es-AR')} IC</span>
          </div>
          <div className="text-xs font-mono uppercase text-zinc-500">Capital Intelectual disponible</div>
        </div>
        <div className="text-[10px] font-mono text-zinc-600">Patente exclusiva por 10 turnos · luego Open Source 25%</div>
      </div>

      {/* Branch Tabs */}
      <div className="flex gap-1.5 flex-wrap">
        {allBranches.map(b => {
          const meta = BRANCH_META[b];
          const label = b === 'PERSONAL' ? `${ROLE_LABELS[myRole] || 'Personal'}` : meta.label;
          const isActive = branch === b;
          return (
            <button
              key={b}
              onClick={() => setBranch(b)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-[10px] font-mono uppercase font-bold transition-all ${
                isActive
                  ? `${meta.accentBg} ${meta.accentBorder} ${meta.accentText}`
                  : 'border-zinc-800 text-zinc-500 hover:text-zinc-300'
              }`}
            >
              <meta.Icon className="h-3 w-3" />
              {b === 'PERSONAL' ? '🔒 ' + label : label}
            </button>
          );
        })}
      </div>

      {/* Branch content */}
      <BranchPanel
        branch={branch}
        tree={tree}
        meta={BRANCH_META[branch]}
        ic={ic}
        onUnlock={queue}
        onCancel={cancelQueue}
        loading={loading}
        myRole={myRole}
        personalPrefix={personalPrefix}
      />
    </div>
  );
}

function BranchPanel({ branch, tree, meta, ic, onUnlock, onCancel, loading, myRole, personalPrefix }) {
  let nodes;

  if (branch === 'PERSONAL') {
    // Show only nodes for this player's role (prefix match)
    nodes = tree.nodes
      .filter(n => n.branch === 'PERSONAL' && n.id.startsWith(personalPrefix + '-'))
      .sort((a, b) => a.tier - b.tier);
  } else {
    nodes = tree.nodes.filter(n => n.branch === branch).sort((a, b) => a.tier - b.tier);
  }

  return (
    <Card className={`bg-zinc-950/80 backdrop-blur ${meta.accentBorder}`}>
      <CardHeader className="py-2 px-3">
        <CardTitle className={`${meta.accentText} font-mono uppercase text-sm flex items-center gap-2`}>
          <meta.Icon className="h-4 w-4" />
          {branch === 'PERSONAL' ? `Rama Personal — ${ROLE_LABELS[myRole] || myRole}` : meta.label}
        </CardTitle>
        <CardDescription className="text-zinc-500 text-xs">
          {branch === 'PERSONAL'
            ? '10 nodos exclusivos · Patente permanente · Nunca expira'
            : `${nodes.length} nodos · T1-T5 accesibles · T6+ requieren inversión masiva`}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2 pb-3">
        {nodes.map((n, i) => (
          <NodeCard
            key={n.id}
            node={n}
            branchMeta={meta}
            ic={ic}
            onUnlock={() => onUnlock(n.id)}
            onCancel={n.queued_order_id ? () => onCancel(n.queued_order_id) : null}
            loading={loading}
            isLast={i === nodes.length - 1}
            isPersonal={branch === 'PERSONAL'}
          />
        ))}
        {nodes.length === 0 && (
          <p className="text-zinc-600 text-xs italic text-center py-4">Sin nodos disponibles.</p>
        )}
      </CardContent>
    </Card>
  );
}

function NodeCard({ node, branchMeta, ic, onUnlock, onCancel, loading, isLast, isPersonal }) {
  const canAfford = ic >= node.effective_cost;
  const isMine     = node.status === 'PATENT' || node.status === 'OPEN_SOURCE';
  const isLocked   = node.status === 'LOCKED';
  const isQueued   = node.status === 'QUEUED';
  const blockedByOther = node.status === 'PATENTED_BY_OTHER';
  const isAvailable = node.status === 'AVAILABLE' || node.status === 'AVAILABLE_OS';

  // Fog of war: tier >= 6 AND not already mine
  const isFog = node.tier >= 6 && !isMine;

  const statusBadge = {
    PATENT:            { label: isPersonal ? '🔐 Tu Patente ∞' : 'Tu Patente',  cls: 'bg-orange-500/30 text-orange-200', Icon: Crown    },
    OPEN_SOURCE:       { label: 'Open Source',                                   cls: 'bg-cyan-500/30 text-cyan-200',     Icon: GitBranch },
    LOCKED:            { label: 'Bloqueado',                                     cls: 'bg-zinc-800 text-zinc-500',        Icon: Lock      },
    QUEUED:            { label: '⏳ Encolado',                                   cls: 'bg-yellow-500/25 text-yellow-200', Icon: Clock     },
    PATENTED_BY_OTHER: { label: 'Patente ajena',                                 cls: 'bg-red-500/20 text-red-300',       Icon: Lock      },
    AVAILABLE:         { label: 'Disponible',                                    cls: 'bg-lime-500/20 text-lime-300',     Icon: Unlock    },
    AVAILABLE_OS:      { label: 'Open Source 25%',                               cls: 'bg-cyan-500/20 text-cyan-300',     Icon: GitBranch },
  }[node.status];
  const SBI = statusBadge?.Icon || Lock;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className={`relative bg-zinc-900/40 border rounded-lg p-3 ${
        isMine ? branchMeta.accentBorder + ' ' + branchMeta.accentBg
               : isQueued ? 'border-yellow-500/40 bg-yellow-500/5'
               : isLocked || blockedByOther ? 'border-zinc-800 opacity-60'
               : 'border-zinc-800'
      }`}
    >
      {/* Left stripe */}
      <div className={`absolute left-0 top-0 bottom-0 w-1 rounded-l-lg ${
        isMine ? branchMeta.stripe : isLocked || blockedByOther ? 'bg-zinc-700' : 'bg-zinc-600'
      }`} />
      <div className="pl-2">
        <div className="flex items-center justify-between gap-2 flex-wrap mb-1">
          <div className="flex items-center gap-2">
            <Badge className={`bg-zinc-800 text-zinc-400 border-0 text-[9px] font-mono px-1.5 py-0`}>T{node.tier}</Badge>
            <span className="font-bold text-sm text-white">{node.name}</span>
            {isFog && <EyeOff className="h-3 w-3 text-zinc-600" />}
          </div>
          {statusBadge && (
            <Badge className={`${statusBadge.cls} border-0 font-mono text-[9px] px-1.5 py-0`}>
              <SBI className="h-2.5 w-2.5 mr-1" /> {statusBadge.label}
            </Badge>
          )}
        </div>

        {/* Description — fog of war for tier ≥ 6 */}
        <div className={`text-[11px] mb-2 leading-snug ${isFog ? 'text-zinc-600 italic' : 'text-zinc-400'}`}>
          {isFog ? FOG_TEXT : node.description}
        </div>

        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2 text-[11px] font-mono">
            {!isMine && (
              <span className="text-orange-400 font-bold">{node.effective_cost.toLocaleString('es-AR')} IC</span>
            )}
            {node.status === 'AVAILABLE_OS' && (
              <span className="text-zinc-500 line-through">{node.base_cost.toLocaleString('es-AR')}</span>
            )}
            {node.status === 'PATENT' && !isPersonal && node.turns_to_open_source != null && (
              <span className="text-orange-300/80">Open Source en {node.turns_to_open_source} t.</span>
            )}
            {node.status === 'PATENTED_BY_OTHER' && node.turns_to_open_source != null && (
              <>
                {node.patent_holders?.map((h, i) => (
                  <span key={i} className={`text-[9px] px-1.5 py-0.5 rounded-full border ${h.role === 'SYSTEMS_ENGINEER' ? 'border-yellow-500/40 text-yellow-300 bg-yellow-500/10' : 'border-red-500/40 text-red-300 bg-red-500/10'}`}>
                    {h.role === 'SYSTEMS_ENGINEER' ? '⚙️ ' : '🔐 '}{h.name}
                  </span>
                ))}
                <span className="text-red-300/80">Open en {node.turns_to_open_source} t.</span>
              </>
            )}
            {node.status === 'PATENT' && !isPersonal && node.patent_holders?.length > 0 && (
              node.patent_holders.map((h, i) => (
                <span key={i} className="text-[9px] px-1.5 py-0.5 rounded-full border border-orange-500/30 text-orange-300 bg-orange-500/10">
                  🔐 {h.name}
                </span>
              ))
            )}
            {!isFog && node.effect_label && node.effect_label !== '???' && (
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full border ${branchMeta.accentBorder} ${branchMeta.accentText} opacity-70`}>
                {node.effect_label}
              </span>
            )}
            {node.global_holders > 0 && (
              <span className="text-zinc-500">· {node.global_holders} holder{node.global_holders > 1 ? 's' : ''}</span>
            )}
          </div>
          {isAvailable && (
            <Button
              size="sm"
              onClick={onUnlock}
              disabled={loading || !canAfford}
              className={`h-7 text-[11px] px-3 font-bold uppercase ${canAfford ? 'bg-opacity-90 hover:opacity-90 text-black ' + branchMeta.stripe : 'bg-zinc-800 text-zinc-500'}`}
            >
              {canAfford ? 'Encolar' : 'Sin IC'}
            </Button>
          )}
          {isQueued && onCancel && (
            <button
              onClick={onCancel}
              disabled={loading}
              className="flex items-center gap-1 h-7 px-2 rounded border border-yellow-500/40 text-yellow-300 text-[10px] font-mono hover:bg-yellow-500/10 transition-colors"
              title="Cancelar y recuperar IC"
            >
              <X className="h-3 w-3" /> Cancelar
            </button>
          )}
          {isQueued && (
            <span className="text-[10px] text-yellow-400/80 italic font-mono">⏳ Resolución a medianoche</span>
          )}
          {blockedByOther && (
            <span className="text-[10px] text-red-400/80 italic">Esperá Open Source</span>
          )}
        </div>

        {/* Connector line */}
        {!isLast && (
          <div className="absolute -bottom-2 left-1/2 w-px h-2 bg-zinc-700" />
        )}
      </div>
    </motion.div>
  );
}
