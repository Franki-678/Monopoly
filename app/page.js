'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toast } from 'sonner';
import {
  Loader2, LogOut, Zap, TrendingUp, TrendingDown, Wallet, Building2, Crown,
  ShoppingCart, History, Flame, Skull, ShieldAlert, Dices,
  Home, BarChart2, Target, Users, FlaskConical, AlertTriangle,
  ChevronDown, ChevronRight, Settings, KeyRound, ShieldCheck,
} from 'lucide-react';
import LiveBoard from '@/components/LiveBoard';
import DiceModal from '@/components/DiceModal';
import ActionReceipt from '@/components/ActionReceipt';
import FlashOverlay from '@/components/FlashOverlay';
import AlliancesTab from '@/components/AlliancesTab';
import TechTreeTab from '@/components/TechTreeTab';
import NissaiPanel from '@/components/NissaiPanel';
import CasinoTab from '@/components/CasinoTab';
import BountyBoard from '@/components/BountyBoard';
import SurvivalGuide from '@/components/SurvivalGuide';
import CorpDetailModal, { corpScore } from '@/components/CorpDetailModal';

// ── Utilidades ────────────────────────────────────────────────────────────────
const fmt    = (n) => { if (n === null || n === undefined || isNaN(n)) return '$0'; const num = Number(n); const sign = num < 0 ? '-' : ''; return sign + '$' + Math.abs(num).toLocaleString('es-AR', { maximumFractionDigits: 0 }); };
const fmtDec = (n) => { if (n === null || n === undefined || isNaN(n)) return '$0'; return '$' + Number(n).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); };

const api = async (path, opts = {}) => {
  const res  = await fetch('/api/' + path, { headers: { 'Content-Type': 'application/json' }, ...opts });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Error');
  return data;
};

const SQUARE_LABELS = {
  5:  { label: '⚠️ Prendas',       cls: 'text-amber-400'  },
  10: { label: '🛋️ Psicólogo',     cls: 'text-pink-400'   },
  15: { label: '⚠️ Prendas',       cls: 'text-amber-400'  },
  20: { label: '🏛️ El Estado',     cls: 'text-green-400'  },
  25: { label: '⚠️ Prendas',       cls: 'text-amber-400'  },
  30: { label: '🥷 Mercado Negro',  cls: 'text-purple-400' },
};

// Level thresholds (sync with gameLogic.js)
const LEVEL_THRESHOLDS = [0, 500, 1500, 3000, 6000, 12000, 25000, 50000, 100000, 200000];
function computeLevel(totalIcSpent) {
  let level = 1;
  for (let i = 1; i < LEVEL_THRESHOLDS.length; i++) {
    if (totalIcSpent >= LEVEL_THRESHOLDS[i]) level = i + 1;
    else break;
  }
  return level;
}
function levelProgress(totalIcSpent) {
  const level = computeLevel(totalIcSpent);
  if (level >= LEVEL_THRESHOLDS.length) return { level, pct: 100, next: null };
  const from = LEVEL_THRESHOLDS[level - 1];
  const to   = LEVEL_THRESHOLDS[level];
  const pct  = Math.min(100, Math.round(((totalIcSpent - from) / (to - from)) * 100));
  return { level, pct, next: to - totalIcSpent };
}

const ROLE_LABELS = {
  DATA_SCIENTIST:   { label: 'Data Scientist',  color: '#a3e635' },
  ECONOMIST:        { label: 'Economista',       color: '#22d3ee' },
  PSYCHOLOGIST:     { label: 'Psicólogo/a',      color: '#ec4899' },
  SYSTEMS_ENGINEER: { label: 'Ing. Sistemas',    color: '#eab308' },
  MECH_ENGINEER:    { label: 'Ing. Mecánico/a',  color: '#8b5cf6' },
};

// ── App root ──────────────────────────────────────────────────────────────────
function App() {
  const [player,          setPlayer]          = useState(null);
  const [mustChangePin,   setMustChangePin]   = useState(false);
  const [initLoading,     setInitLoading]     = useState(true);
  const [dashboard,       setDashboard]       = useState(null);
  const [market,          setMarket]          = useState([]);
  const [players,         setPlayers]         = useState([]);
  const [state,           setState]           = useState({ current_turn: 1, locked: false });
  const [loading,         setLoading]         = useState(false);
  const [showDice,        setShowDice]        = useState(false);
  const [flash,           setFlash]           = useState(null);
  const [projectedSquare, setProjectedSquare] = useState(null);
  const [clickedSquare,   setClickedSquare]   = useState(null);
  const prevTurnRef = useRef(null);

  useEffect(() => {
    (async () => {
      try { await api('init', { method: 'POST' }); } catch (e) { console.error('Init', e); }
      const saved = typeof window !== 'undefined' ? localStorage.getItem('d77_player') : null;
      if (saved) {
        const p = JSON.parse(saved);
        if (p.must_change_pin) { setPlayer(p); setMustChangePin(true); }
        else setPlayer(p);
      }
      setInitLoading(false);
    })();
  }, []);

  const loadAll = useCallback(async (pid) => {
    if (!pid) return;
    try {
      const [dash, mkt, pls, st] = await Promise.all([
        api('dashboard/' + pid), api('market'), api('players'), api('game/state'),
      ]);
      if (prevTurnRef.current !== null && dash.turn > prevTurnRef.current) {
        const net = (dash.audit || []).reduce((s, t) => s + Number(t.amount), 0);
        if (Math.abs(net) > 10) {
          setFlash({ type: net >= 0 ? 'positive' : 'negative', label: (net >= 0 ? '+$' : '-$') + Math.abs(Math.round(net)).toLocaleString('es-AR') });
        }
      }
      prevTurnRef.current = dash.turn;
      setDashboard(dash);
      setMarket(mkt.market);
      setPlayers(pls.players);
      setState(st);
      const diceRes = await api('dice/status/' + pid);
      if (!diceRes.roll) setShowDice(true);
    } catch (e) { toast.error('Error al cargar: ' + e.message); }
  }, []);

  useEffect(() => {
    if (player) loadAll(player.id);
    const interval = player ? setInterval(() => loadAll(player.id), 15000) : null;
    return () => { if (interval) clearInterval(interval); };
  }, [player, loadAll]);

  const handleRollComplete = useCallback(({ landing }) => { setProjectedSquare(landing); }, []);
  const handleDiceClose    = useCallback(() => { setShowDice(false); }, []);
  const logout = useCallback(() => {
    localStorage.removeItem('d77_player');
    setPlayer(null); setMustChangePin(false); setDashboard(null);
    setProjectedSquare(null); setClickedSquare(null);
    prevTurnRef.current = null;
  }, []);

  // Find clicked corp from market data
  const clickedCorp = clickedSquare !== null
    ? market.find(c => Number(c.board_position) === clickedSquare) || null
    : null;

  if (initLoading) {
    return (
      <LiveBoard>
        <div className="h-full flex items-center justify-center bg-black/60">
          <Loader2 className="h-8 w-8 animate-spin text-lime-400" />
        </div>
      </LiveBoard>
    );
  }

  if (!player) {
    return (
      <LiveBoard>
        <LoginScreen onLogin={(p, needsPin) => {
          const stored = { ...p, must_change_pin: needsPin };
          localStorage.setItem('d77_player', JSON.stringify(stored));
          setPlayer(stored);
          setMustChangePin(!!needsPin);
          prevTurnRef.current = null;
        }} />
      </LiveBoard>
    );
  }

  if (mustChangePin) {
    return (
      <LiveBoard>
        <ChangePinScreen
          player={player}
          onSuccess={() => {
            const updated = { ...player, must_change_pin: false };
            localStorage.setItem('d77_player', JSON.stringify(updated));
            setPlayer(updated);
            setMustChangePin(false);
          }}
          onLogout={logout}
        />
      </LiveBoard>
    );
  }

  return (
    <LiveBoard players={players} market={market} projectedSquare={projectedSquare} onCellClick={setClickedSquare}>
      <FlashOverlay flash={flash} onDone={() => setFlash(null)} />

      {showDice && dashboard && (
        <DiceModal
          playerId={player.id}
          turn={dashboard.turn}
          playerPosition={dashboard.player?.board_position ?? 0}
          onRollComplete={handleRollComplete}
          onClose={handleDiceClose}
        />
      )}

      <Dashboard
        player={player}
        dashboard={dashboard}
        market={market}
        players={players}
        state={state}
        loading={loading}
        setLoading={setLoading}
        projectedSquare={projectedSquare}
        onOpenDice={() => setShowDice(true)}
        refresh={() => loadAll(player.id)}
        logout={logout}
        clickedCorp={clickedCorp}
        onCloseCorp={() => setClickedSquare(null)}
      />
      <SurvivalGuide />
    </LiveBoard>
  );
}

// ── Login ─────────────────────────────────────────────────────────────────────
function LoginScreen({ onLogin }) {
  const [username, setUsername] = useState('');
  const [pin,      setPin]      = useState('');
  const [loading,  setLoading]  = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await api('auth/login', { method: 'POST', body: JSON.stringify({ username, pin }) });
      const needsPin = !!res.must_change_pin;
      toast.success(needsPin ? `Bienvenido ${res.player.username} — cambiá tu PIN` : `Bienvenido ${res.player.username}`);
      onLogin(res.player, needsPin);
    } catch (e) { toast.error(e.message); } finally { setLoading(false); }
  };

  return (
    <div className="h-full overflow-y-auto flex items-center justify-center px-4 py-6">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1 border border-lime-400/40 bg-lime-400/10 rounded-full mb-3">
            <div className="w-2 h-2 bg-lime-400 rounded-full animate-pulse" />
            <span className="text-[10px] font-mono uppercase tracking-widest text-lime-300">Live Server · 6 Players</span>
          </div>
          <h1 className="text-5xl font-black tracking-tighter text-white leading-none">DISTRITO<span className="text-lime-400">77</span></h1>
          <p className="text-zinc-500 font-mono text-[10px] uppercase tracking-widest mt-1">Persistent Browser Game · WEGO System</p>
        </div>
        <Card className="bg-zinc-950/90 backdrop-blur border-zinc-800">
          <CardHeader className="pb-3">
            <CardTitle className="text-lime-400 font-mono uppercase tracking-wider text-sm">// Acceso</CardTitle>
            <CardDescription className="text-zinc-500 text-xs">Usuario y PIN de 4 dígitos</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={submit} className="space-y-3">
              <div>
                <Label className="text-zinc-400 font-mono text-[10px] uppercase">Alias</Label>
                <Input className="bg-black border-zinc-800 text-white font-mono uppercase tracking-wider focus-visible:ring-lime-400" value={username} onChange={e => setUsername(e.target.value.toUpperCase())} placeholder="FRANCO" required />
              </div>
              <div>
                <Label className="text-zinc-400 font-mono text-[10px] uppercase">PIN</Label>
                <Input className="bg-black border-zinc-800 text-white font-mono tracking-[0.5em] text-center focus-visible:ring-lime-400" type="password" inputMode="numeric" maxLength={4} value={pin} onChange={e => setPin(e.target.value.replace(/\D/g, ''))} placeholder="••••" required />
              </div>
              <Button type="submit" disabled={loading} className="w-full bg-lime-400 hover:bg-lime-300 text-black font-bold uppercase tracking-wider">
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Conectar'}
              </Button>
            </form>
            <div className="mt-4 pt-3 border-t border-zinc-800">
              <p className="text-[9px] font-mono uppercase text-zinc-600 mb-1.5">// Roster</p>
              <div className="flex flex-wrap gap-x-2 gap-y-1 text-[9px] font-mono text-zinc-500">
                {['FRANCO','RETA','CECE','TOBE','BEEN','MANU'].map(u => (
                  <button key={u} type="button" className="hover:text-lime-400 transition-colors" onClick={() => { setUsername(u); setPin('0000'); }}>{u}</button>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ── Change PIN Screen ─────────────────────────────────────────────────────────
function ChangePinScreen({ player, onSuccess, onLogout }) {
  const [currentPin, setCurrentPin] = useState('');
  const [newPin,     setNewPin]     = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [loading,    setLoading]    = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (newPin.length !== 4) return toast.error('El nuevo PIN debe tener exactamente 4 dígitos');
    if (newPin !== confirmPin) return toast.error('Los PINs no coinciden');
    if (newPin === currentPin) return toast.error('El nuevo PIN debe ser diferente al actual');
    setLoading(true);
    try {
      await api('auth/change-pin', {
        method: 'POST',
        body: JSON.stringify({ player_id: player.id, current_pin: currentPin, new_pin: newPin }),
      });
      toast.success('PIN actualizado. ¡Bienvenido al Distrito!');
      onSuccess();
    } catch (e) { toast.error(e.message); } finally { setLoading(false); }
  };

  return (
    <div className="h-full overflow-y-auto flex items-center justify-center px-4 py-6">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1 border border-orange-400/40 bg-orange-400/10 rounded-full mb-3">
            <KeyRound className="h-3 w-3 text-orange-400" />
            <span className="text-[10px] font-mono uppercase tracking-widest text-orange-300">Seguridad obligatoria</span>
          </div>
          <h2 className="text-4xl font-black tracking-tighter text-white leading-none">NUEVO <span className="text-orange-400">PIN</span></h2>
          <p className="text-zinc-500 font-mono text-[10px] uppercase tracking-widest mt-1">Cambiá tu PIN antes de continuar</p>
        </div>

        <Card className="bg-zinc-950/90 backdrop-blur border-orange-500/30">
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2 mb-1">
              <div className="w-8 h-8 rounded-full flex items-center justify-center font-black text-black text-sm shrink-0" style={{ backgroundColor: player.avatar_color || '#a3e635' }}>
                {(player.username || '?')[0]}
              </div>
              <div>
                <div className="text-white font-bold text-sm">{player.username}</div>
                <div className="text-zinc-500 text-[10px] font-mono uppercase">Primera vez en el sistema</div>
              </div>
            </div>
            <div className="flex items-start gap-2 bg-orange-950/40 border border-orange-500/30 rounded-lg p-2.5 mt-1">
              <ShieldCheck className="h-3.5 w-3.5 text-orange-400 shrink-0 mt-0.5" />
              <p className="text-[10px] text-orange-300/90 leading-relaxed">
                Tu PIN temporal es <span className="font-black text-orange-200 tracking-widest">0000</span>. Por seguridad, tenés que cambiarlo ahora. Este PIN es personal — no lo compartas.
              </p>
            </div>
          </CardHeader>
          <CardContent>
            <form onSubmit={submit} className="space-y-3">
              <div>
                <Label className="text-zinc-400 font-mono text-[10px] uppercase">PIN temporal (0000)</Label>
                <Input
                  className="bg-black border-zinc-800 text-white font-mono tracking-[0.5em] text-center focus-visible:ring-orange-400"
                  type="password"
                  inputMode="numeric"
                  maxLength={4}
                  value={currentPin}
                  onChange={e => setCurrentPin(e.target.value.replace(/\D/g, ''))}
                  placeholder="••••"
                  required
                />
              </div>
              <div>
                <Label className="text-zinc-400 font-mono text-[10px] uppercase">Nuevo PIN (4 dígitos)</Label>
                <Input
                  className="bg-black border-zinc-800 text-white font-mono tracking-[0.5em] text-center focus-visible:ring-orange-400"
                  type="password"
                  inputMode="numeric"
                  maxLength={4}
                  value={newPin}
                  onChange={e => setNewPin(e.target.value.replace(/\D/g, ''))}
                  placeholder="••••"
                  required
                />
              </div>
              <div>
                <Label className="text-zinc-400 font-mono text-[10px] uppercase">Confirmá el nuevo PIN</Label>
                <Input
                  className={`bg-black border-zinc-800 text-white font-mono tracking-[0.5em] text-center focus-visible:ring-orange-400 ${confirmPin && confirmPin !== newPin ? 'border-red-500/60' : confirmPin && confirmPin === newPin ? 'border-lime-500/60' : ''}`}
                  type="password"
                  inputMode="numeric"
                  maxLength={4}
                  value={confirmPin}
                  onChange={e => setConfirmPin(e.target.value.replace(/\D/g, ''))}
                  placeholder="••••"
                  required
                />
              </div>
              <Button
                type="submit"
                disabled={loading || newPin.length !== 4 || newPin !== confirmPin}
                className="w-full bg-orange-400 hover:bg-orange-300 text-black font-bold uppercase tracking-wider h-11"
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <><KeyRound className="h-4 w-4 mr-2" />Establecer PIN y Entrar</>}
              </Button>
            </form>
            <button onClick={onLogout} className="w-full mt-3 text-[9px] font-mono uppercase text-zinc-600 hover:text-zinc-400 transition-colors">
              Volver al login
            </button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ── Dashboard ─────────────────────────────────────────────────────────────────
function Dashboard({ player, dashboard, market, players, state, refresh, logout, loading, setLoading, onOpenDice, projectedSquare, clickedCorp, onCloseCorp }) {
  const [section,    setSection]    = useState('inicio');
  const [mercadoTab, setMercadoTab] = useState('market');
  const [arenaTab,   setArenaTab]   = useState('nissai');

  if (!dashboard) {
    return <div className="h-full flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-lime-400" /></div>;
  }

  const { player: pData, turn, netWorth, portfolio, audit, pendingOrders, auditTurn, lastGlobalEvent } = dashboard;

  const resolveTurn = async () => {
    if (!confirm(`¿Resolver turno ${turn}? Esto es irreversible.`)) return;
    setLoading(true);
    try {
      const res = await api('admin/resolve-turn', { method: 'POST', body: JSON.stringify({ admin_id: player.id }) });
      toast.success(`Turno ${turn} resuelto.`);
      await refresh();
    } catch (e) { toast.error(e.message); } finally { setLoading(false); }
  };

  return (
    <div className="h-full flex flex-col overflow-hidden bg-black/10">
      {/* ── Header ── */}
      <header className="shrink-0 border-b border-zinc-900 bg-black/70 backdrop-blur-xl z-30 px-3 py-2">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0 overflow-hidden">
            <h1 className="text-lg font-black tracking-tighter shrink-0">D<span className="text-lime-400">77</span></h1>
            <div className="flex flex-wrap items-center gap-1.5 min-w-0">
              <div className="hidden sm:flex items-center gap-1.5 px-2 py-0.5 bg-zinc-900/80 rounded-full border border-zinc-800 text-[10px] font-mono">
                <Flame className="h-2.5 w-2.5 text-orange-400" />
                <span className="text-zinc-400">T<span className="text-lime-400 font-bold">{turn}</span></span>
                <span className="text-zinc-700">·</span>
                {(() => { const pos = pData.board_position ?? 0; const sq = SQUARE_LABELS[pos]; return <span className={sq ? sq.cls + ' font-bold' : 'text-cyan-400 font-bold'}>📍{pos}{sq ? ' ' + sq.label : ''}</span>; })()}
                {state.locked && <Badge className="bg-red-500/20 text-red-400 text-[9px] ml-1">LOCK</Badge>}
              </div>
              {projectedSquare !== null && (() => {
                const sq = SQUARE_LABELS[projectedSquare];
                const corp = market.find(c => c.board_position === projectedSquare);
                const dest = sq ? sq.label : corp ? corp.name : `Casilla ${projectedSquare}`;
                return (
                  <motion.div initial={{ opacity: 0, scale: 0.85 }} animate={{ opacity: 1, scale: 1 }} className="flex items-center gap-1 px-2 py-0.5 bg-lime-400/15 border border-lime-400/50 rounded-full text-[10px] font-mono text-lime-300 shrink-0">
                    <span>🎲</span><span className="font-bold text-lime-400">{projectedSquare}</span><span className="text-lime-500">➔</span><span className="truncate max-w-[80px]">{dest}</span>
                  </motion.div>
                );
              })()}
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <Button variant="ghost" size="icon" onClick={onOpenDice} className="h-8 w-8 text-lime-400 hover:text-lime-300 hover:bg-lime-400/10" title="Tirar dado">
              <Dices className="h-4 w-4" />
            </Button>
            {pData.is_admin && (
              <Button variant="ghost" size="icon" onClick={() => setSection(s => s === 'admin' ? 'inicio' : 'admin')} className={`h-8 w-8 transition-colors ${section === 'admin' ? 'text-orange-400 bg-orange-400/10' : 'text-zinc-500 hover:text-orange-400'}`} title="Admin">
                <Settings className="h-3.5 w-3.5" />
              </Button>
            )}
            <div className="flex items-center gap-1.5">
              <div className="w-7 h-7 rounded-full flex items-center justify-center font-black text-black text-xs ring-2 ring-black/20" style={{ backgroundColor: pData.avatar_color }}>{pData.username[0]}</div>
              <div className="hidden sm:block leading-none">
                <div className="text-xs font-bold flex items-center gap-1">{pData.username}</div>
                <RoleBadge role={pData.player_role} />
              </div>
            </div>
            <Button variant="ghost" size="icon" onClick={logout} className="h-8 w-8 text-zinc-500 hover:text-white"><LogOut className="h-3.5 w-3.5" /></Button>
          </div>
        </div>
      </header>

      {/* ── Scroll content ── */}
      <div className="flex-1 overflow-y-auto overscroll-contain" style={{ scrollbarWidth: 'thin', scrollbarColor: '#3f3f46 transparent' }}>
        <div className="px-2 py-2 space-y-2">
          {/* KPIs */}
          {(() => {
            const totalIcSpent = Number(pData.total_ic_spent || 0);
            const { level, pct, next } = levelProgress(totalIcSpent);
            return (
              <div className="space-y-1.5">
                <div className="grid grid-cols-4 gap-1.5">
                  <KpiCard label="NW"    value={fmt(netWorth)}                                                         icon={<TrendingUp className="h-3 w-3" />} accent="lime"   />
                  <KpiCard label="Cash"  value={fmt(pData.liquid_cash)}                                                icon={<Wallet     className="h-3 w-3" />} accent="cyan"   />
                  <KpiCard label="IC"    value={Math.round(pData.intellectual_capital).toLocaleString('es-AR') + ' IC'} icon={<Zap       className="h-3 w-3" />} accent="orange" />
                  <KpiCard label="Corps" value={portfolio.length}                                                      icon={<Building2  className="h-3 w-3" />} accent="pink"   />
                </div>
                {/* Level Bar */}
                <div className="bg-zinc-950 border border-zinc-900 rounded-lg px-3 py-1.5 flex items-center gap-2">
                  <div className="shrink-0 w-8 h-8 rounded-full bg-lime-400/15 border border-lime-500/40 flex items-center justify-center">
                    <span className="text-[11px] font-black text-lime-400">L{level}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-0.5">
                      <span className="text-[9px] font-mono uppercase text-zinc-500">Nivel {level} — {totalIcSpent.toLocaleString('es-AR')} IC gastados</span>
                      {next !== null && <span className="text-[8px] font-mono text-zinc-600">{next.toLocaleString('es-AR')} IC → L{level + 1}</span>}
                    </div>
                    <div className="w-full h-1 bg-zinc-800 rounded-full overflow-hidden">
                      <div className="h-full bg-lime-400 rounded-full transition-all" style={{ width: pct + '%' }} />
                    </div>
                  </div>
                </div>
              </div>
            );
          })()}

          {/* Chapter 11 */}
          {pData.bankrupt && (
            <div className="bg-red-950/40 border border-red-500/50 rounded-lg p-3 flex items-start gap-2">
              <ShieldAlert className="h-4 w-4 text-red-400 shrink-0 mt-0.5" />
              <div>
                <div className="font-bold text-red-300 uppercase text-xs">Chapter 11 · Receivership</div>
                <div className="text-[10px] text-red-400/80 mt-0.5">Inyección aplicada. {pData.tax_exempt_turns} turnos exentos restantes.</div>
              </div>
            </div>
          )}

          {/* ── Section Content ── */}
          {section === 'inicio' && (
            <InicioSection
              dashboard={dashboard}
              market={market}
              player={player}
              players={players}
              turn={turn}
              refresh={refresh}
              auditTurn={auditTurn}
              lastGlobalEvent={lastGlobalEvent}
              portfolio={portfolio}
              audit={audit}
              pendingOrders={pendingOrders}
              pData={pData}
            />
          )}
          {section === 'mercado' && (
            <MercadoSection
              tab={mercadoTab}
              setTab={setMercadoTab}
              market={market}
              player={player}
              portfolio={portfolio}
              turn={turn}
              refresh={refresh}
              pData={pData}
            />
          )}
          {section === 'arena' && (
            <ArenaSection
              tab={arenaTab}
              setTab={setArenaTab}
              player={player}
              players={players}
              market={market}
              pData={pData}
              refresh={refresh}
            />
          )}
          {section === 'pactos' && (
            <AlliancesTab player={player} players={players} liquidCash={Number(pData.liquid_cash)} onChange={refresh} />
          )}
          {section === 'lab' && (
            <TechTreeTab player={player} ic={Number(pData.intellectual_capital)} onChange={refresh} />
          )}
          {section === 'admin' && pData.is_admin && (
            <AdminSection state={state} resolveTurn={resolveTurn} loading={loading} turn={turn} />
          )}
          {section === 'ranking' && (
            <RankingSection players={players} player={player} />
          )}
        </div>
      </div>

      {/* ── Bottom Navigation ── */}
      <BottomNav section={section} setSection={setSection} />

      {/* ── Corp Detail Modal (board cell click) ── */}
      <AnimatePresence>
        {clickedCorp && (
          <CorpDetailModal
            corp={clickedCorp}
            player={player}
            myShares={portfolio.find(p => p.corp_id === clickedCorp.id)?.shares || 0}
            turn={turn}
            onClose={onCloseCorp}
            refresh={refresh}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Bottom Navigation ─────────────────────────────────────────────────────────
const NAV = [
  { id: 'inicio',  Icon: Home,       label: 'Inicio',  color: 'text-lime-400',   bg: 'bg-lime-400/15'   },
  { id: 'mercado', Icon: BarChart2,   label: 'Mercado', color: 'text-cyan-400',   bg: 'bg-cyan-400/15'   },
  { id: 'arena',   Icon: Target,      label: 'Arena',   color: 'text-red-400',    bg: 'bg-red-400/15'    },
  { id: 'pactos',  Icon: Users,       label: 'Pactos',  color: 'text-orange-400', bg: 'bg-orange-400/15' },
  { id: 'lab',     Icon: FlaskConical,label: 'Lab',     color: 'text-purple-400', bg: 'bg-purple-400/15' },
];

function BottomNav({ section, setSection }) {
  return (
    <nav className="shrink-0 border-t border-zinc-900 bg-black/80 backdrop-blur-xl">
      <div className="flex">
        {NAV.map(({ id, Icon, label, color, bg }) => {
          const isActive = section === id;
          return (
            <button
              key={id}
              onClick={() => setSection(id)}
              className={`flex-1 flex flex-col items-center justify-center py-2 gap-0.5 transition-colors ${isActive ? color : 'text-zinc-600 hover:text-zinc-400'}`}
            >
              <div className={`p-1.5 rounded-lg transition-colors ${isActive ? bg : ''}`}>
                <Icon className="h-4 w-4" />
              </div>
              <span className={`text-[9px] font-mono uppercase tracking-wide leading-none ${isActive ? 'font-bold' : ''}`}>{label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}

// ── Sección Inicio — Pulso del Mercado ────────────────────────────────────────
function InicioSection({ dashboard, market, player, turn, refresh, auditTurn, lastGlobalEvent, portfolio, audit, pendingOrders, pData }) {

  // Compute estimated cashflow from portfolio
  const incMult  = 1 + 0.01 * Math.pow(Math.max(1, turn), 1.15);
  const costMult = Math.pow(1.02, Math.max(0, turn - 1));
  let totalDiv = 0, totalMaint = 0;
  for (const h of portfolio) {
    const corp = market.find(c => c.id === h.corp_id);
    if (!corp) continue;
    const myPct = h.shares / (corp.total_shares || 100);
    totalDiv   += Number(corp.base_income || 0) * incMult * myPct;
    totalMaint += (myPct * Number(corp.fair_market_value)) * 0.015 * costMult;
  }
  const netCashflow = totalDiv - totalMaint;

  // Top picks: corps with score ≥ 4, available supply > 0, not owned by player
  const scoredMarket = market.map(c => ({ ...c, score: corpScore(c, turn) }));
  const topPicks = scoredMarket
    .filter(c => c.score >= 4 && ((c.total_shares || 100) - (c.owned_shares || 0)) > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);

  // Holdings bleeding cash
  const danger = portfolio.filter(h => {
    const corp = market.find(c => c.id === h.corp_id);
    if (!corp) return false;
    const myPct      = h.shares / (corp.total_shares || 100);
    const div        = Number(corp.base_income || 0) * incMult * myPct;
    const maint      = myPct * Number(corp.fair_market_value) * 0.015 * costMult;
    return (div - maint) < 0;
  }).map(h => {
    const corp   = market.find(c => c.id === h.corp_id);
    const myPct  = h.shares / (corp.total_shares || 100);
    const net    = Number(corp.base_income || 0) * incMult * myPct - myPct * Number(corp.fair_market_value) * 0.015 * costMult;
    return { ...h, corpName: corp?.name, net };
  });

  const [auditOpen, setAuditOpen] = useState(false);

  return (
    <div className="space-y-2">
      {/* Global Event */}
      {lastGlobalEvent && (
        <div className="bg-indigo-950/40 border border-indigo-500/40 rounded-xl p-3 flex items-start gap-3">
          <span className="text-2xl shrink-0 leading-none mt-0.5">🌐</span>
          <div className="min-w-0">
            <div className="font-black text-indigo-300 text-xs uppercase tracking-wider">{lastGlobalEvent.label}</div>
            <div className="text-[11px] text-indigo-400/80 mt-0.5">{lastGlobalEvent.desc}</div>
            {lastGlobalEvent.district && (
              <div className="text-[10px] font-mono text-indigo-500 mt-1">
                Zona: <span className="text-indigo-300 font-bold">{lastGlobalEvent.district}</span> · {lastGlobalEvent.pct > 0 ? '+' : ''}{(lastGlobalEvent.pct * 100).toFixed(0)}% FMV
              </div>
            )}
          </div>
        </div>
      )}

      {/* Cashflow Bar */}
      {portfolio.length > 0 && (
        <div className={`border rounded-xl p-3 ${netCashflow >= 0 ? 'bg-lime-950/30 border-lime-700/40' : 'bg-red-950/30 border-red-700/40'}`}>
          <div className="flex items-center justify-between mb-2">
            <span className="text-[9px] font-mono uppercase text-zinc-500">Cashflow estimado / turno</span>
            <span className={`font-black text-base font-mono ${netCashflow >= 0 ? 'text-lime-400' : 'text-red-400'}`}>
              {netCashflow >= 0 ? '+' : ''}{fmt(Math.round(netCashflow))}
            </span>
          </div>
          <div className="flex gap-3 text-[9px] font-mono">
            <span className="text-lime-500">▲ Div: {fmt(Math.round(totalDiv))}</span>
            <span className="text-red-500">▼ Mnt: {fmt(Math.round(totalMaint))}</span>
          </div>
        </div>
      )}

      {/* Top Picks */}
      {topPicks.length > 0 && (
        <Card className="bg-zinc-950 border-zinc-900">
          <CardHeader className="py-2 px-3">
            <CardTitle className="text-lime-400 font-mono uppercase text-xs flex items-center gap-1.5">
              🔥 Mejores picks hoy
            </CardTitle>
            <CardDescription className="text-zinc-500 text-[10px]">Mayor rentabilidad disponible</CardDescription>
          </CardHeader>
          <CardContent className="px-3 pb-3 space-y-2">
            {topPicks.map(c => (
              <MiniCorpCard key={c.id} corp={c} player={player} refresh={refresh} />
            ))}
          </CardContent>
        </Card>
      )}

      {/* Danger Holdings */}
      {danger.length > 0 && (
        <Card className="bg-zinc-950 border-red-900/40">
          <CardHeader className="py-2 px-3">
            <CardTitle className="text-red-400 font-mono uppercase text-xs flex items-center gap-1.5">
              <AlertTriangle className="h-3.5 w-3.5" /> Atención — holdings negativos
            </CardTitle>
          </CardHeader>
          <CardContent className="px-3 pb-3 space-y-1.5">
            {danger.map(h => (
              <div key={h.corp_id} className="flex items-center justify-between bg-red-950/20 border border-red-900/30 rounded-lg px-3 py-1.5">
                <span className="text-xs font-bold text-white">{h.corpName}</span>
                <span className="font-mono text-xs text-red-400 font-bold">{fmt(Math.round(h.net))}/turno</span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Pending Orders */}
      {pendingOrders.length > 0 && (
        <Card className="bg-zinc-950 border-zinc-900">
          <CardHeader className="py-2 px-3">
            <CardTitle className="text-orange-400 font-mono uppercase text-xs flex items-center gap-1.5">
              <ShoppingCart className="h-3.5 w-3.5" /> Cola · Turno {turn}
            </CardTitle>
          </CardHeader>
          <CardContent className="px-3 pb-3 space-y-1.5">
            <AnimatePresence>
              {pendingOrders.map(o => (
                <ActionReceipt key={o.id} order={o} onCancel={async (id) => {
                  try { await api('orders/' + id, { method: 'DELETE' }); toast.success('Cancelada'); refresh(); }
                  catch (e) { toast.error(e.message); }
                }} />
              ))}
            </AnimatePresence>
          </CardContent>
        </Card>
      )}

      {/* Audit (collapsible) */}
      <Card className="bg-zinc-950 border-zinc-900">
        <button
          onClick={() => setAuditOpen(o => !o)}
          className="w-full flex items-center justify-between px-3 py-2.5 hover:bg-zinc-900/40 transition-colors"
        >
          <span className="text-lime-400 font-mono uppercase text-xs flex items-center gap-1.5">
            <History className="h-3.5 w-3.5" /> Auditoría — Turno #{auditTurn || '—'}
          </span>
          {auditOpen ? <ChevronDown className="h-4 w-4 text-zinc-500" /> : <ChevronRight className="h-4 w-4 text-zinc-500" />}
        </button>
        <AnimatePresence>
          {auditOpen && (
            <motion.div initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }} className="overflow-hidden">
              <div className="px-3 pb-3">
                {audit.length === 0 ? (
                  <p className="text-xs text-zinc-500 italic">Sin movimientos.</p>
                ) : (
                  <div className="space-y-0.5 max-h-48 overflow-y-auto">
                    {audit.map((t, i) => (
                      <div key={i} className="flex items-center justify-between py-1 border-b border-zinc-900 text-xs">
                        <div className="flex items-center gap-1.5 flex-1 min-w-0">
                          <TxBadge type={t.tx_type} />
                          <span className="text-zinc-400 text-[10px] truncate">{t.description}</span>
                        </div>
                        <span className={`font-mono font-bold text-xs shrink-0 ${Number(t.amount) >= 0 ? 'text-lime-400' : 'text-red-400'}`}>
                          {Number(t.amount) >= 0 ? '+' : ''}{fmtDec(t.amount)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </Card>
    </div>
  );
}

// ── Mini Corp Card (for Inicio picks) ─────────────────────────────────────────
function MiniCorpCard({ corp, player, refresh }) {
  const [loading, setLoading] = useState(null); // qty loading

  const quickBuy = async (qty) => {
    setLoading(qty);
    try {
      await api('orders', {
        method: 'POST',
        body: JSON.stringify({ player_id: player.id, order_type: 'BUY_SHARES', corporation_id: corp.id, shares: qty }),
      });
      toast.success(`+${qty} ${corp.name} encolado`);
      refresh();
    } catch (e) { toast.error(e.message); }
    finally { setLoading(null); }
  };

  const sharePrice = Number(corp.fair_market_value) / 100;
  const supply     = (corp.total_shares || 100) - (corp.owned_shares || 0);

  return (
    <div className="flex items-center gap-2 bg-zinc-900/40 border border-zinc-800 rounded-lg px-2.5 py-2">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-bold text-xs text-white truncate">{corp.name}</span>
          <Badge className="bg-zinc-800 text-zinc-400 border-0 text-[8px] font-mono shrink-0">{corp.district}</Badge>
        </div>
        <div className="flex items-center gap-2 mt-0.5">
          {'🔥'.repeat(corp.score).padEnd(5 * 2, '○').split('').join('')}
          <span className="text-[9px] font-mono text-zinc-500">{fmtDec(sharePrice)}/sh · {supply} disp.</span>
        </div>
      </div>
      <div className="flex gap-1 shrink-0">
        {[5, 10].map(qty => (
          <button
            key={qty}
            onClick={() => quickBuy(qty)}
            disabled={!!loading || supply < qty}
            className="px-2 py-1 bg-lime-400/15 hover:bg-lime-400/25 border border-lime-500/30 rounded text-[9px] font-mono font-bold text-lime-300 disabled:opacity-40 transition-colors"
          >
            {loading === qty ? <Loader2 className="h-2.5 w-2.5 animate-spin" /> : `+${qty}`}
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Sección Mercado ───────────────────────────────────────────────────────────
function MercadoSection({ tab, setTab, market, player, portfolio, turn, refresh, pData }) {
  return (
    <div className="space-y-2">
      {/* Sub-nav */}
      <div className="flex gap-1 p-1 bg-zinc-900/60 rounded-xl border border-zinc-800">
        {[['market','📈 Mercado'],['portfolio','💼 Portfolio']].map(([id, label]) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`flex-1 py-1.5 text-[10px] font-mono uppercase rounded-lg transition-colors ${tab === id ? 'bg-cyan-500/20 text-cyan-300 font-bold' : 'text-zinc-500 hover:text-zinc-300'}`}
          >{label}</button>
        ))}
      </div>

      {tab === 'market' && (
        <SmartMarketTab market={market} player={player} portfolio={portfolio} turn={turn} refresh={refresh} />
      )}
      {tab === 'portfolio' && (
        <PortfolioSection portfolio={portfolio} market={market} player={player} turn={turn} refresh={refresh} />
      )}
    </div>
  );
}

// ── Smart Market Tab ──────────────────────────────────────────────────────────
function SmartMarketTab({ market, player, portfolio, turn, refresh }) {
  const [filter, setFilter] = useState('all'); // 'all' | 'hot' | 'mine'
  const [expanded, setExpanded] = useState(null);

  const myCorpIds = new Set(portfolio.map(p => p.corp_id));

  const scored = market
    .map(c => ({ ...c, score: corpScore(c, turn) }))
    .sort((a, b) => b.score - a.score || Number(b.fair_market_value) - Number(a.fair_market_value));

  const filtered = scored.filter(c => {
    if (filter === 'hot')  return c.score >= 4;
    if (filter === 'mine') return myCorpIds.has(c.id);
    return true;
  });

  return (
    <div className="space-y-2">
      {/* Filter pills */}
      <div className="flex gap-1.5">
        {[['all','Todos'],['hot','🔥 Hot'],['mine','Mis corps']].map(([id, label]) => (
          <button
            key={id}
            onClick={() => setFilter(id)}
            className={`px-3 py-1 text-[9px] font-mono uppercase rounded-full border transition-colors ${filter === id ? 'bg-lime-400/20 border-lime-500/50 text-lime-300 font-bold' : 'border-zinc-800 text-zinc-500 hover:text-zinc-300'}`}
          >{label}</button>
        ))}
      </div>

      {/* Corp cards */}
      <div className="space-y-1.5">
        {filtered.map(corp => (
          <SmartCorpCard
            key={corp.id}
            corp={corp}
            player={player}
            myShares={portfolio.find(p => p.corp_id === corp.id)?.shares || 0}
            isExpanded={expanded === corp.id}
            onToggle={() => setExpanded(e => e === corp.id ? null : corp.id)}
            refresh={refresh}
          />
        ))}
      </div>
    </div>
  );
}

// ── Smart Corp Card ───────────────────────────────────────────────────────────
function SmartCorpCard({ corp, player, myShares, isExpanded, onToggle, refresh }) {
  const [loading,    setLoading]    = useState(null);
  const [customQty,  setCustomQty]  = useState('');
  const [orderType,  setOrderType]  = useState('BUY_SHARES');

  const sharePrice = Number(corp.fair_market_value) / 100;
  const buyPrice   = sharePrice * 1.03;
  const sellPrice  = sharePrice * 0.97;
  const supply     = (corp.total_shares || 100) - (corp.owned_shares || 0);
  const isCeo      = corp.ceo_player_id === player.id;

  const placeOrder = async (type, qty) => {
    const q = parseInt(qty, 10);
    if (!q || q <= 0) return toast.error('Cantidad inválida');
    setLoading(`${type}-${q}`);
    try {
      await api('orders', {
        method: 'POST',
        body: JSON.stringify({ player_id: player.id, order_type: type, corporation_id: corp.id, shares: q, limit_price: null }),
      });
      toast.success(`${type === 'BUY_SHARES' ? '+' : '-'}${q} ${corp.name}`);
      setCustomQty('');
      refresh();
    } catch (e) { toast.error(e.message); }
    finally { setLoading(null); }
  };

  return (
    <motion.div layout className="bg-zinc-950 border border-zinc-800 rounded-xl overflow-hidden">
      {/* Card header — always visible */}
      <button onClick={onToggle} className="w-full text-left p-3 hover:bg-zinc-900/40 transition-colors">
        <div className="flex items-start gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="font-bold text-sm text-white">{corp.name}</span>
              {isCeo && <Crown className="h-3 w-3 text-orange-400 shrink-0" />}
              <Badge className="bg-zinc-800 text-zinc-400 border-0 text-[8px] font-mono shrink-0">{corp.district}</Badge>
              {myShares > 0 && <Badge className="bg-lime-500/15 text-lime-400 border-lime-500/30 text-[8px] font-mono shrink-0">{myShares} sh</Badge>}
            </div>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              {/* Score flames */}
              <div className="flex gap-[1px]">
                {Array.from({ length: 5 }).map((_, i) => (
                  <span key={i} className={`text-[11px] ${i < corp.score ? 'opacity-100' : 'opacity-15'}`}>🔥</span>
                ))}
              </div>
              <span className="text-[9px] font-mono text-zinc-500">{fmtDec(sharePrice)}/sh</span>
              <span className={`text-[9px] font-mono ${supply > 20 ? 'text-zinc-400' : supply > 5 ? 'text-orange-400' : 'text-red-400'}`}>{supply} disp.</span>
              <span className="text-[9px] font-mono text-zinc-500">CEO: {corp.ceo_name || '—'}</span>
            </div>
          </div>
          <div className="shrink-0 text-right">
            <div className="text-sm font-black font-mono text-lime-400">{fmt(corp.fair_market_value)}</div>
            {isExpanded ? <ChevronDown className="h-3.5 w-3.5 text-zinc-500 ml-auto mt-1" /> : <ChevronRight className="h-3.5 w-3.5 text-zinc-500 ml-auto mt-1" />}
          </div>
        </div>
      </button>

      {/* Expanded: quick-order panel */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="overflow-hidden"
          >
            <div className="px-3 pb-3 space-y-2.5 border-t border-zinc-900">
              {/* Quick BUY */}
              <div className="pt-2.5">
                <div className="text-[8px] font-mono uppercase text-zinc-500 mb-1.5 flex items-center gap-1">
                  <TrendingUp className="h-2.5 w-2.5 text-lime-400" /> Comprar rápido
                </div>
                <div className="grid grid-cols-3 gap-1.5">
                  {[5, 10, 25].map(qty => (
                    <button
                      key={qty}
                      onClick={() => placeOrder('BUY_SHARES', qty)}
                      disabled={!!loading || supply < qty}
                      className="flex flex-col items-center py-2 px-1 bg-lime-400/10 hover:bg-lime-400/20 border border-lime-500/30 rounded-lg text-lime-300 disabled:opacity-40 transition-colors"
                    >
                      <span className="text-xs font-black">+{qty}</span>
                      <span className="text-[8px] font-mono opacity-70">~{fmt(Math.round(qty * buyPrice))}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Quick SELL */}
              {myShares > 0 && (
                <div>
                  <div className="text-[8px] font-mono uppercase text-zinc-500 mb-1.5 flex items-center gap-1">
                    <TrendingDown className="h-2.5 w-2.5 text-red-400" /> Vender
                  </div>
                  <div className="grid grid-cols-3 gap-1.5">
                    {[...new Set([Math.min(5, myShares), Math.min(10, myShares), myShares])].filter(v => v > 0).map(qty => (
                      <button
                        key={qty}
                        onClick={() => placeOrder('SELL_SHARES', qty)}
                        disabled={!!loading}
                        className="flex flex-col items-center py-2 px-1 bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 rounded-lg text-red-300 disabled:opacity-40 transition-colors"
                      >
                        <span className="text-xs font-black">{qty === myShares && qty > 10 ? 'Todo' : `-${qty}`}</span>
                        <span className="text-[8px] font-mono opacity-70">~{fmt(Math.round(qty * sellPrice))}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Custom order */}
              <div className="flex gap-1.5">
                <select
                  value={orderType}
                  onChange={e => setOrderType(e.target.value)}
                  className="bg-zinc-900 border border-zinc-800 text-white text-[9px] font-mono rounded-lg px-2 h-8 shrink-0"
                >
                  <option value="BUY_SHARES">Comprar</option>
                  <option value="SELL_SHARES">Vender</option>
                </select>
                <Input
                  type="number"
                  min="1"
                  value={customQty}
                  onChange={e => setCustomQty(e.target.value)}
                  placeholder="Cant."
                  className="bg-black border-zinc-800 text-white font-mono h-8 text-xs"
                />
                <Button
                  onClick={() => placeOrder(orderType, customQty)}
                  disabled={!!loading || !customQty}
                  size="sm"
                  className={`shrink-0 h-8 font-bold text-xs px-3 ${orderType === 'BUY_SHARES' ? 'bg-lime-400 hover:bg-lime-300 text-black' : 'bg-red-700 hover:bg-red-600 text-white'}`}
                >
                  {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : 'OK'}
                </Button>
              </div>

              {/* Banda de precio info */}
              <p className="text-[8px] font-mono text-zinc-600">
                Banda: {fmt(Number(corp.fair_market_value) * 0.5)} – {fmt(Number(corp.fair_market_value) * 2.5)}
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ── Portfolio Section ─────────────────────────────────────────────────────────
function PortfolioSection({ portfolio, market, player, turn, refresh }) {
  const [loading, setLoading] = useState(null);

  const incMult  = 1 + 0.01 * Math.pow(Math.max(1, turn), 1.15);
  const costMult = Math.pow(1.02, Math.max(0, turn - 1));

  const sellQuick = async (corpId, qty) => {
    setLoading(`${corpId}-${qty}`);
    try {
      await api('orders', {
        method: 'POST',
        body: JSON.stringify({ player_id: player.id, order_type: 'SELL_SHARES', corporation_id: corpId, shares: qty }),
      });
      const name = portfolio.find(p => p.corp_id === corpId)?.name || '';
      toast.success(`-${qty} ${name} encolado`);
      refresh();
    } catch (e) { toast.error(e.message); }
    finally { setLoading(null); }
  };

  if (portfolio.length === 0) {
    return (
      <Card className="bg-zinc-950 border-zinc-900">
        <CardContent className="p-6 text-center">
          <Building2 className="h-8 w-8 text-zinc-700 mx-auto mb-2" />
          <p className="text-zinc-500 text-sm">No posees acciones. Usá el Mercado para comprar.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-2">
      {portfolio.map(s => {
        const corp   = market.find(c => c.id === s.corp_id);
        const pct    = (s.shares / s.total_shares) * 100;
        const value  = (s.shares / s.total_shares) * Number(s.fair_market_value);
        const isCeo  = s.ceo_player_id === player.id;
        const myPct  = s.shares / (corp?.total_shares || 100);
        const div    = Number(corp?.base_income || 0) * incMult * myPct;
        const maint  = myPct * Number(s.fair_market_value) * 0.015 * costMult;
        const net    = div - maint;

        return (
          <div key={s.corp_id} className="bg-zinc-950 border border-zinc-800 rounded-xl p-3 space-y-2">
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="font-bold text-sm text-white">{s.name}</span>
                  {isCeo && <Badge className="bg-orange-500/20 text-orange-300 border-orange-500/30 text-[8px]"><Crown className="h-2 w-2 mr-0.5" />CEO</Badge>}
                  <span className="text-[9px] font-mono text-zinc-500">{corp?.district}</span>
                </div>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-xs font-mono text-zinc-400">{s.shares} sh · {pct.toFixed(1)}%</span>
                  <span className={`text-[9px] font-mono font-bold ${net >= 0 ? 'text-lime-400' : 'text-red-400'}`}>
                    {net >= 0 ? '+' : ''}{fmt(Math.round(net))}/t
                  </span>
                </div>
              </div>
              <div className="text-right shrink-0">
                <div className="text-sm font-black font-mono text-lime-400">{fmt(Math.round(value))}</div>
                <div className="text-[8px] font-mono text-zinc-500">{fmtDec(Number(s.fair_market_value) / 100)}/sh</div>
              </div>
            </div>

            {/* Quick sell buttons */}
            <div className="flex items-center gap-1.5">
              <span className="text-[8px] font-mono text-zinc-600 uppercase shrink-0">Vender:</span>
              {[...new Set([Math.min(5, s.shares), Math.min(10, s.shares), s.shares])].filter(v => v > 0).map(qty => (
                <button
                  key={qty}
                  onClick={() => sellQuick(s.corp_id, qty)}
                  disabled={loading === `${s.corp_id}-${qty}`}
                  className="px-2 py-0.5 bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 rounded text-[9px] font-mono text-red-300 disabled:opacity-40 transition-colors"
                >
                  {loading === `${s.corp_id}-${qty}` ? <Loader2 className="h-2.5 w-2.5 animate-spin" /> : qty === s.shares && qty > 10 ? 'Todo' : `-${qty}`}
                </button>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Arena Section (Nissai / Casino / Bounty) ──────────────────────────────────
function ArenaSection({ tab, setTab, player, players, market, pData, refresh }) {
  const TABS = [
    { id: 'nissai', label: '🥷 Nissai', activeClass: 'bg-red-700/30 text-red-300 border-red-700/40' },
    { id: 'casino', label: '🎰 Casino', activeClass: 'bg-purple-700/30 text-purple-300 border-purple-700/40' },
    { id: 'bounty', label: '🏴‍☠️ Bounty', activeClass: 'bg-amber-700/30 text-amber-300 border-amber-700/40' },
  ];
  const active = TABS.find(t => t.id === tab);

  return (
    <div className="space-y-2">
      <div className="flex gap-1 p-1 bg-zinc-900/60 rounded-xl border border-zinc-800">
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex-1 py-1.5 text-[10px] font-mono uppercase rounded-lg border transition-colors ${tab === t.id ? t.activeClass : 'text-zinc-500 border-transparent hover:text-zinc-300'}`}
          >{t.label}</button>
        ))}
      </div>
      {tab === 'nissai' && <NissaiPanel player={player} players={players} market={market} onChange={refresh} />}
      {tab === 'casino' && <CasinoTab player={player} liquidCash={Number(pData.liquid_cash)} onChange={refresh} />}
      {tab === 'bounty' && <BountyBoard player={player} players={players} liquidCash={Number(pData.liquid_cash)} onChange={refresh} />}
    </div>
  );
}

// ── Ranking Section ───────────────────────────────────────────────────────────
function RankingSection({ players, player }) {
  return (
    <Card className="bg-zinc-950 border-zinc-900">
      <CardHeader className="py-2 px-3">
        <CardTitle className="text-lime-400 font-mono uppercase text-xs">Ranking · Net Worth</CardTitle>
      </CardHeader>
      <CardContent className="px-3 pb-3">
        <div className="space-y-1.5">
          {players.map((p, i) => (
            <div key={p.id} className={`flex items-center gap-2 p-2 rounded border ${p.id === player.id ? 'border-lime-500/50 bg-lime-500/5' : 'border-zinc-900 bg-zinc-900/30'}`}>
              <div className="text-xl font-black text-zinc-700 w-6 shrink-0">{i + 1}</div>
              <div className="w-8 h-8 rounded-full flex items-center justify-center font-black text-black text-sm shrink-0" style={{ backgroundColor: p.avatar_color }}>{p.username[0]}</div>
              <div className="flex-1 min-w-0">
                <div className="font-bold text-sm flex items-center gap-1.5">{p.username}{p.bankrupt && <Skull className="h-3 w-3 text-red-400" />}</div>
                <div className="flex items-center gap-2 mt-0.5 flex-wrap"><RoleBadge role={p.player_role} /><span className="text-[9px] text-zinc-500 font-mono">{fmt(p.liquid_cash)}</span></div>
              </div>
              <div className="text-right shrink-0">
                <div className="text-base font-bold font-mono text-lime-400">{fmt(p.net_worth)}</div>
                <div className="text-[9px] text-zinc-500 font-mono uppercase">NW</div>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// ── Admin Section ─────────────────────────────────────────────────────────────
function AdminSection({ state, resolveTurn, loading, turn }) {
  const [logs, setLogs] = useState([]);
  useEffect(() => { api('admin/turn-log').then(d => setLogs(d.logs)).catch(() => {}); }, [state.current_turn]);

  return (
    <div className="space-y-2">
      <Card className="bg-gradient-to-br from-orange-950/40 to-black border-orange-500/30">
        <CardHeader className="py-2 px-3">
          <CardTitle className="text-orange-400 font-mono uppercase text-xs flex items-center gap-1.5">
            <Flame className="h-3.5 w-3.5" /> Control de Turnos
          </CardTitle>
        </CardHeader>
        <CardContent className="px-3 pb-3">
          <div className="flex items-center gap-4 flex-wrap">
            <div>
              <div className="text-[10px] font-mono uppercase text-zinc-500">Turno actual</div>
              <div className="text-4xl font-black text-orange-400">{state.current_turn}</div>
            </div>
            <Button onClick={resolveTurn} disabled={loading || state.locked} className="bg-orange-400 hover:bg-orange-300 text-black font-bold uppercase tracking-wider h-12 px-6 text-sm">
              {loading ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <Flame className="h-4 w-4 mr-1.5" />}
              Resolver T{state.current_turn}
            </Button>
          </div>
        </CardContent>
      </Card>
      <Card className="bg-zinc-950 border-zinc-900">
        <CardHeader className="py-2 px-3"><CardTitle className="text-lime-400 font-mono uppercase text-xs">Historial</CardTitle></CardHeader>
        <CardContent className="px-3 pb-3">
          {logs.length === 0 ? <p className="text-zinc-500 italic text-xs">Sin turnos resueltos.</p> : (
            <div className="space-y-1.5 max-h-72 overflow-y-auto">
              {logs.map(l => (
                <div key={l.turn_number} className="border border-zinc-900 rounded p-2 bg-zinc-900/30">
                  <div className="flex items-center justify-between mb-1">
                    <div className="font-bold font-mono text-xs">TURNO #{l.turn_number}</div>
                    <div className="text-[9px] text-zinc-500 font-mono">{new Date(l.resolved_at).toLocaleString('es-AR')}</div>
                  </div>
                  <div className="grid grid-cols-3 gap-1 text-[10px] font-mono">
                    <div><span className="text-zinc-500">Trades:</span> <span className="text-lime-400">{l.summary?.trades?.length || 0}</span></div>
                    <div><span className="text-zinc-500">Eventos:</span> <span className="text-orange-400">{l.summary?.events?.length || 0}</span></div>
                    <div><span className="text-zinc-500">FMV:</span> <span className="text-cyan-400">{Object.keys(l.summary?.fmv_changes || {}).length}</span></div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ── KPI Card ──────────────────────────────────────────────────────────────────
function KpiCard({ label, value, icon, accent }) {
  const colors = { lime: { text: 'text-lime-400', border: 'border-lime-500/20' }, cyan: { text: 'text-cyan-400', border: 'border-cyan-500/20' }, orange: { text: 'text-orange-400', border: 'border-orange-500/20' }, pink: { text: 'text-pink-400', border: 'border-pink-500/20' } };
  const c = colors[accent];
  return (
    <div className={`bg-zinc-950 border ${c.border} rounded-lg p-2`}>
      <div className="flex items-center justify-between mb-0.5">
        <span className="text-[8px] uppercase font-mono tracking-widest text-zinc-500">{label}</span>
        <span className={c.text}>{icon}</span>
      </div>
      <div className={`text-base font-black font-mono ${c.text} truncate`}>{value}</div>
    </div>
  );
}

// ── Role Badge ────────────────────────────────────────────────────────────────
function RoleBadge({ role }) {
  const r = ROLE_LABELS[role];
  if (!r) return null;
  return (
    <span className="text-[9px] font-mono uppercase px-1.5 py-0.5 rounded-full border leading-none" style={{ color: r.color, borderColor: r.color + '60', backgroundColor: r.color + '18' }}>{r.label}</span>
  );
}

// ── TX Badge ──────────────────────────────────────────────────────────────────
function TxBadge({ type }) {
  const map = {
    DIVIDEND:            { label: 'DIV',   cls: 'bg-lime-500/20   text-lime-300'   },
    MAINTENANCE:         { label: 'MNT',   cls: 'bg-orange-500/20 text-orange-300' },
    WEALTH_TAX:          { label: 'TAX',   cls: 'bg-red-500/20    text-red-300'    },
    BUY_SHARES:          { label: 'BUY',   cls: 'bg-cyan-500/20   text-cyan-300'   },
    SELL_SHARES:         { label: 'SELL',  cls: 'bg-pink-500/20   text-pink-300'   },
    CHAPTER_11:          { label: 'C11',   cls: 'bg-purple-500/20 text-purple-300' },
    TAX_EXEMPT:          { label: 'EXE',   cls: 'bg-zinc-700/40   text-zinc-400'   },
    ESCROW_LOCK:         { label: 'LOCK',  cls: 'bg-orange-500/20 text-orange-300' },
    ESCROW_RETURN:       { label: 'RTN',   cls: 'bg-lime-500/20   text-lime-300'   },
    ESCROW_SEIZE:        { label: 'SEIZE', cls: 'bg-lime-500/30   text-lime-200'   },
    ESCROW_RECOVERY:     { label: 'RECV',  cls: 'bg-lime-500/20   text-lime-300'   },
    ESCROW_FORFEIT:      { label: 'LOSS',  cls: 'bg-red-500/30    text-red-200'    },
    IC_GAIN:             { label: 'IC+',   cls: 'bg-orange-500/20 text-orange-300' },
    TECH_UNLOCK:         { label: 'TECH',  cls: 'bg-cyan-500/30   text-cyan-200'   },
    THERAPY_FEE:         { label: 'THER',  cls: 'bg-pink-500/20   text-pink-300'   },
    SERVER_MAINTENANCE:  { label: 'SRV',   cls: 'bg-yellow-500/20 text-yellow-300' },
    ACHIEVEMENT:         { label: 'ACH',   cls: 'bg-amber-500/30  text-amber-200'  },
    TRANSIT_RENT:        { label: 'RENT',  cls: 'bg-rose-500/20   text-rose-300'   },
    TRANSIT_RENT_INCOME: { label: 'R+',    cls: 'bg-lime-500/20   text-lime-300'   },
    CASINO:              { label: '🎰',    cls: 'bg-purple-500/20 text-purple-300' },
    NISSAI_COST:         { label: 'NSS',   cls: 'bg-red-500/20    text-red-300'    },
    NISSAI_INCOME:       { label: 'NSS+',  cls: 'bg-red-500/30    text-red-200'    },
    BOUNTY_WIN:          { label: 'BNT+',  cls: 'bg-amber-500/30  text-amber-200'  },
    BOUNTY_REFUND:       { label: 'BREF',  cls: 'bg-zinc-700/40   text-zinc-400'   },
  };
  const m = map[type] || { label: type?.slice(0,4) || '?', cls: 'bg-zinc-800 text-zinc-400' };
  return <Badge className={`${m.cls} border-0 font-mono text-[9px] px-1.5 py-0 shrink-0`}>{m.label}</Badge>;
}

export default App;
