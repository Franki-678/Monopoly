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
  ChevronDown, ChevronRight, Settings, KeyRound, ShieldCheck, X,
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
// ── Market Hours (ART = UTC-3, no DST) ───────────────────────────────────────
function clientIsMarketOpen() {
  const now = new Date();
  const artHour = ((now.getUTCHours() - 3) + 24) % 24;
  return artHour >= 9;
}

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
  const [marketOpen,      setMarketOpen]      = useState(true);
  const prevTurnRef = useRef(null);

  // Market hours check — update every minute
  useEffect(() => {
    const check = () => setMarketOpen(clientIsMarketOpen());
    check();
    const id = setInterval(check, 60_000);
    return () => clearInterval(id);
  }, []);

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
        marketOpen={marketOpen}
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
function Dashboard({ player, dashboard, market, players, state, refresh, logout, loading, setLoading, onOpenDice, projectedSquare, clickedCorp, onCloseCorp, marketOpen }) {
  const [section,    setSection]    = useState('inicio');
  const [mercadoTab, setMercadoTab] = useState('market');
  const [arenaTab,   setArenaTab]   = useState('nissai');

  if (!dashboard) {
    return <div className="h-full flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-lime-400" /></div>;
  }

  const { player: pData, turn, netWorth, portfolio, audit, pendingOrders, auditTurn, lastGlobalEvent, turnSummary } = dashboard;

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
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
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

          {/* Market Closed Banner */}
          {!marketOpen && (
            <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} className="bg-zinc-900/80 border border-zinc-600/50 rounded-xl px-3 py-2 flex items-center gap-2.5">
              <span className="text-xl shrink-0">🌙</span>
              <div className="flex-1 min-w-0">
                <div className="font-black text-zinc-300 text-xs uppercase tracking-wider">Mercado Cerrado</div>
                <div className="text-[10px] font-mono text-zinc-500 mt-0.5">09:00 – 00:00 ART · Consultas disponibles · Órdenes bloqueadas hasta mañana</div>
              </div>
              <div className="text-[9px] font-mono text-zinc-600 shrink-0 text-right">READ<br/>ONLY</div>
            </motion.div>
          )}

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
              turnSummary={turnSummary}
              netWorth={netWorth}
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
              marketOpen={marketOpen}
            />
          )}
          {section === 'pactos' && (
            <div className="space-y-2">
              <div className="flex items-start gap-2 bg-zinc-900/40 border border-orange-900/30 rounded-lg px-3 py-2">
                <span className="text-base leading-none shrink-0 mt-0.5">🤝</span>
                <p className="text-[10px] text-zinc-500 leading-relaxed">
                  Al activar una alianza, ambos bloquean X% de su cash como <span className="text-orange-400">garantía mutua</span>. Quien rompe la alianza pierde el escrow a favor del otro. Incentivo real de cooperación.
                </p>
              </div>
              <AlliancesTab player={player} players={players} liquidCash={Number(pData.liquid_cash)} onChange={refresh} />
            </div>
          )}
          {section === 'lab' && (
            <div className="space-y-2">
              <div className="flex items-start gap-2 bg-zinc-900/40 border border-purple-900/30 rounded-lg px-3 py-2">
                <span className="text-base leading-none shrink-0 mt-0.5">🧪</span>
                <p className="text-[10px] text-zinc-500 leading-relaxed">
                  Gastá <span className="text-orange-400">IC</span> en nodos del árbol tecnológico. El primero que desbloquea tiene <span className="text-lime-400">Patente exclusiva</span> por 10 turnos. Después se abre para todos a 25% del costo original.
                </p>
              </div>
              <TechTreeTab player={player} ic={Number(pData.intellectual_capital)} onChange={refresh} />
            </div>
          )}
          {section === 'admin' && pData.is_admin && (
            <AdminSection state={state} resolveTurn={resolveTurn} loading={loading} turn={turn} player={player} />
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

// ── Sección Inicio — Sub-components ──────────────────────────────────────────

function StatPill({ label, value, color = 'cyan' }) {
  const c = {
    lime:   'text-lime-400 bg-lime-500/10 border-lime-500/25',
    cyan:   'text-cyan-400 bg-cyan-500/10 border-cyan-500/25',
    amber:  'text-amber-400 bg-amber-500/10 border-amber-500/25',
    orange: 'text-orange-400 bg-orange-500/10 border-orange-500/25',
    red:    'text-red-400 bg-red-500/10 border-red-500/25',
  }[color] || 'text-zinc-400 bg-zinc-800 border-zinc-700';
  return (
    <div className={`border rounded-xl px-2.5 py-2 ${c}`}>
      <div className="text-[7px] font-mono uppercase tracking-widest opacity-50 mb-0.5 leading-none">{label}</div>
      <div className="text-xs font-black font-mono leading-none">{value}</div>
    </div>
  );
}

function AlertChip({ icon, text, color = 'amber' }) {
  const c = {
    red:    'border-red-500/40 bg-red-500/10 text-red-300',
    amber:  'border-amber-500/40 bg-amber-500/10 text-amber-300',
    indigo: 'border-indigo-500/40 bg-indigo-500/10 text-indigo-300',
    lime:   'border-lime-500/40 bg-lime-500/10 text-lime-300',
    cyan:   'border-cyan-500/40 bg-cyan-500/10 text-cyan-300',
  }[color] || 'border-zinc-700 bg-zinc-800 text-zinc-300';
  return (
    <div className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-full border text-[10px] font-mono whitespace-nowrap shrink-0 ${c}`}>
      <span className="text-sm leading-none">{icon}</span>
      <span>{text}</span>
    </div>
  );
}

function PositionCard({ holding, index }) {
  const { corpName, shares, net, value, isCeo, sc } = holding;
  const isUp = net >= 0;
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.06, type: 'spring', stiffness: 260, damping: 24 }}
      className={`w-36 shrink-0 rounded-xl border p-3 ${
        isUp ? (sc?.border || 'border-zinc-700') + ' ' + (sc?.bg || '') + ' ' + (sc?.glow || '')
             : 'border-red-900/40 bg-red-950/10'
      }`}
    >
      <div className="flex items-center gap-1 mb-0.5">
        {isCeo && <Crown className="h-3 w-3 text-orange-400 shrink-0" />}
        <span className="text-[10px] font-bold text-white truncate">{corpName}</span>
      </div>
      <div className={`text-xl font-black font-mono leading-tight ${isUp ? (sc?.accent || 'text-lime-400') : 'text-red-400'}`}>
        {net >= 0 ? '+' : ''}{fmt(Math.round(net))}
      </div>
      <div className="text-[8px] font-mono text-zinc-600 mb-2">por turno</div>
      <div className="flex items-center justify-between">
        <span className="text-[8px] font-mono text-zinc-600">{shares} sh</span>
        <span className="text-[9px] font-mono text-zinc-400">{fmt(Math.round(value))}</span>
      </div>
    </motion.div>
  );
}

function GossipFeed({ gossipSections, auditTurn }) {
  const [section, setSection] = useState(gossipSections[0]?.id || '');
  const active = gossipSections.find(s => s.id === section);
  if (!active && gossipSections.length > 0 && !section) { }
  return (
    <div className="bg-zinc-950 border border-zinc-900 rounded-xl overflow-hidden">
      <div className="px-3 pt-2.5 border-b border-zinc-900/60 pb-0">
        <div className="flex items-center gap-2 mb-2">
          <History className="h-3 w-3 text-zinc-600" />
          <span className="text-[9px] font-mono uppercase text-zinc-500 tracking-wider">Gossip · Turno #{auditTurn || '—'}</span>
        </div>
        <div className="flex gap-1 overflow-x-auto pb-2" style={{ scrollbarWidth: 'none' }}>
          {gossipSections.map(s => (
            <button key={s.id} onClick={() => setSection(s.id)}
              className={`px-2 py-0.5 text-[8px] font-mono uppercase rounded border whitespace-nowrap shrink-0 transition-colors ${
                section === s.id
                  ? 'bg-lime-400/20 border-lime-500/40 text-lime-300 font-bold'
                  : 'border-zinc-800 text-zinc-500 hover:text-zinc-300'
              }`}>
              {s.label}{s.items.length > 0 ? ` (${s.items.length})` : ''}
            </button>
          ))}
        </div>
      </div>
      {active && (
        <div className="px-3 py-2.5 max-h-44 overflow-y-auto space-y-1.5" style={{ scrollbarWidth: 'thin', scrollbarColor: '#3f3f46 transparent' }}>
          {active.items.length === 0 ? (
            <p className="text-[10px] text-zinc-600 italic text-center py-3">Sin actividad.</p>
          ) : (
            active.items.map((item, i) => (
              <motion.div key={i}
                initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.03 }}
                className="flex items-start gap-2">
                <span className="text-sm shrink-0 leading-none mt-px">{item.icon}</span>
                <span className={`text-[10px] leading-relaxed ${item.cls || 'text-zinc-400'}`}>{item.text}</span>
              </motion.div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

// ── Sección Inicio — Dashboard & Gossip ──────────────────────────────────────
function InicioSection({ dashboard, market, player, turn, refresh, auditTurn, lastGlobalEvent, portfolio, audit, pendingOrders, pData, turnSummary, netWorth }) {

  const incMult  = 1 + 0.01 * Math.pow(Math.max(1, turn), 1.15);
  const costMult = Math.pow(1.02, Math.max(0, turn - 1));

  // Per-corp breakdown
  const corpBreakdown = portfolio.map(h => {
    const corp   = market.find(c => c.id === h.corp_id);
    if (!corp) return null;
    const myPct  = h.shares / (corp.total_shares || 100);
    const value  = myPct * Number(corp.fair_market_value);
    const div    = Number(corp.base_income || 0) * incMult * myPct;
    const maint  = myPct * Number(corp.fair_market_value) * 0.015 * costMult;
    const net    = div - maint;
    const isCeo  = corp.ceo_player_id === player.id;
    const sc     = scoreStyle(corpScore(corp, turn));
    return { ...h, corpName: corp.name, value, div, maint, net, isCeo, sc };
  }).filter(Boolean);

  const totalDiv    = corpBreakdown.reduce((s, c) => s + c.div, 0);
  const totalMaint  = corpBreakdown.reduce((s, c) => s + c.maint, 0);
  const netCashflow = totalDiv - totalMaint;

  // Starting net worth = portfolio value + cash (approx, since NW from server includes both)
  const cashValue   = Number(pData.liquid_cash);
  const portfolioValue = corpBreakdown.reduce((s, c) => s + c.value, 0);
  // Rough PnL vs initial 5000 cash
  const INITIAL_CAPITAL = 5000;
  const totalNW = netWorth || (cashValue + portfolioValue);
  const pnl = totalNW - INITIAL_CAPITAL;
  const isWinning = pnl >= 0;

  const danger = corpBreakdown.filter(h => h.net < 0);

  // Top picks
  const scoredMarket = market.map(c => ({ ...c, score: corpScore(c, turn) }));
  const topPicks = scoredMarket
    .filter(c => c.score >= 4 && ((c.total_shares || 100) - (c.owned_shares || 0)) > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);

  const isUp      = netCashflow >= 0;
  const flowRatio = (totalDiv + totalMaint) > 0 ? Math.min(100, (totalDiv / (totalDiv + totalMaint)) * 100) : 50;

  // Alert chips for the strip
  const alertChips = [
    ...danger.map(h => ({ icon: '📉', text: `${h.corpName} −${fmt(Math.abs(Math.round(h.net)))}/t`, color: 'red' })),
    ...pendingOrders.slice(0, 2).map(o => ({
      icon: o.order_type === 'BUY_SHARES' ? '📥' : '📤',
      text: `${o.order_type === 'BUY_SHARES' ? '+' : '-'}${o.shares}sh ${o.corp_name || ''}`.trim(),
      color: 'amber',
    })),
    ...(lastGlobalEvent ? [{ icon: '🌐', text: lastGlobalEvent.label || 'Evento global', color: 'indigo' }] : []),
  ];

  const [auditOpen, setAuditOpen] = useState(false);
  const [gossipSection, setGossipSection] = useState('mercado');

  // Build gossip events from turnSummary
  const gossipSections = turnSummary ? [
    {
      id: 'mercado', label: '💰 Mercado',
      items: (() => {
        const trades = turnSummary.trades || [];
        // group by type+corp
        const grouped = {};
        for (const t of trades) {
          const k = t.type + ':' + t.corp;
          if (!grouped[k]) grouped[k] = { ...t, qty: 0 };
          grouped[k].qty += t.qty;
        }
        return Object.values(grouped).map(t => ({
          icon: t.type === 'BUY' ? '📈' : '📉',
          text: `${t.qty} acciones de ${t.corp} — ${t.type === 'BUY' ? 'Compra' : 'Venta'}`,
          cls: t.type === 'BUY' ? 'text-lime-400' : 'text-red-400',
        }));
      })(),
    },
    {
      id: 'eventos', label: '⚡ Eventos',
      items: (() => {
        const ev = turnSummary.events || [];
        const lines = [];
        if (turnSummary.globalEvent) lines.push({ icon: '🌐', text: turnSummary.globalEvent.label + ' — ' + (turnSummary.globalEvent.desc || ''), cls: 'text-indigo-300' });
        for (const e of ev) {
          if (e.type === 'CHAPTER_11') lines.push({ icon: '💀', text: `${e.username} cayó en Chapter 11`, cls: 'text-red-400' });
          if (e.type === 'ALLIANCE_BROKEN') lines.push({ icon: '💔', text: `Alianza rota (acción hostil en ${e.corp})`, cls: 'text-orange-400' });
          if (e.type === 'PATENT_EXPIRED') lines.push({ icon: '🔓', text: `Patente ${e.node_id} caducó → Open Source`, cls: 'text-cyan-400' });
          if (e.type === 'TRANSIT_RENT') lines.push({ icon: '🚶', text: `${e.username} aterrizó en ${e.corp} — alquiler ${fmt(e.rent)}`, cls: 'text-zinc-400' });
        }
        return lines;
      })(),
    },
    {
      id: 'nissai', label: '🥷 Nissai',
      items: (turnSummary.nissaiResults || []).map(r => {
        if (r.type === 'AUDIT') return { icon: '🕵️', text: `${r.target} auditado — -$${r.amount?.toFixed(0)}`, cls: 'text-yellow-400' };
        if (r.type === 'HACK')  return { icon: '💻', text: `${r.target} hackeado — ${r.amount?.toFixed(0)} IC robado`, cls: 'text-cyan-400' };
        if (r.type === 'BLACKOUT') return { icon: '⚡', text: `Corte de Luz: ${r.corp} — divs anulados`, cls: 'text-orange-400' };
        if (r.type === 'RUMOR')    return { icon: '📰', text: `Rumor: ${r.corp} cayó -10% FMV`, cls: 'text-pink-400' };
        if (r.type === 'FISCO')    return { icon: '📋', text: `${r.target} perdió exenciones fiscales`, cls: 'text-red-400' };
        return { icon: '🥷', text: JSON.stringify(r), cls: 'text-zinc-500' };
      }),
    },
    {
      id: 'casino', label: '🎰 Casino',
      items: (turnSummary.casinoResults || []).map(r => ({
        icon: r.result === 'JACKPOT' ? '🎰' : r.result === 'WIN' ? '💰' : r.result === 'SMALL' ? '✨' : '💀',
        text: `${r.player} — ${r.label} · apostó ${fmt(r.betAmount)} → ${r.payout > 0 ? '+' + fmt(r.payout) : 'perdió todo'}`,
        cls: r.payout > r.betAmount ? 'text-lime-400' : r.payout > 0 ? 'text-yellow-400' : 'text-red-400',
      })),
    },
    {
      id: 'oraculo', label: '🔮 Oráculo',
      items: (turnSummary.oracleResults || []).map(r => ({
        icon: r.result === 'WIN' ? '🏆' : r.result === 'TIE' ? '🤝' : '💸',
        text: `${r.player} · ${r.corp} ${r.direction} · ${r.result} — ${r.payoutIc > 0 ? '+' + r.payoutIc + ' IC' : r.result === 'LOSS' ? '-' + r.icBet + ' IC' : 'reembolso'}`,
        cls: r.result === 'WIN' ? 'text-lime-400' : r.result === 'TIE' ? 'text-cyan-400' : 'text-red-400',
      })),
    },
    {
      id: 'tech', label: '⚗️ Tech',
      items: (turnSummary.techResults || []).map(r => ({
        icon: r.type === 'TECH_UNLOCKED' ? (r.status === 'PATENT' ? '🔐' : '🌐') : '❌',
        text: r.type === 'TECH_UNLOCKED'
          ? `${r.player} desbloqueó ${r.node} (${r.status === 'PATENT' ? 'Patente' : 'Open Source'})`
          : r.type === 'TECH_CONFLICT'
          ? `${r.player} perdió WEGO a ${r.winner} por ${r.node}`
          : `${r.player} rechazado: ${r.node}`,
        cls: r.type === 'TECH_UNLOCKED' ? (r.status === 'PATENT' ? 'text-orange-300' : 'text-cyan-300') : 'text-red-400',
      })),
    },
  ] : [];

  const activeGossip = gossipSections.find(s => s.id === gossipSection);

  // IC generation estimate (base per turn + role bonus)
  const baseIcPerTurn = Math.round(30 + 2 * turn);
  const roleIcMult = pData.player_role === 'DATA_SCIENTIST' ? 1.5 : pData.player_role === 'ECONOMIST' ? 1.2 : 1.0;
  const estimatedIcThisTurn = Math.round(baseIcPerTurn * roleIcMult);
  const estimatedIcNextTurn = Math.round((30 + 2 * (turn + 1)) * roleIcMult);

  return (
    <div className="space-y-2">
      {/* ── HERO — Status del turno ── */}
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 260, damping: 28 }}
        className={`relative overflow-hidden rounded-2xl border px-4 pt-4 pb-3 ${
          isUp
            ? 'border-lime-500/25 bg-gradient-to-br from-lime-950/50 via-zinc-950 to-black'
            : 'border-red-500/25 bg-gradient-to-br from-red-950/50 via-zinc-950 to-black'
        }`}
        style={{ boxShadow: isUp ? '0 0 56px rgba(132,204,22,0.07)' : '0 0 56px rgba(239,68,68,0.07)' }}
      >
        {/* Decorative orb */}
        <div className={`absolute -top-8 -right-8 w-32 h-32 rounded-full blur-3xl pointer-events-none opacity-25 ${isUp ? 'bg-lime-400' : 'bg-red-400'}`} />

        <div className="relative z-10">
          {/* Status chip */}
          <div className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-[8px] font-mono uppercase tracking-wider mb-2.5 ${
            isUp
              ? 'border-lime-500/30 text-lime-400 bg-lime-500/10'
              : 'border-red-500/30 text-red-400 bg-red-500/10'
          }`}>
            <div className={`w-1.5 h-1.5 rounded-full animate-pulse ${isUp ? 'bg-lime-400' : 'bg-red-400'}`} />
            {isUp ? '▲ flujo positivo' : '▼ flujo negativo'} · T{turn}
          </div>

          {/* Big number + bar */}
          <div className="flex items-end gap-3 mb-3">
            <div>
              <div className={`text-[2.8rem] font-black font-mono leading-none tracking-tighter ${isUp ? 'text-lime-400' : 'text-red-400'}`}>
                {netCashflow >= 0 ? '+' : ''}{fmt(Math.round(netCashflow))}
              </div>
              <div className="text-[8px] font-mono text-zinc-600 mt-0.5 uppercase tracking-widest">flujo / turno</div>
            </div>
            {corpBreakdown.length > 0 && (
              <div className="flex-1 pb-1.5 space-y-1 min-w-0">
                <div className="flex justify-between text-[8px] font-mono">
                  <span className="text-lime-500">▲ {fmt(Math.round(totalDiv))}</span>
                  <span className="text-red-500">▼ {fmt(Math.round(totalMaint))}</span>
                </div>
                <div className="w-full h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                  <motion.div
                    className="h-full bg-lime-500 rounded-full"
                    initial={{ width: 0 }}
                    animate={{ width: `${flowRatio}%` }}
                    transition={{ duration: 1, ease: 'easeOut', delay: 0.2 }}
                  />
                </div>
              </div>
            )}
          </div>

          {/* 3-stat pills */}
          <div className="grid grid-cols-3 gap-1.5">
            <StatPill label="Portafolio" value={fmt(Math.round(portfolioValue))} color="cyan" />
            <StatPill label="Cash" value={fmt(Math.round(cashValue))} color={cashValue > 2000 ? 'lime' : cashValue > 300 ? 'amber' : 'red'} />
            <StatPill label="IC / turno" value={`+${estimatedIcThisTurn}`} color="orange" />
          </div>
        </div>
      </motion.div>

      {/* ── ALERT STRIP ── */}
      {alertChips.length > 0 && (
        <div className="overflow-x-auto -mx-2 px-2" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
          <motion.div
            className="flex gap-1.5 pb-0.5"
            style={{ width: 'max-content' }}
            initial={{ opacity: 0, x: 10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.3, delay: 0.15 }}
          >
            {alertChips.map((a, i) => <AlertChip key={i} {...a} />)}
          </motion.div>
        </div>
      )}

      {/* ── MIS POSICIONES — horizontal scroll ── */}
      {corpBreakdown.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[9px] font-mono uppercase text-zinc-500 tracking-wider flex items-center gap-1.5">
              <Building2 className="h-3 w-3" /> Mis posiciones · {corpBreakdown.length} corps
            </span>
            <span className="text-[8px] font-mono text-zinc-700">← deslizá →</span>
          </div>
          <div className="overflow-x-auto -mx-2 px-2" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
            <div className="flex gap-2 pb-1" style={{ width: 'max-content' }}>
              {corpBreakdown.map((h, i) => <PositionCard key={h.corp_id} holding={h} index={i} />)}
            </div>
          </div>
        </div>
      )}

      {/* ── TOP PICKS ── */}
      {topPicks.length > 0 && (
        <div>
          <div className="text-[9px] font-mono uppercase text-zinc-500 tracking-wider mb-1.5">🔥 Picks del momento</div>
          <div className="space-y-1.5">
            {topPicks.map(c => <MiniCorpCard key={c.id} corp={c} player={player} refresh={refresh} />)}
          </div>
        </div>
      )}

      {/* Danger holdings — already shown in alert strip + position cards, no extra card needed */}

      {/* ── COLA DE ÓRDENES ── */}
      {pendingOrders.length > 0 && (
        <div className="bg-zinc-950 border border-zinc-900 rounded-xl overflow-hidden">
          <div className="px-3 py-2 border-b border-zinc-900/60 flex items-center gap-2">
            <ShoppingCart className="h-3 w-3 text-orange-400" />
            <span className="text-[9px] font-mono uppercase text-orange-400 font-bold tracking-wider">Cola · T{turn}</span>
            <span className="ml-auto text-[8px] font-mono text-zinc-700">{pendingOrders.length} orden{pendingOrders.length !== 1 ? 'es' : ''}</span>
          </div>
          <div className="px-3 py-2 space-y-1.5">
            <AnimatePresence>
              {pendingOrders.map(o => (
                <ActionReceipt key={o.id} order={o} onCancel={async (id) => {
                  try { await api('orders/' + id, { method: 'DELETE' }); toast.success('Cancelada'); refresh(); }
                  catch (e) { toast.error(e.message); }
                }} />
              ))}
            </AnimatePresence>
          </div>
        </div>
      )}

      {/* Gossip Feed — turn summary */}
      {gossipSections.length > 0 && <GossipFeed gossipSections={gossipSections} auditTurn={auditTurn} />}

      {/* Personal Audit (collapsible) */}
      <div className="bg-zinc-950 border border-zinc-900 rounded-xl overflow-hidden">
        <button
          onClick={() => setAuditOpen(o => !o)}
          className="w-full flex items-center justify-between px-3 py-2.5 hover:bg-zinc-900/40 transition-colors"
        >
          <span className="text-[9px] font-mono uppercase tracking-wider text-zinc-500 flex items-center gap-1.5">
            <History className="h-3 w-3 text-zinc-600" /> Mi Auditoría · T#{auditTurn || '—'}
          </span>
          <div className="flex items-center gap-1.5">
            {audit.length > 0 && (
              <span className="text-[8px] font-mono text-zinc-700">{audit.length} mov.</span>
            )}
            {auditOpen ? <ChevronDown className="h-3.5 w-3.5 text-zinc-600" /> : <ChevronRight className="h-3.5 w-3.5 text-zinc-600" />}
          </div>
        </button>
        <AnimatePresence>
          {auditOpen && (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.18 }} className="overflow-hidden">
              <div className="border-t border-zinc-900/60 px-3 pb-3 pt-2">
                {audit.length === 0 ? (
                  <p className="text-[10px] text-zinc-600 italic text-center py-3">Sin movimientos este turno.</p>
                ) : (
                  <div className="space-y-0 max-h-48 overflow-y-auto" style={{ scrollbarWidth: 'thin', scrollbarColor: '#3f3f46 transparent' }}>
                    {audit.map((t, i) => (
                      <motion.div key={i}
                        initial={{ opacity: 0, x: -4 }} animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: i * 0.025 }}
                        className="flex items-center justify-between py-1.5 border-b border-zinc-900/50 last:border-0"
                      >
                        <div className="flex items-center gap-1.5 flex-1 min-w-0">
                          <TxBadge type={t.tx_type} />
                          <span className="text-zinc-500 text-[10px] truncate">{t.description}</span>
                        </div>
                        <span className={`font-mono font-bold text-[11px] shrink-0 ${Number(t.amount) >= 0 ? 'text-lime-400' : 'text-red-400'}`}>
                          {Number(t.amount) >= 0 ? '+' : ''}{fmtDec(t.amount)}
                        </span>
                      </motion.div>
                    ))}
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

// ── Sparkline Generator (deterministic from corp props) ──────────────────────
function generateSparkline(corp) {
  // Seed from corp name chars + score
  const nameSum = (corp.name || '').split('').reduce((a, c, i) => a + c.charCodeAt(0) * (i + 1), 0);
  let s = (nameSum * 31 + corp.score * 137) & 0x7fffffff;
  const rand = () => { s = (s * 1664525 + 1013904223) & 0x7fffffff; return s / 0x7fffffff; };

  const W = 72; const H = 24; const N = 9;
  const trend = (corp.score - 2.5) * 0.04; // -0.1 to +0.1
  let y = 0.45 + rand() * 0.1;
  const ys = [y];
  for (let i = 1; i < N; i++) {
    y = Math.max(0.05, Math.min(0.95, y + trend + (rand() - 0.46) * 0.13));
    ys.push(y);
  }
  const minY = Math.min(...ys); const maxY = Math.max(...ys); const range = maxY - minY || 0.1;
  const coords = ys.map((v, i) => {
    const px = ((i / (N - 1)) * W).toFixed(1);
    const py = (H - ((v - minY) / range) * (H - 4) - 2).toFixed(1);
    return [px, py];
  });
  // Build SVG path d string (M + L commands) for motion.path pathLength animation
  const d = coords.map(([px, py], i) => `${i === 0 ? 'M' : 'L'}${px},${py}`).join(' ');
  // Also keep pts for the end-dot calculation
  const pts = coords.map(([px, py]) => `${px},${py}`).join(' ');
  const isUp = ys[N - 1] >= ys[0];
  return { d, pts, isUp, color: isUp ? '#84cc16' : '#f87171' };
}

// ── Score color palette ───────────────────────────────────────────────────────
function scoreStyle(score) {
  if (score >= 5) return { accent: 'text-lime-400',  border: 'border-lime-500/35',  bar: 'bg-lime-400',   bg: 'bg-lime-500/10',   glow: 'shadow-[0_0_12px_rgba(132,204,22,0.12)]' };
  if (score >= 4) return { accent: 'text-cyan-400',  border: 'border-cyan-500/35',  bar: 'bg-cyan-400',   bg: 'bg-cyan-500/10',   glow: 'shadow-[0_0_12px_rgba(34,211,238,0.10)]' };
  if (score >= 3) return { accent: 'text-amber-400', border: 'border-amber-500/30', bar: 'bg-amber-400',  bg: 'bg-amber-500/10',  glow: '' };
  if (score >= 2) return { accent: 'text-orange-400',border: 'border-orange-500/25',bar: 'bg-orange-400', bg: 'bg-orange-500/10', glow: '' };
  return                 { accent: 'text-zinc-500',  border: 'border-zinc-800',      bar: 'bg-zinc-600',   bg: 'bg-zinc-800/40',   glow: '' };
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
        <SmartMarketTab market={market} player={player} portfolio={portfolio} turn={turn} refresh={refresh} playerLevel={computeLevel(Number(pData.total_ic_spent || 0))} />
      )}
      {tab === 'portfolio' && (
        <div className="space-y-2">
          <div className="flex items-start gap-2 bg-zinc-900/40 border border-zinc-800 rounded-lg px-3 py-2">
            <span className="text-base leading-none shrink-0 mt-0.5">💼</span>
            <p className="text-[10px] text-zinc-500 leading-relaxed">
              Tus posiciones actuales. El <span className="text-lime-400">net/turno</span> = dividendo − mantenimiento. Holdings en <span className="text-red-400">rojo</span> te están costando plata — considerá vender.
            </p>
          </div>
          <PortfolioSection portfolio={portfolio} market={market} player={player} turn={turn} refresh={refresh} />
        </div>
      )}
    </div>
  );
}

// ── Trading Math Helpers (per share economics) ───────────────────────────────
function tradingMath(corp, turn) {
  const incMult     = 1 + 0.01 * Math.pow(Math.max(1, turn), 1.15);
  const costMult    = Math.pow(1.02, Math.max(0, turn - 1));
  const fmv         = Number(corp.fair_market_value);
  const totalShares = corp.total_shares || 100;
  const sharePrice  = fmv / 100;
  const supply      = totalShares - (corp.owned_shares || 0);
  const supplyPct   = supply / totalShares;
  const divPerSh    = (Number(corp.base_income || 0) * incMult) / totalShares;
  const maintPerSh  = (fmv * 0.015 * costMult) / totalShares;
  const netPerSh    = divPerSh - maintPerSh;
  const roi         = sharePrice > 0 ? (netPerSh / sharePrice) * 100 : 0;
  return { fmv, totalShares, sharePrice, supply, supplyPct, divPerSh, maintPerSh, netPerSh, roi, incMult, costMult };
}

// ── Smart Market Tab ──────────────────────────────────────────────────────────
function SmartMarketTab({ market, player, portfolio, turn, refresh, playerLevel = 1 }) {
  const [filter,        setFilter]        = useState('all');
  const [expanded,      setExpanded]      = useState(null);
  const [showAnalytics, setShowAnalytics] = useState(false);

  const myCorpIds  = new Set(portfolio.map(p => p.corp_id));
  const isLockFn   = (c) => Number(c.required_level || 0) > 1 && playerLevel < Number(c.required_level || 0);

  // ── Quant: compute market median ROI (baseline for valuation tags) ──
  const allRois = market
    .map(c => tradingMath(c, turn).roi)
    .filter(r => Number.isFinite(r) && r !== 0)
    .sort((a, b) => a - b);
  const mktMedianRoi = allRois.length > 0 ? allRois[Math.floor(allRois.length / 2)] : 0;

  const scored = market
    .map(c => ({ ...c, score: corpScore(c, turn) }))
    .sort((a, b) => b.score - a.score || Number(b.fair_market_value) - Number(a.fair_market_value));

  const filtered = scored.filter(c => {
    if (filter === 'hot')    return c.score >= 4 && !isLockFn(c);
    if (filter === 'mine')   return myCorpIds.has(c.id);
    if (filter === 'locked') return isLockFn(c);
    return true;
  });

  const zonedView  = filter === 'all';
  const zoneHot    = filtered.filter(c => c.score >= 4 && !isLockFn(c));
  const zoneNormal = filtered.filter(c => c.score < 4  && !isLockFn(c));
  const zoneLocked = filtered.filter(c => isLockFn(c));

  const renderCard = (corp) => (
    <SmartCorpCard
      key={corp.id}
      corp={corp}
      player={player}
      myShares={portfolio.find(p => p.corp_id === corp.id)?.shares || 0}
      isExpanded={expanded === corp.id}
      onToggle={() => setExpanded(e => e === corp.id ? null : corp.id)}
      refresh={refresh}
      playerLevel={playerLevel}
      turn={turn}
      mktMedianRoi={mktMedianRoi}
    />
  );

  const ZoneLabel = ({ emoji, label, sub }) => (
    <div className="flex items-center gap-2 mb-2">
      <span className="text-[9px] font-mono uppercase tracking-widest font-bold text-zinc-400">{emoji} {label}</span>
      <div className="flex-1 h-px bg-gradient-to-r from-zinc-700/50 to-transparent" />
      {sub && <span className="text-[7px] font-mono text-zinc-700">{sub}</span>}
    </div>
  );

  return (
    <>
      {/* ── Analytics Modal (portal-style, z-60) ── */}
      <AnimatePresence>
        {showAnalytics && (
          <MarketAnalyticsDashboard market={market} turn={turn} onClose={() => setShowAnalytics(false)} />
        )}
      </AnimatePresence>

      <div className="space-y-3">
        {/* ── Terminal CTA ── */}
        <button
          onClick={() => setShowAnalytics(true)}
          className="w-full flex items-center justify-between px-4 py-3 rounded-2xl border border-cyan-500/20 bg-gradient-to-r from-cyan-950/30 via-zinc-950 to-black hover:border-cyan-500/40 hover:from-cyan-950/50 transition-all group active:scale-[0.99]"
        >
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-cyan-400/10 border border-cyan-500/25 flex items-center justify-center group-hover:bg-cyan-400/20 transition-colors shrink-0">
              <BarChart2 className="h-4 w-4 text-cyan-400" />
            </div>
            <div className="text-left">
              <div className="text-xs font-black text-white leading-tight">Quant Terminal</div>
              <div className="text-[8px] font-mono text-cyan-600/80 mt-0.5">Oportunidades · Trampas de Valor · Distribución ROI</div>
            </div>
          </div>
          <div className="flex items-center gap-1 text-cyan-500 shrink-0">
            <span className="hidden sm:block text-[8px] font-mono">Abrir</span>
            <span className="text-sm">→</span>
          </div>
        </button>

        {/* ── Filter pills ── */}
        <div className="flex gap-1.5 flex-wrap items-center">
          {[['all','Todos'],['hot','🔥 Hot'],['mine','Mis corps'],['locked','🔒 Avanzadas']].map(([id, label]) => (
            <button
              key={id}
              onClick={() => setFilter(id)}
              className={`px-3 py-1.5 text-[9px] font-mono uppercase rounded-full border transition-all ${
                filter === id
                  ? 'bg-cyan-400/20 border-cyan-500/50 text-cyan-300 font-bold'
                  : 'border-zinc-800 text-zinc-500 hover:text-zinc-300 hover:border-zinc-700'
              }`}
            >{label}</button>
          ))}
          <div className="ml-auto text-[9px] font-mono text-zinc-600">
            <span className="text-cyan-400 font-bold">{filtered.length}</span> corps
          </div>
        </div>

        {/* ── Corp list / zones ── */}
        {zonedView ? (
          <div className="space-y-4">
            {zoneHot.length > 0 && (
              <div>
                <ZoneLabel emoji="🔥" label="En Llamas" sub="score ≥4" />
                <div className="space-y-2">{zoneHot.map(renderCard)}</div>
              </div>
            )}
            {zoneNormal.length > 0 && (
              <div>
                <ZoneLabel emoji="📊" label="Mercado General" />
                <div className="space-y-2">{zoneNormal.map(renderCard)}</div>
              </div>
            )}
            {zoneLocked.length > 0 && (
              <div>
                <ZoneLabel emoji="🔒" label="Nivel Avanzado" />
                <div className="space-y-2 opacity-50">{zoneLocked.map(renderCard)}</div>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-2">{filtered.map(renderCard)}</div>
        )}
      </div>
    </>
  );
}

// ── Smart Corp Card — Trading Terminal aesthetic, zero layout-shift ──────────
function SmartCorpCard({ corp, player, myShares, isExpanded, onToggle, refresh, playerLevel = 1, turn = 1, mktMedianRoi = 0 }) {
  const [loading,   setLoading]   = useState(null);
  const [customQty, setCustomQty] = useState('');
  const [orderType, setOrderType] = useState('BUY_SHARES');

  const isCeo         = corp.ceo_player_id === player.id;
  const reqLevel      = Number(corp.required_level || 0);
  const isLevelLocked = reqLevel > 1 && playerLevel < reqLevel;
  const ss            = isLevelLocked ? scoreStyle(0) : scoreStyle(corp.score || 0);
  const spark         = generateSparkline(corp);

  // ── Trading economics ──
  const m = tradingMath(corp, turn);
  const { fmv, totalShares, sharePrice, supply, supplyPct, divPerSh, maintPerSh, netPerSh, roi } = m;
  const buyPrice      = sharePrice * 1.03;
  const sellPrice     = sharePrice * 0.97;

  // Valuation flag (trader's tag): cheap vs expensive vs neutral
  const valuation =
    isLevelLocked || mktMedianRoi === 0       ? null
    : roi > 0 && roi >= mktMedianRoi * 1.3 && supply > 0
        ? { kind: 'cheap',  label: 'BARATA', delta: ((roi / mktMedianRoi - 1) * 100) }
    : roi < 0
        ? { kind: 'bleed',  label: 'SANGRA', delta: roi }
    : roi >= 0 && roi < mktMedianRoi * 0.5
        ? { kind: 'pricey', label: 'CARA',   delta: ((roi / mktMedianRoi - 1) * 100) }
    : null;

  // Score → accent color for stripe & dots
  const accentStripe =
    isLevelLocked      ? 'bg-zinc-700/50'
    : corp.score >= 5  ? 'bg-lime-400'
    : corp.score >= 4  ? 'bg-cyan-400'
    : corp.score >= 3  ? 'bg-amber-400'
    : corp.score >= 2  ? 'bg-orange-400'
    :                    'bg-zinc-600';

  // Net-cashflow sign drives the supply bar color
  const supplyBarColor =
    supply === 0  ? 'bg-red-500'
    : supply < 10 ? 'bg-amber-400'
    : supply < 30 ? 'bg-zinc-400'
    :               'bg-zinc-500';

  const placeOrder = async (type, qty) => {
    const q = parseInt(qty, 10);
    if (!q || q <= 0) return toast.error('Cantidad inválida');
    if (isLevelLocked) return toast.error(`Requiere Nivel ${reqLevel}`);
    if (type === 'SELL_SHARES' && myShares < q) return toast.error(`Solo tenés ${myShares} acciones`);
    if (type === 'BUY_SHARES'  && supply  < q) return toast.error(`Solo hay ${supply} disponibles`);
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
    <div className={`rounded-2xl overflow-hidden transition-all duration-200 ${
      isLevelLocked
        ? 'bg-zinc-950/70 border border-zinc-800/40 opacity-55'
        : myShares > 0
          ? `bg-gradient-to-br from-zinc-900/85 via-zinc-950 to-black border ${ss.border} ${ss.glow}`
          : 'bg-gradient-to-br from-zinc-950 to-black border border-zinc-800/55 hover:border-zinc-700/80'
    }`}>
      <div className="flex">
        {/* Left accent stripe */}
        <div className={`w-[3px] shrink-0 self-stretch ${accentStripe}`} />

        <div className="flex-1 min-w-0">

          {/* ── Header ── */}
          <button onClick={onToggle} className="w-full text-left px-3 pt-3 pb-2 hover:bg-white/[0.02] transition-colors">
            <div className="flex items-start gap-2">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap mb-1">
                  <span className={`font-black text-[14px] leading-snug tracking-tight ${isLevelLocked ? 'text-zinc-500' : 'text-white'}`}>
                    {corp.name}
                  </span>
                  {isCeo && <Crown className="h-3 w-3 text-orange-400 shrink-0" />}
                  {myShares > 0 && !isLevelLocked && (
                    <span className={`text-[8px] font-mono font-bold px-1.5 py-0.5 rounded-full ${ss.bg} ${ss.accent} border ${ss.border}`}>
                      {myShares}sh
                    </span>
                  )}
                  {isLevelLocked && (
                    <span className="text-[8px] font-mono text-zinc-500 border border-zinc-700/40 bg-zinc-800/40 px-1.5 py-0.5 rounded-full">
                      🔒 L{reqLevel}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[8px] font-mono text-zinc-600 uppercase tracking-wide">{corp.district}</span>
                  <div className="flex gap-[3px] items-center">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <div key={i} className={`w-1.5 h-1.5 rounded-full transition-all ${i < (corp.score || 0) ? accentStripe : 'bg-zinc-800'}`} />
                    ))}
                  </div>
                  {corp.ceo_name && (
                    <span className="text-[7px] font-mono text-zinc-700 truncate">CEO: {corp.ceo_name}</span>
                  )}
                </div>
              </div>

              {/* Right: FMV + sparkline */}
              <div className="shrink-0 flex flex-col items-end gap-0.5">
                <span className={`text-[15px] font-black font-mono leading-none tabular-nums ${isLevelLocked ? 'text-zinc-600' : ss.accent}`}>
                  {fmt(fmv)}
                </span>
                {!isLevelLocked && (
                  <svg width="68" height="20" className="overflow-visible mt-0.5">
                    <motion.path
                      d={spark.d}
                      fill="none"
                      stroke={spark.color}
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      opacity="0.9"
                      initial={{ pathLength: 0 }}
                      animate={{ pathLength: 1 }}
                      transition={{ duration: 0.75, ease: 'easeOut' }}
                    />
                    {(() => {
                      const last = spark.pts.split(' ').pop().split(',');
                      return (
                        <motion.circle cx={last[0]} cy={last[1]} r="2.5" fill={spark.color}
                          initial={{ opacity: 0, scale: 0 }} animate={{ opacity: 1, scale: 1 }}
                          transition={{ delay: 0.65, duration: 0.2 }}
                        />
                      );
                    })()}
                  </svg>
                )}
              </div>
            </div>
          </button>

          {/* ── Trading metrics terminal (always visible unless locked) ── */}
          {!isLevelLocked && (
            <div className="px-3">
              {/* 3-cell terminal grid: PRECIO · DIV NETO · ROI */}
              <div className="grid grid-cols-3 gap-1.5 mb-2">
                <div className="bg-black/45 border border-zinc-900 rounded-lg px-2 py-1.5">
                  <div className="text-[10px] font-black font-mono text-white tabular-nums leading-none">{fmtDec(sharePrice)}</div>
                  <div className="text-[7px] font-mono text-zinc-600 leading-none mt-1">por acción</div>
                </div>
                <div className="bg-black/45 border border-zinc-900 rounded-lg px-2 py-1.5">
                  <div className={`text-[10px] font-black font-mono tabular-nums leading-none ${netPerSh >= 0 ? 'text-lime-400' : 'text-red-400'}`}>
                    {netPerSh >= 0 ? '+' : ''}{fmtDec(netPerSh)}
                  </div>
                  <div className="text-[7px] font-mono text-zinc-600 leading-none mt-1">div neto / t</div>
                </div>
                <div className={`rounded-lg px-2 py-1.5 border ${
                  valuation?.kind === 'cheap'           ? 'bg-lime-500/12 border-lime-500/35'
                  : valuation?.kind === 'bleed'         ? 'bg-red-500/12 border-red-500/35'
                  : valuation?.kind === 'pricey'        ? 'bg-amber-500/10 border-amber-500/30'
                  :                                       'bg-black/45 border-zinc-900'
                }`}>
                  <div className={`text-[10px] font-black font-mono tabular-nums leading-none ${roi >= 0 ? 'text-lime-400' : 'text-red-400'}`}>
                    {roi >= 0 ? '+' : ''}{roi.toFixed(2)}%
                  </div>
                  <div className="text-[7px] font-mono text-zinc-600 leading-none mt-1">ROI / turno</div>
                </div>
              </div>

              {/* Supply bar with explicit context */}
              <div className="mb-2">
                <div className="flex items-baseline justify-between mb-1">
                  <span className="text-[7px] font-mono uppercase text-zinc-600 tracking-wider">Oferta</span>
                  <span className={`text-[8px] font-mono font-bold ${supply === 0 ? 'text-red-400' : supply < 10 ? 'text-amber-400' : 'text-zinc-400'}`}>
                    {supply === 0 ? '🔴 AGOTADO' : `Quedan ${supply} de ${totalShares}`}
                  </span>
                </div>
                <div className="h-1 bg-zinc-900 rounded-full overflow-hidden">
                  <motion.div
                    className={`h-full rounded-full ${supplyBarColor}`}
                    initial={{ width: 0 }}
                    animate={{ width: `${supplyPct * 100}%` }}
                    transition={{ duration: 0.6, ease: 'easeOut' }}
                  />
                </div>
              </div>

              {/* Valuation chip */}
              {valuation && (
                <div className={`mb-2 inline-flex items-center gap-1.5 text-[8px] font-mono font-bold px-2 py-1 rounded-full border ${
                  valuation.kind === 'cheap'
                    ? 'bg-lime-500/15 border-lime-500/40 text-lime-300'
                    : 'bg-red-500/15 border-red-500/40 text-red-300'
                }`}>
                  <span>{valuation.kind === 'cheap' ? '🟢' : valuation.kind === 'bleed' ? '🩸' : '🔴'}</span>
                  <span className="tracking-wider">{valuation.label}</span>
                  {Math.abs(valuation.delta) >= 1 && (
                    <span className="opacity-70 font-normal">{valuation.delta > 0 ? '+' : ''}{valuation.delta.toFixed(0)}% vs mkt</span>
                  )}
                </div>
              )}

              {/* Quick-buy row + expand */}
              <div className="flex gap-1.5 pb-3">
                {[5, 10, 25].map(qty => (
                  <button
                    key={qty}
                    onClick={() => placeOrder('BUY_SHARES', qty)}
                    disabled={!!loading || supply < qty}
                    className="flex-1 py-2 rounded-xl border text-center font-mono font-bold transition-all active:scale-95 disabled:opacity-25 disabled:cursor-not-allowed bg-lime-400/8 hover:bg-lime-400/18 border-lime-500/20 hover:border-lime-500/35 text-lime-400"
                  >
                    {loading === `BUY_SHARES-${qty}` ? (
                      <Loader2 className="h-2.5 w-2.5 animate-spin mx-auto" />
                    ) : (
                      <>
                        <div className="text-[12px] font-black leading-none">+{qty}</div>
                        <div className="text-[7px] opacity-50 mt-0.5">{fmt(Math.round(qty * buyPrice))}</div>
                      </>
                    )}
                  </button>
                ))}
                <button
                  onClick={onToggle}
                  className={`px-3 py-2 rounded-xl border transition-all active:scale-95 flex items-center justify-center ${
                    isExpanded
                      ? 'border-zinc-600 bg-zinc-800/60 text-zinc-300'
                      : 'border-zinc-800 hover:border-zinc-700 text-zinc-600 hover:text-zinc-400'
                  }`}
                >
                  <ChevronDown className={`h-3.5 w-3.5 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`} />
                </button>
              </div>
            </div>
          )}

          {/* ── Expanded panel ── */}
          <AnimatePresence initial={false}>
            {isExpanded && (
              <motion.div
                key="detail"
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.22, ease: [0.04, 0.62, 0.23, 0.98] }}
                className="overflow-hidden"
              >
                {isLevelLocked ? (
                  <div className="px-3 pb-3 pt-1">
                    <div className="flex items-center gap-2 bg-zinc-900/60 rounded-xl px-3 py-2.5">
                      <span className="text-xl">🔒</span>
                      <div>
                        <p className="text-[9px] font-bold text-zinc-400">Nivel {reqLevel} requerido</p>
                        <p className="text-[8px] font-mono text-zinc-600">Nivel actual: {playerLevel}. Gastá más IC en el Lab.</p>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="border-t border-zinc-800/50 mx-3 mb-3 pt-3 space-y-3">
                    {/* Cashflow breakdown */}
                    <div>
                      <div className="text-[7px] font-mono uppercase text-zinc-600 mb-1.5 tracking-widest">Desglose por acción / turno</div>
                      <div className="grid grid-cols-3 gap-1.5">
                        <div className="bg-lime-500/8 border border-lime-500/20 rounded-lg px-2 py-1.5 text-center">
                          <div className="text-[10px] font-black font-mono text-lime-400 tabular-nums">+{fmtDec(divPerSh)}</div>
                          <div className="text-[7px] font-mono text-zinc-600 mt-0.5">dividendo</div>
                        </div>
                        <div className="bg-red-500/8 border border-red-500/20 rounded-lg px-2 py-1.5 text-center">
                          <div className="text-[10px] font-black font-mono text-red-400 tabular-nums">−{fmtDec(maintPerSh)}</div>
                          <div className="text-[7px] font-mono text-zinc-600 mt-0.5">mantenim.</div>
                        </div>
                        <div className={`rounded-lg px-2 py-1.5 text-center border ${netPerSh >= 0 ? 'bg-lime-500/12 border-lime-500/35' : 'bg-red-500/12 border-red-500/35'}`}>
                          <div className={`text-[10px] font-black font-mono tabular-nums ${netPerSh >= 0 ? 'text-lime-400' : 'text-red-400'}`}>
                            = {netPerSh >= 0 ? '+' : ''}{fmtDec(netPerSh)}
                          </div>
                          <div className="text-[7px] font-mono text-zinc-600 mt-0.5">neto</div>
                        </div>
                      </div>
                    </div>

                    {/* SELL quick buttons */}
                    {myShares > 0 && (
                      <div>
                        <div className="text-[7px] font-mono uppercase text-zinc-600 mb-1.5 flex items-center gap-1">
                          <TrendingDown className="h-2 w-2 text-red-400" /> Vender · spread −3%
                        </div>
                        <div className="grid grid-cols-3 gap-1.5">
                          {[...new Set([Math.min(5, myShares), Math.min(10, myShares), myShares])].filter(v => v > 0).map(qty => (
                            <button key={qty} onClick={() => placeOrder('SELL_SHARES', qty)}
                              disabled={!!loading}
                              className="flex flex-col items-center py-2 bg-red-500/8 hover:bg-red-500/18 border border-red-500/25 hover:border-red-500/40 rounded-xl text-red-300 disabled:opacity-40 transition-colors active:scale-95">
                              <span className="text-[11px] font-black">{qty === myShares && qty > 10 ? 'Todo' : `-${qty}`}</span>
                              <span className="text-[7px] font-mono opacity-60 mt-0.5">~{fmt(Math.round(qty * sellPrice))}</span>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Custom order */}
                    <div className="flex gap-1.5">
                      <select value={orderType} onChange={e => setOrderType(e.target.value)}
                        className="bg-zinc-900 border border-zinc-800 text-white text-[9px] font-mono rounded-xl px-2 h-9 shrink-0 appearance-none">
                        <option value="BUY_SHARES">Comprar</option>
                        <option value="SELL_SHARES" disabled={myShares === 0}>Vender{myShares === 0 ? ' (sin)' : ''}</option>
                      </select>
                      <Input
                        type="number" min="1" max={orderType === 'SELL_SHARES' ? myShares : supply}
                        value={customQty} onChange={e => setCustomQty(e.target.value)}
                        placeholder="Cant." className="bg-black border-zinc-800 text-white font-mono h-9 text-xs rounded-xl flex-1 min-w-0"
                      />
                      <Button onClick={() => placeOrder(orderType, customQty)}
                        disabled={!!loading || !customQty || (orderType === 'SELL_SHARES' && myShares === 0)}
                        size="sm"
                        className={`shrink-0 h-9 font-bold text-xs px-4 rounded-xl ${orderType === 'BUY_SHARES' ? 'bg-lime-400 hover:bg-lime-300 text-black' : 'bg-red-700 hover:bg-red-600 text-white'}`}>
                        {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : 'OK'}
                      </Button>
                    </div>

                    <div className="flex justify-between text-[7px] font-mono text-zinc-700">
                      <span>banda {fmt(Math.round(fmv * 0.5))}–{fmt(Math.round(fmv * 2.5))}</span>
                      <span>FMV · spread ±3%</span>
                    </div>
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>

        </div>
      </div>
    </div>
  );
}

// ── Quant Terminal — Actionable Analytics Dashboard ──────────────────────────
function MarketAnalyticsDashboard({ market, turn, onClose }) {
  // Compute per-share economics for every corp
  const scored = market.map(c => {
    const score = corpScore(c, turn);
    const m     = tradingMath(c, turn);
    return { ...c, ...m, score };
  });

  // Market median ROI = baseline for "cheap vs expensive"
  const validRois = scored.map(c => c.roi).filter(r => Number.isFinite(r) && r !== 0).sort((a, b) => a - b);
  const medianRoi = validRois.length > 0 ? validRois[Math.floor(validRois.length / 2)] : 0;

  // ── Oportunidades (Undervalued): top 3 ROI with supply available ──
  const oportunidades = [...scored]
    .filter(c => c.supply > 0 && c.roi > 0 && c.roi >= medianRoi * 1.2)
    .sort((a, b) => b.roi - a.roi)
    .slice(0, 3);

  // ── Trampas de Valor (Overvalued): worst 3 by ROI ──
  const trampas = [...scored]
    .filter(c => Number.isFinite(c.roi) && c.roi !== 0)
    .sort((a, b) => a.roi - b.roi)
    .slice(0, 3);

  // ── Capital por Distrito (FMV stack) ──
  const districtMap = {};
  for (const c of scored) {
    if (!c.district) continue;
    if (!districtMap[c.district]) districtMap[c.district] = { fmv: 0, count: 0, scoreSum: 0, roiSum: 0 };
    districtMap[c.district].fmv      += c.fmv;
    districtMap[c.district].count    += 1;
    districtMap[c.district].scoreSum += c.score;
    districtMap[c.district].roiSum   += c.roi;
  }
  const districts = Object.entries(districtMap)
    .map(([name, d]) => ({ name, ...d, avgScore: d.scoreSum / d.count, avgRoi: d.roiSum / d.count }))
    .sort((a, b) => b.fmv - a.fmv);
  const totalFmv = districts.reduce((s, d) => s + d.fmv, 0);

  // ── ROI Distribution histogram ──
  const buckets = [
    { label: '<0%',   color: 'bg-red-500',    text: 'text-red-400',    test: r => r < 0 },
    { label: '0-2%',  color: 'bg-zinc-500',   text: 'text-zinc-400',   test: r => r >= 0 && r < 2 },
    { label: '2-4%',  color: 'bg-amber-500',  text: 'text-amber-400',  test: r => r >= 2 && r < 4 },
    { label: '4-6%',  color: 'bg-cyan-500',   text: 'text-cyan-400',   test: r => r >= 4 && r < 6 },
    { label: '6%+',   color: 'bg-lime-500',   text: 'text-lime-400',   test: r => r >= 6 },
  ];
  const distrib = buckets.map(b => ({ ...b, count: scored.filter(c => b.test(c.roi)).length }));
  const maxBucket = Math.max(...distrib.map(b => b.count), 1);

  // District legend palette (institutional-feel)
  const districtPalette = [
    'bg-cyan-500',  'bg-lime-500',    'bg-orange-500', 'bg-pink-500',
    'bg-purple-500','bg-amber-500',   'bg-emerald-500','bg-fuchsia-500',
  ];

  return (
    <motion.div
      className="fixed inset-0 z-[60] flex flex-col bg-black/96"
      style={{ backdropFilter: 'blur(16px)' }}
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 16 }}
      transition={{ type: 'spring', stiffness: 320, damping: 32 }}
    >
      {/* Header */}
      <div className="shrink-0 border-b border-zinc-800/60 px-4 py-3 flex items-center justify-between bg-black/40">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-cyan-400/10 border border-cyan-500/25 flex items-center justify-center">
            <BarChart2 className="h-4 w-4 text-cyan-400" />
          </div>
          <div>
            <div className="text-[11px] font-black text-white tracking-tight">Quant Terminal</div>
            <div className="text-[8px] font-mono text-zinc-600 uppercase tracking-wider">
              T#{turn} · ROI mediano <span className="text-cyan-400">{medianRoi.toFixed(2)}%</span> · {scored.length} activos
            </div>
          </div>
        </div>
        <button onClick={onClose}
          className="w-8 h-8 rounded-full border border-zinc-700 flex items-center justify-center text-zinc-500 hover:text-white hover:border-zinc-500 transition-colors">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4" style={{ scrollbarWidth: 'thin', scrollbarColor: '#3f3f46 transparent' }}>

        {/* ── 🟢 OPORTUNIDADES (Undervalued) ── */}
        <motion.div
          initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}
          className="rounded-2xl overflow-hidden border border-lime-500/25 bg-gradient-to-br from-lime-950/35 via-zinc-950 to-black"
        >
          <div className="px-4 pt-3 pb-2 flex items-baseline justify-between">
            <div className="flex items-center gap-2">
              <span className="text-base">🟢</span>
              <div>
                <div className="text-xs font-black text-lime-300 tracking-tight">Oportunidades</div>
                <div className="text-[7px] font-mono text-lime-700/80 uppercase tracking-widest">undervalued · ROI ≥ mediana × 1.2</div>
              </div>
            </div>
            <span className="text-[7px] font-mono text-lime-700/80 uppercase tracking-wider">comprar</span>
          </div>
          {oportunidades.length === 0 ? (
            <p className="px-4 pb-3 text-[9px] text-zinc-600 italic text-center">Sin oportunidades claras este turno. El mercado está parejo.</p>
          ) : (
            <div className="px-2 pb-2">
              {oportunidades.map((c, i) => {
                const ss = scoreStyle(c.score);
                return (
                  <motion.div key={c.id}
                    initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.1 + i * 0.06 }}
                    className="flex items-center gap-2 px-2 py-2 rounded-xl hover:bg-white/[0.03] transition-colors">
                    <div className="w-6 h-6 rounded-lg bg-lime-500/15 border border-lime-500/30 flex items-center justify-center shrink-0">
                      <span className="text-[9px] font-black text-lime-400">#{i + 1}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className={`text-[10px] font-black truncate leading-none ${ss.accent}`}>{c.name}</div>
                      <div className="text-[8px] font-mono text-zinc-500 leading-none mt-0.5 truncate">
                        {c.district} · {c.supply} disp · {fmtDec(c.sharePrice)}/sh
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-[12px] font-black font-mono text-lime-400 tabular-nums leading-none">+{c.roi.toFixed(2)}%</div>
                      {medianRoi > 0 && (
                        <div className="text-[7px] font-mono text-lime-700/80 mt-0.5">{((c.roi / medianRoi - 1) * 100).toFixed(0)}% vs mkt</div>
                      )}
                    </div>
                  </motion.div>
                );
              })}
            </div>
          )}
        </motion.div>

        {/* ── 🔴 TRAMPAS DE VALOR (Overvalued) ── */}
        <motion.div
          initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
          className="rounded-2xl overflow-hidden border border-red-500/25 bg-gradient-to-br from-red-950/35 via-zinc-950 to-black"
        >
          <div className="px-4 pt-3 pb-2 flex items-baseline justify-between">
            <div className="flex items-center gap-2">
              <span className="text-base">🔴</span>
              <div>
                <div className="text-xs font-black text-red-300 tracking-tight">Trampas de Valor</div>
                <div className="text-[7px] font-mono text-red-700/80 uppercase tracking-widest">overvalued · ROI bajo / negativo</div>
              </div>
            </div>
            <span className="text-[7px] font-mono text-red-700/80 uppercase tracking-wider">vender / evitar</span>
          </div>
          <div className="px-2 pb-2">
            {trampas.map((c, i) => {
              const ss = scoreStyle(c.score);
              const bleed = c.netPerSh * c.totalShares; // total bleed across all shares of corp
              return (
                <motion.div key={c.id}
                  initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.15 + i * 0.06 }}
                  className="flex items-center gap-2 px-2 py-2 rounded-xl hover:bg-white/[0.03] transition-colors">
                  <div className="w-6 h-6 rounded-lg bg-red-500/15 border border-red-500/30 flex items-center justify-center shrink-0">
                    <span className="text-[10px] font-black text-red-400">⚠</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className={`text-[10px] font-black truncate leading-none ${ss.accent}`}>{c.name}</div>
                    <div className="text-[8px] font-mono text-zinc-500 leading-none mt-0.5 truncate">
                      {c.district} · {fmtDec(c.sharePrice)}/sh · maint {fmtDec(c.maintPerSh)}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className={`text-[12px] font-black font-mono tabular-nums leading-none ${c.roi < 0 ? 'text-red-400' : 'text-amber-400'}`}>
                      {c.roi >= 0 ? '+' : ''}{c.roi.toFixed(2)}%
                    </div>
                    <div className="text-[7px] font-mono text-red-700/80 mt-0.5">
                      {bleed < 0 ? `sangra ${fmt(Math.abs(Math.round(bleed)))}/t` : 'rinde poco'}
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </motion.div>

        {/* ── 📊 CAPITAL POR DISTRITO (stacked bar) ── */}
        {districts.length > 0 && (
          <div className="bg-zinc-950/60 border border-zinc-800/50 rounded-2xl p-4">
            <div className="mb-3">
              <div className="text-xs font-black text-white">Capital por Distrito</div>
              <div className="text-[8px] font-mono text-zinc-600 mt-0.5">FMV total · {fmt(Math.round(totalFmv))} en circulación</div>
            </div>
            {/* Stacked horizontal bar */}
            <div className="h-3 bg-zinc-900 rounded-full overflow-hidden flex mb-3">
              {districts.map((d, i) => (
                <motion.div
                  key={d.name}
                  className={`h-full ${districtPalette[i % districtPalette.length]}`}
                  initial={{ width: 0 }}
                  animate={{ width: `${(d.fmv / totalFmv) * 100}%` }}
                  transition={{ duration: 0.6, delay: 0.2 + i * 0.05, ease: 'easeOut' }}
                  title={d.name}
                />
              ))}
            </div>
            {/* Legend with avg ROI per district */}
            <div className="space-y-1.5">
              {districts.map((d, i) => (
                <div key={d.name} className="flex items-center gap-2">
                  <div className={`w-2 h-2 rounded-sm shrink-0 ${districtPalette[i % districtPalette.length]}`} />
                  <span className="text-[9px] font-mono text-zinc-300 truncate flex-1 min-w-0">{d.name}</span>
                  <span className="text-[8px] font-mono text-zinc-600 shrink-0 w-12 text-right">{fmt(Math.round(d.fmv))}</span>
                  <span className="text-[8px] font-mono text-zinc-500 shrink-0 w-10 text-right">{((d.fmv / totalFmv) * 100).toFixed(0)}%</span>
                  <span className={`text-[8px] font-mono font-bold shrink-0 w-12 text-right tabular-nums ${d.avgRoi >= medianRoi ? 'text-lime-400' : 'text-red-400'}`}>
                    {d.avgRoi >= 0 ? '+' : ''}{d.avgRoi.toFixed(2)}%
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── 📈 DISTRIBUCIÓN DE ROI (histogram) ── */}
        <div className="bg-zinc-950/60 border border-zinc-800/50 rounded-2xl p-4">
          <div className="mb-3">
            <div className="text-xs font-black text-white">Distribución de ROI</div>
            <div className="text-[8px] font-mono text-zinc-600 mt-0.5">Cuántas corps caen en cada rango de rendimiento</div>
          </div>
          <div className="flex items-end gap-2 h-24 pb-2 border-b border-zinc-800/50">
            {distrib.map((b, i) => (
              <div key={b.label} className="flex-1 flex flex-col items-center justify-end gap-1">
                <div className={`text-[9px] font-mono font-black ${b.text}`}>{b.count}</div>
                <motion.div
                  className={`w-full ${b.color} rounded-t-md`}
                  initial={{ height: 0 }}
                  animate={{ height: `${(b.count / maxBucket) * 78}px` }}
                  transition={{ duration: 0.5, delay: 0.3 + i * 0.05, ease: 'easeOut' }}
                  style={{ minHeight: 3 }}
                />
              </div>
            ))}
          </div>
          <div className="flex gap-2 pt-1.5">
            {distrib.map(b => (
              <div key={b.label} className="flex-1 text-center text-[7px] font-mono text-zinc-600">{b.label}</div>
            ))}
          </div>
        </div>

        {/* ── 📋 TABLA MAESTRA — sortable, with ROI ── */}
        <div className="bg-zinc-950/60 border border-zinc-800/50 rounded-2xl p-4 pb-6">
          <div className="mb-3">
            <div className="text-xs font-black text-white">Tabla Maestra</div>
            <div className="text-[8px] font-mono text-zinc-600 mt-0.5">Todos los activos · ordenados por ROI desc</div>
          </div>
          <div className="overflow-x-auto" style={{ scrollbarWidth: 'thin', scrollbarColor: '#3f3f46 transparent' }}>
            <table className="w-full font-mono min-w-[340px]" style={{ fontSize: '9px' }}>
              <thead>
                <tr className="border-b border-zinc-800">
                  {[['Corp','text-left'],['Precio','text-right'],['Net/sh','text-right'],['ROI','text-right'],['Disp','text-right'],['◉','text-center']].map(([h, align]) => (
                    <th key={h} className={`text-zinc-600 font-normal pb-1.5 px-1 ${align}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[...scored].sort((a, b) => b.roi - a.roi).map(c => {
                  const ss = scoreStyle(c.score);
                  return (
                    <tr key={c.id} className="border-b border-zinc-900/30 last:border-0 hover:bg-white/[0.02] transition-colors">
                      <td className={`py-1.5 font-bold pr-2 ${ss.accent}`}>{c.name}</td>
                      <td className="py-1.5 text-right text-zinc-300 tabular-nums px-1">{fmtDec(c.sharePrice)}</td>
                      <td className={`py-1.5 text-right tabular-nums px-1 ${c.netPerSh >= 0 ? 'text-lime-400' : 'text-red-400'}`}>
                        {c.netPerSh >= 0 ? '+' : ''}{fmtDec(c.netPerSh)}
                      </td>
                      <td className={`py-1.5 text-right tabular-nums px-1 font-bold ${c.roi >= 0 ? 'text-lime-400' : 'text-red-400'}`}>
                        {c.roi >= 0 ? '+' : ''}{c.roi.toFixed(2)}%
                      </td>
                      <td className={`py-1.5 text-right tabular-nums px-1 ${c.supply === 0 ? 'text-red-400' : c.supply < 10 ? 'text-amber-400' : 'text-zinc-500'}`}>
                        {c.supply === 0 ? 'AGO' : c.supply}
                      </td>
                      <td className="py-1.5 text-center">
                        <div className="flex justify-center gap-px">
                          {Array.from({ length: 5 }).map((_, j) => (
                            <div key={j} className={`w-1.5 h-1.5 rounded-sm ${j < c.score ? ss.bar : 'bg-zinc-800'}`} />
                          ))}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

      </div>
    </motion.div>
  );
}

// ── Portfolio Section — Trader's Position Manager ────────────────────────────
function PortfolioSection({ portfolio, market, player, turn, refresh }) {
  const [loading, setLoading] = useState(null);

  // Build enriched positions sorted by value desc
  const positions = portfolio.map(s => {
    const corp = market.find(c => c.id === s.corp_id);
    if (!corp) return null;
    const m           = tradingMath(corp, turn);
    const myPct       = s.shares / m.totalShares;
    const value       = myPct * m.fmv;
    const div         = m.divPerSh   * s.shares;
    const maint       = m.maintPerSh * s.shares;
    const net         = m.netPerSh   * s.shares;
    const score       = corpScore(corp, turn);
    const ss          = scoreStyle(score);
    const isCeo       = corp.ceo_player_id === player.id;
    return { ...s, corp, ...m, myPct, value, div, maint, net, score, ss, isCeo, name: s.name || corp.name };
  }).filter(Boolean).sort((a, b) => b.value - a.value);

  const totalValue   = positions.reduce((s, p) => s + p.value, 0);
  const totalNet     = positions.reduce((s, p) => s + p.net, 0);
  const totalDiv     = positions.reduce((s, p) => s + p.div, 0);
  const totalMaint   = positions.reduce((s, p) => s + p.maint, 0);
  const winners      = positions.filter(p => p.net > 0).length;
  const losers       = positions.filter(p => p.net < 0).length;
  const ceoCount     = positions.filter(p => p.isCeo).length;
  const portfolioRoi = totalValue > 0 ? (totalNet / totalValue) * 100 : 0;

  const trade = async (corpId, qty, type) => {
    setLoading(`${type}-${corpId}-${qty}`);
    try {
      await api('orders', { method: 'POST', body: JSON.stringify({ player_id: player.id, order_type: type, corporation_id: corpId, shares: qty }) });
      const name = portfolio.find(p => p.corp_id === corpId)?.name || '';
      toast.success(`${type === 'BUY_SHARES' ? '+' : '-'}${qty} ${name}`);
      refresh();
    } catch (e) { toast.error(e.message); }
    finally { setLoading(null); }
  };

  if (positions.length === 0) {
    return (
      <div className="bg-zinc-950/60 border border-zinc-800/50 rounded-2xl p-8 text-center">
        <Building2 className="h-10 w-10 text-zinc-700 mx-auto mb-3" />
        <p className="text-zinc-300 text-sm font-bold mb-1">Sin posiciones abiertas</p>
        <p className="text-[10px] font-mono text-zinc-600">Andá al Mercado y comprá tu primera acción para empezar a generar cashflow.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">

      {/* ── Portfolio Hero — el resumen de un trader ── */}
      <motion.div
        initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 280, damping: 26 }}
        className={`relative overflow-hidden rounded-2xl border px-4 pt-3 pb-3 ${
          totalNet >= 0
            ? 'border-lime-500/25 bg-gradient-to-br from-lime-950/40 via-zinc-950 to-black'
            : 'border-red-500/25 bg-gradient-to-br from-red-950/40 via-zinc-950 to-black'
        }`}
        style={{ boxShadow: totalNet >= 0 ? '0 0 56px rgba(132,204,22,0.07)' : '0 0 56px rgba(239,68,68,0.07)' }}
      >
        <div className={`absolute -top-8 -right-8 w-32 h-32 rounded-full blur-3xl pointer-events-none opacity-25 ${totalNet >= 0 ? 'bg-lime-400' : 'bg-red-400'}`} />
        <div className="relative z-10">
          <div className="flex items-center gap-1.5 mb-2">
            <div className={`w-1.5 h-1.5 rounded-full animate-pulse ${totalNet >= 0 ? 'bg-lime-400' : 'bg-red-400'}`} />
            <span className="text-[8px] font-mono uppercase tracking-widest text-zinc-500">Portafolio · {positions.length} posicion{positions.length !== 1 ? 'es' : ''}</span>
          </div>
          <div className="flex items-end gap-3 mb-2.5">
            <div>
              <div className="text-[2.2rem] font-black font-mono leading-none tracking-tighter text-white tabular-nums">{fmt(Math.round(totalValue))}</div>
              <div className="text-[7px] font-mono text-zinc-600 mt-0.5 uppercase tracking-widest">valor en mercado</div>
            </div>
            <div className="flex-1 pb-1 text-right">
              <div className={`text-[15px] font-black font-mono leading-none tabular-nums ${totalNet >= 0 ? 'text-lime-400' : 'text-red-400'}`}>
                {totalNet >= 0 ? '+' : ''}{fmt(Math.round(totalNet))}
              </div>
              <div className="text-[7px] font-mono text-zinc-600 mt-0.5 uppercase tracking-widest">cashflow / turno</div>
              {totalValue > 0 && (
                <div className={`text-[8px] font-mono font-bold mt-1 ${portfolioRoi >= 0 ? 'text-lime-500' : 'text-red-500'}`}>
                  {portfolioRoi >= 0 ? '+' : ''}{portfolioRoi.toFixed(2)}% ROI
                </div>
              )}
            </div>
          </div>
          {/* 4 stat pills */}
          <div className="grid grid-cols-4 gap-1.5">
            <div className="bg-black/40 border border-zinc-900 rounded-lg px-2 py-1.5 text-center">
              <div className="text-[10px] font-black font-mono text-lime-400">{winners}</div>
              <div className="text-[7px] font-mono text-zinc-600">winners</div>
            </div>
            <div className="bg-black/40 border border-zinc-900 rounded-lg px-2 py-1.5 text-center">
              <div className="text-[10px] font-black font-mono text-red-400">{losers}</div>
              <div className="text-[7px] font-mono text-zinc-600">losers</div>
            </div>
            <div className="bg-black/40 border border-zinc-900 rounded-lg px-2 py-1.5 text-center">
              <div className="text-[10px] font-black font-mono text-amber-400">{ceoCount}</div>
              <div className="text-[7px] font-mono text-zinc-600">CEO</div>
            </div>
            <div className="bg-black/40 border border-zinc-900 rounded-lg px-2 py-1.5 text-center">
              <div className="text-[10px] font-black font-mono text-cyan-400">{fmt(Math.round(totalDiv))}</div>
              <div className="text-[7px] font-mono text-zinc-600">div bruto</div>
            </div>
          </div>
        </div>
      </motion.div>

      {/* ── Position Cards ── */}
      <div className="space-y-2">
        {positions.map((p, idx) => (
          <PositionRow key={p.corp_id} pos={p} idx={idx} loading={loading} onTrade={trade} />
        ))}
      </div>
    </div>
  );
}

// ── Single Position Row — terminal-style trader card ─────────────────────────
function PositionRow({ pos, idx, loading, onTrade }) {
  const { corp_id, name, shares, totalShares, fmv, value, net, div, maint, sharePrice, supply, ss, isCeo, score, corp } = pos;
  const myPctOfCorp = (shares / totalShares) * 100;
  const sellPrice   = sharePrice * 0.97;
  const buyPrice    = sharePrice * 1.03;
  const accentLeft  = net >= 0 ? 'bg-lime-400' : 'bg-red-400';

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
      transition={{ delay: idx * 0.04, type: 'spring', stiffness: 280, damping: 26 }}
      className={`rounded-2xl overflow-hidden bg-gradient-to-br from-zinc-900/85 via-zinc-950 to-black border ${ss.border} ${ss.glow}`}
    >
      <div className="flex">
        <div className={`w-[3px] shrink-0 self-stretch ${accentLeft}`} />
        <div className="flex-1 min-w-0 px-3 py-3">
          {/* Header */}
          <div className="flex items-start justify-between gap-2 mb-2.5">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
                <span className="font-black text-[14px] text-white leading-snug tracking-tight">{name}</span>
                {isCeo && <Crown className="h-3 w-3 text-orange-400 shrink-0" />}
                <span className={`text-[8px] font-mono font-bold px-1.5 py-0.5 rounded-full ${ss.bg} ${ss.accent} border ${ss.border}`}>
                  {shares}sh · {myPctOfCorp.toFixed(0)}%
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[8px] font-mono text-zinc-600 uppercase tracking-wide">{corp.district}</span>
                <div className="flex gap-[3px] items-center">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <div key={i} className={`w-1 h-1 rounded-full ${i < score ? ss.bar : 'bg-zinc-800'}`} />
                  ))}
                </div>
                <span className="text-[7px] font-mono text-zinc-700">{fmtDec(sharePrice)}/sh</span>
              </div>
            </div>
            <div className="text-right shrink-0">
              <div className="text-[15px] font-black font-mono leading-none text-white tabular-nums">{fmt(Math.round(value))}</div>
              <div className="text-[7px] font-mono text-zinc-600 mt-0.5 uppercase tracking-widest">valor</div>
            </div>
          </div>

          {/* Trading metrics — div / maint / net */}
          <div className="grid grid-cols-3 gap-1.5 mb-2.5">
            <div className="bg-black/45 border border-zinc-900 rounded-lg px-2 py-1.5">
              <div className="text-[10px] font-black font-mono text-lime-500/80 tabular-nums leading-none">+{fmt(Math.round(div))}</div>
              <div className="text-[7px] font-mono text-zinc-600 leading-none mt-1">dividendo</div>
            </div>
            <div className="bg-black/45 border border-zinc-900 rounded-lg px-2 py-1.5">
              <div className="text-[10px] font-black font-mono text-red-500/80 tabular-nums leading-none">−{fmt(Math.round(maint))}</div>
              <div className="text-[7px] font-mono text-zinc-600 leading-none mt-1">mantenim.</div>
            </div>
            <div className={`rounded-lg px-2 py-1.5 border ${net >= 0 ? 'bg-lime-500/12 border-lime-500/35' : 'bg-red-500/12 border-red-500/35'}`}>
              <div className={`text-[10px] font-black font-mono tabular-nums leading-none ${net >= 0 ? 'text-lime-400' : 'text-red-400'}`}>
                = {net >= 0 ? '+' : ''}{fmt(Math.round(net))}
              </div>
              <div className="text-[7px] font-mono text-zinc-600 leading-none mt-1">aporte / t</div>
            </div>
          </div>

          {/* Action buttons: split BUY (left) and SELL (right) */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <div className="text-[7px] font-mono uppercase text-zinc-600 tracking-wider mb-1 flex items-center gap-1">
                <TrendingUp className="h-2 w-2 text-lime-400" /> Comprar más
              </div>
              <div className="flex gap-1">
                {[5, 10].map(qty => (
                  <button key={qty}
                    onClick={() => onTrade(corp_id, qty, 'BUY_SHARES')}
                    disabled={!!loading || supply < qty}
                    className="flex-1 py-1.5 rounded-lg border text-center font-mono font-bold transition-all active:scale-95 disabled:opacity-25 bg-lime-400/8 hover:bg-lime-400/18 border-lime-500/20 hover:border-lime-500/35 text-lime-400">
                    {loading === `BUY_SHARES-${corp_id}-${qty}` ? (
                      <Loader2 className="h-2.5 w-2.5 animate-spin mx-auto" />
                    ) : (
                      <>
                        <div className="text-[10px] font-black leading-none">+{qty}</div>
                        <div className="text-[6px] opacity-50 mt-0.5">{fmt(Math.round(qty * buyPrice))}</div>
                      </>
                    )}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <div className="text-[7px] font-mono uppercase text-zinc-600 tracking-wider mb-1 flex items-center gap-1">
                <TrendingDown className="h-2 w-2 text-red-400" /> Vender
              </div>
              <div className="flex gap-1">
                {[Math.min(5, shares), Math.min(10, shares), shares].filter((v, i, a) => v > 0 && a.indexOf(v) === i).slice(0, 2).map(qty => (
                  <button key={qty}
                    onClick={() => onTrade(corp_id, qty, 'SELL_SHARES')}
                    disabled={!!loading}
                    className="flex-1 py-1.5 rounded-lg border text-center font-mono font-bold transition-all active:scale-95 disabled:opacity-25 bg-red-500/8 hover:bg-red-500/18 border-red-500/25 hover:border-red-500/40 text-red-400">
                    {loading === `SELL_SHARES-${corp_id}-${qty}` ? (
                      <Loader2 className="h-2.5 w-2.5 animate-spin mx-auto" />
                    ) : (
                      <>
                        <div className="text-[10px] font-black leading-none">{qty === shares && qty > 10 ? 'Todo' : `-${qty}`}</div>
                        <div className="text-[6px] opacity-50 mt-0.5">~{fmt(Math.round(qty * sellPrice))}</div>
                      </>
                    )}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

// ── Oráculo del Mercado Tab ───────────────────────────────────────────────────
function OracleTab({ player, market, ic, marketOpen, onChange }) {
  const [predictions, setPredictions] = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [submitting,  setSubmitting]  = useState(false);
  const [selectedCorp, setSelectedCorp] = useState('');
  const [direction, setDirection] = useState('UP');
  const [icBet, setIcBet] = useState('');

  const load = async () => {
    try {
      const d = await api('predictions');
      setPredictions(d.predictions || []);
    } catch (e) { toast.error(e.message); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const submit = async () => {
    if (!selectedCorp || !icBet) return toast.error('Seleccioná corp e IC a apostar');
    const bet = parseInt(icBet, 10);
    if (bet < 50 || bet > 1000) return toast.error('Mínimo 50 IC, máximo 1000 IC');
    if (bet > ic) return toast.error('IC insuficiente');
    setSubmitting(true);
    try {
      const res = await api('predictions', {
        method: 'POST',
        body: JSON.stringify({ player_id: player.id, corp_id: selectedCorp, ic_bet: bet, direction }),
      });
      toast.success(res.message || '🔮 Predicción registrada');
      setSelectedCorp(''); setIcBet('');
      await load();
      onChange?.();
    } catch (e) { toast.error(e.message); } finally { setSubmitting(false); }
  };

  const myPreds = predictions.filter(p => p.player_id === player.id);
  const otherPreds = predictions.filter(p => p.player_id !== player.id);

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="bg-gradient-to-r from-indigo-950/60 to-black border border-indigo-700/40 rounded-xl p-3 flex items-start gap-3">
        <span className="text-3xl shrink-0">🔮</span>
        <div>
          <div className="font-black text-indigo-300 uppercase tracking-widest text-sm">Oráculo del Mercado</div>
          <div className="text-[10px] font-mono text-indigo-500 mt-0.5">Apostá IC a la dirección del FMV · Win: ×2.2 · Tie (&lt;0.5%): reembolso · Loss: IC perdido</div>
        </div>
      </div>

      {/* Bet Form */}
      {marketOpen ? (
        <Card className="bg-zinc-950 border-zinc-900">
          <CardHeader className="py-2 px-3">
            <CardTitle className="text-indigo-400 font-mono uppercase text-xs">Nueva Predicción</CardTitle>
            <CardDescription className="text-zinc-500 text-[10px]">1 predicción por corp por turno · Todas son públicas</CardDescription>
          </CardHeader>
          <CardContent className="px-3 pb-3 space-y-2">
            <div>
              <Label className="text-zinc-400 font-mono text-[9px] uppercase">Corporación</Label>
              <select
                value={selectedCorp}
                onChange={e => setSelectedCorp(e.target.value)}
                className="w-full bg-black border border-zinc-800 text-white text-xs font-mono rounded-lg px-2 h-8 mt-0.5"
              >
                <option value="">Seleccioná corp...</option>
                {market.filter(c => !myPreds.some(p => p.corp_id === c.id)).map(c => (
                  <option key={c.id} value={c.id}>{c.name} — {fmt(Number(c.fair_market_value))}</option>
                ))}
              </select>
            </div>
            <div className="flex gap-2">
              <div className="flex-1">
                <Label className="text-zinc-400 font-mono text-[9px] uppercase">Dirección</Label>
                <div className="flex gap-1 mt-0.5">
                  {['UP','DOWN'].map(d => (
                    <button
                      key={d}
                      onClick={() => setDirection(d)}
                      className={`flex-1 py-1.5 text-[10px] font-mono font-bold rounded border transition-colors ${
                        direction === d
                          ? d === 'UP' ? 'bg-lime-500/20 border-lime-500/50 text-lime-300' : 'bg-red-500/20 border-red-500/50 text-red-300'
                          : 'border-zinc-800 text-zinc-500'
                      }`}
                    >
                      {d === 'UP' ? '📈 SUBE' : '📉 BAJA'}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex-1">
                <Label className="text-zinc-400 font-mono text-[9px] uppercase">IC (50-1000)</Label>
                <Input
                  type="number" min="50" max={Math.min(1000, ic)}
                  value={icBet} onChange={e => setIcBet(e.target.value)}
                  placeholder="IC"
                  className="bg-black border-zinc-800 text-white font-mono h-8 text-xs mt-0.5"
                />
              </div>
            </div>
            <Button
              onClick={submit}
              disabled={submitting || !selectedCorp || !icBet}
              className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold uppercase tracking-wider text-xs h-9"
            >
              {submitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : '🔮 Registrar Predicción'}
            </Button>
            <p className="text-[9px] font-mono text-zinc-600 text-center">IC disponible: {Math.round(ic).toLocaleString('es-AR')}</p>
          </CardContent>
        </Card>
      ) : (
        <div className="bg-zinc-900/50 border border-zinc-700/40 rounded-xl p-3 text-center text-zinc-500 text-xs font-mono">🌙 Oráculo cerrado — abre a las 09:00 ART</div>
      )}

      {/* My predictions */}
      {myPreds.length > 0 && (
        <Card className="bg-zinc-950 border-zinc-900">
          <CardHeader className="py-1.5 px-3">
            <CardTitle className="text-indigo-300 font-mono uppercase text-xs">Mis predicciones</CardTitle>
          </CardHeader>
          <CardContent className="px-3 pb-3 space-y-1.5">
            {myPreds.map(p => (
              <div key={p.id} className={`flex items-center gap-2 p-2 rounded border ${p.direction === 'UP' ? 'border-lime-700/30 bg-lime-950/10' : 'border-red-700/30 bg-red-950/10'}`}>
                <span className="text-sm">{p.direction === 'UP' ? '📈' : '📉'}</span>
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-bold text-white truncate">{p.corp_name}</div>
                  <div className="text-[9px] font-mono text-zinc-500">{p.ic_bet} IC · {p.direction}</div>
                </div>
                <div className={`text-[9px] font-mono font-bold ${p.direction === 'UP' ? 'text-lime-400' : 'text-red-400'}`}>{p.direction}</div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Public oracle board */}
      {otherPreds.length > 0 && (
        <Card className="bg-zinc-950 border-zinc-900">
          <CardHeader className="py-1.5 px-3">
            <CardTitle className="text-zinc-400 font-mono uppercase text-xs">📡 Predicciones públicas</CardTitle>
            <CardDescription className="text-zinc-600 text-[10px]">Todos pueden ver — creá meta-estrategias</CardDescription>
          </CardHeader>
          <CardContent className="px-3 pb-3 space-y-1">
            {otherPreds.map(p => (
              <div key={p.id} className="flex items-center gap-2 py-1 border-b border-zinc-900">
                <div className="w-5 h-5 rounded-full flex items-center justify-center text-[8px] font-black text-black shrink-0" style={{ backgroundColor: p.avatar_color || '#a3e635' }}>{(p.player_name || '?')[0]}</div>
                <span className="text-[10px] text-zinc-400 flex-1 truncate"><span className="text-white font-bold">{p.player_name}</span> · {p.corp_name}</span>
                <span className={`text-[9px] font-mono font-bold px-1.5 py-0.5 rounded border ${p.direction === 'UP' ? 'border-lime-500/30 text-lime-400 bg-lime-500/10' : 'border-red-500/30 text-red-400 bg-red-500/10'}`}>{p.direction}</span>
                <span className="text-[9px] font-mono text-zinc-500 shrink-0">{p.ic_bet} IC</span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {loading && <div className="text-zinc-600 text-xs text-center py-4">Cargando...</div>}
    </div>
  );
}

// ── Lobby Político Tab ────────────────────────────────────────────────────────
const LOBBY_TYPES = [
  { id: 'LOBBY_BULL',      name: 'Pump Mediático',    emoji: '📣', desc: 'Elegí una corp → sube +8% FMV al cierre del turno. Visible para todos.', ic_cost: 200, target: 'CORP'  },
  { id: 'LOBBY_BEAR',      name: 'Short Institucional',emoji: '🐻', desc: 'Cualquier corp baja -8% FMV al cierre del turno. Visible para todos.',   ic_cost: 300, target: 'CORP'  },
  { id: 'LOBBY_TAX_BREAK', name: 'Exención Fiscal',   emoji: '🏛️', desc: '+2 turnos de exención impositiva. Se revela en el gossip.', ic_cost: 350, target: 'SELF' },
];

function LobbyTab({ player, market, ic, marketOpen, onChange }) {
  const [data,       setData]       = useState(null);
  const [loading,    setLoading]    = useState(true);
  const [selected,   setSelected]   = useState(null);
  const [corpId,     setCorpId]     = useState('');
  const [submitting, setSubmitting] = useState(false);

  const load = async () => {
    try {
      const d = await api('lobby?player_id=' + player.id);
      setData(d);
    } catch (e) { toast.error(e.message); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const selectedDef = LOBBY_TYPES.find(l => l.id === selected);
  const canAfford = selectedDef ? ic >= selectedDef.ic_cost : false;
  const needsCorp = selectedDef?.target === 'CORP';
  const ready = selected && canAfford && (!needsCorp || !!corpId);

  const submit = async () => {
    if (!ready) return;
    setSubmitting(true);
    try {
      const res = await api('lobby', {
        method: 'POST',
        body: JSON.stringify({ player_id: player.id, lobby_type: selected, corp_id: needsCorp ? corpId : null }),
      });
      toast.success(res.message || '🏛️ Lobby encolado');
      setSelected(null); setCorpId('');
      await load(); onChange?.();
    } catch (e) { toast.error(e.message); } finally { setSubmitting(false); }
  };

  const cancel = async (lobbyId) => {
    try {
      const res = await api('lobby/' + lobbyId, { method: 'DELETE', body: JSON.stringify({ player_id: player.id }) });
      toast.success(`Cancelado · ${res.refunded_ic} IC reembolsado (50%)`);
      await load(); onChange?.();
    } catch (e) { toast.error(e.message); }
  };

  const allLobbies = data?.allLobbies || [];
  const myLobbies  = data?.myLobbies  || [];

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="bg-gradient-to-r from-teal-950/60 to-black border border-teal-700/40 rounded-xl p-3 flex items-start gap-3">
        <span className="text-3xl shrink-0">🏛️</span>
        <div className="flex-1 min-w-0">
          <div className="font-black text-teal-300 uppercase tracking-widest text-sm">Lobby Político</div>
          <div className="text-[10px] font-mono text-teal-500 mt-0.5">Gastá IC para mover el mercado o esquivar impuestos · Todo es público · Se ejecuta a medianoche</div>
        </div>
        <div className="text-[9px] font-mono text-zinc-500 shrink-0 text-right">{Math.round(ic).toLocaleString('es-AR')} IC</div>
      </div>

      {/* Type selector */}
      <div className="grid sm:grid-cols-3 gap-2">
        {LOBBY_TYPES.map(t => {
          const afford = ic >= t.ic_cost;
          const isActive = selected === t.id;
          const alreadyQueued = myLobbies.some(l => l.lobby_type === t.id);
          return (
            <motion.button key={t.id}
              onClick={() => { if (!afford || alreadyQueued) return; setSelected(isActive ? null : t.id); setCorpId(''); }}
              whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }} style={{ willChange: 'transform' }}
              className={`text-left p-3 rounded-lg border transition-all ${
                alreadyQueued ? 'border-teal-500/60 bg-teal-500/10 cursor-default'
                : isActive ? 'border-teal-500/50 bg-teal-500/10 shadow-[0_0_12px_rgba(20,184,166,0.15)]'
                : afford ? 'border-zinc-800 bg-zinc-900/40 hover:border-zinc-700'
                : 'border-zinc-900 bg-zinc-950/50 opacity-50 cursor-not-allowed'
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-lg">{t.emoji}</span>
                {alreadyQueued && <span className="text-[8px] font-mono text-teal-400 uppercase">✓ Encolado</span>}
                {isActive && !alreadyQueued && <div className="w-2 h-2 rounded-full bg-teal-400 animate-pulse" />}
              </div>
              <div className="text-xs font-bold text-teal-300 mb-1">{t.name}</div>
              <div className="text-[9px] text-zinc-500 mb-1.5 leading-snug">{t.desc}</div>
              <span className={`text-[9px] font-mono px-1.5 py-0.5 rounded border ${afford ? 'border-orange-500/40 text-orange-300 bg-orange-500/10' : 'border-red-900 text-red-500'}`}>
                {t.ic_cost} IC
              </span>
            </motion.button>
          );
        })}
      </div>

      {/* Config panel */}
      <AnimatePresence>
        {selected && selectedDef && marketOpen && (
          <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.18 }}>
            <Card className="border border-teal-700/40 bg-zinc-950">
              <CardContent className="px-3 py-3 space-y-2.5">
                {needsCorp && (
                  <div>
                    <Label className="text-zinc-400 font-mono text-[9px] uppercase">Corporación objetivo</Label>
                    <select value={corpId} onChange={e => setCorpId(e.target.value)}
                      className="w-full bg-black border border-zinc-800 text-white text-xs font-mono rounded-lg px-2 h-8 mt-0.5">
                      <option value="">Seleccioná corp...</option>
                      {market.map(c => (
                        <option key={c.id} value={c.id}>{c.name} — {fmt(Number(c.fair_market_value))}</option>
                      ))}
                    </select>
                  </div>
                )}
                <Button onClick={submit} disabled={submitting || !ready}
                  className="w-full bg-teal-700 hover:bg-teal-600 text-white font-bold uppercase tracking-wider text-xs h-9">
                  {submitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <>{selectedDef.emoji} Encolar Lobby ({selectedDef.ic_cost} IC)</>}
                </Button>
                <p className="text-[9px] font-mono text-zinc-600 text-center">IC disponible: {Math.round(ic).toLocaleString('es-AR')} · Refund 50% si cancelás</p>
              </CardContent>
            </Card>
          </motion.div>
        )}
        {selected && !marketOpen && (
          <div className="bg-zinc-900/50 border border-zinc-700/40 rounded-xl p-3 text-center text-zinc-500 text-xs font-mono">🌙 Lobby cerrado — abre a las 09:00 ART</div>
        )}
      </AnimatePresence>

      {/* Pending lobbies this turn — all players */}
      {allLobbies.length > 0 && (
        <Card className="bg-zinc-950 border-zinc-900">
          <CardHeader className="py-1.5 px-3">
            <CardTitle className="text-teal-400 font-mono uppercase text-xs">📡 Lobbies activos este turno</CardTitle>
            <CardDescription className="text-zinc-600 text-[10px]">Todo es público — usalo a tu favor</CardDescription>
          </CardHeader>
          <CardContent className="px-3 pb-3 space-y-1.5">
            {allLobbies.map(l => {
              const def = LOBBY_TYPES.find(t => t.id === l.lobby_type);
              const isMine = l.player_name === player.username;
              const myLobbyData = myLobbies.find(ml => ml.id === l.id);
              return (
                <div key={l.id} className="flex items-center gap-2 p-2 rounded-lg border border-zinc-800 bg-zinc-900/40">
                  <span className="text-base shrink-0">{def?.emoji || '🏛️'}</span>
                  <div className="w-5 h-5 rounded-full flex items-center justify-center text-[8px] font-black text-black shrink-0" style={{ backgroundColor: l.avatar_color || '#a3e635' }}>{(l.player_name || '?')[0]}</div>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-bold text-white">{l.player_name} · <span className="text-teal-300">{def?.name}</span></div>
                    {l.corp_name && <div className="text-[9px] font-mono text-zinc-500">→ {l.corp_name}</div>}
                  </div>
                  <span className="text-[9px] font-mono text-orange-400">{l.ic_paid} IC</span>
                  {isMine && myLobbyData && (
                    <button onClick={() => cancel(l.id)} className="text-zinc-600 hover:text-red-400 text-[9px] font-mono transition-colors" title="Cancelar (50% refund)">✕</button>
                  )}
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}
      {loading && <div className="text-zinc-600 text-xs text-center py-4">Cargando...</div>}
    </div>
  );
}

// ── Arena Section (Nissai / Casino / Bounty / Oráculo / Lobby) ────────────────
function ArenaSection({ tab, setTab, player, players, market, pData, refresh, marketOpen }) {
  const TABS = [
    { id: 'nissai', label: '🥷 Nissai',  activeClass: 'bg-red-700/30 text-red-300 border-red-700/40' },
    { id: 'casino', label: '🎰 Casino',  activeClass: 'bg-purple-700/30 text-purple-300 border-purple-700/40' },
    { id: 'bounty', label: '🏴‍☠️ Bounty', activeClass: 'bg-amber-700/30 text-amber-300 border-amber-700/40' },
    { id: 'oraculo',label: '🔮 Oráculo', activeClass: 'bg-indigo-700/30 text-indigo-300 border-indigo-700/40' },
    { id: 'lobby',  label: '🏛️ Lobby',   activeClass: 'bg-teal-700/30 text-teal-300 border-teal-700/40' },
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
      {tab === 'nissai' && (
        <div className="space-y-2">
          <div className="flex items-start gap-2 bg-zinc-900/40 border border-red-900/30 rounded-lg px-3 py-2">
            <span className="text-base leading-none shrink-0 mt-0.5">🥷</span>
            <p className="text-[10px] text-zinc-500 leading-relaxed">
              Sabotajes anónimos que se ejecutan en la resolución del turno. Podés <span className="text-red-400">destruir corps rivales</span>, robar IC o bloquear dividendos. Sin rastreo. El Rey no habla.
            </p>
          </div>
          <NissaiPanel player={player} players={players} market={market} onChange={refresh} />
        </div>
      )}
      {tab === 'casino' && (
        <div className="space-y-2">
          <div className="flex items-start gap-2 bg-zinc-900/40 border border-purple-900/30 rounded-lg px-3 py-2">
            <span className="text-base leading-none shrink-0 mt-0.5">🎰</span>
            <p className="text-[10px] text-zinc-500 leading-relaxed">
              <span className="text-purple-400">1 apuesta por turno</span> · máx 40% de tu cash · <span className="text-red-400">60% LOSE</span> · <span className="text-lime-400">18% ×2</span> · <span className="text-cyan-400">18% +50%</span> · <span className="text-orange-400">4% JACKPOT ×5</span>. Resultados a medianoche.
            </p>
          </div>
          <CasinoTab player={player} liquidCash={Number(pData.liquid_cash)} onChange={refresh} />
        </div>
      )}
      {tab === 'bounty' && (
        <div className="space-y-2">
          <div className="flex items-start gap-2 bg-zinc-900/40 border border-amber-900/30 rounded-lg px-3 py-2">
            <span className="text-base leading-none shrink-0 mt-0.5">🏴‍☠️</span>
            <p className="text-[10px] text-zinc-500 leading-relaxed">
              Poné precio a la cabeza de un rival. Si van al <span className="text-red-400">Chapter 11</span> mientras el bounty está activo → cobrás <span className="text-amber-400">el doble</span>. Cancelar devuelve el 50%.
            </p>
          </div>
          <BountyBoard player={player} players={players} liquidCash={Number(pData.liquid_cash)} onChange={refresh} />
        </div>
      )}
      {tab === 'oraculo' && (
        <OracleTab
          player={player}
          market={market}
          ic={Number(pData.intellectual_capital)}
          marketOpen={marketOpen}
          onChange={refresh}
        />
      )}
      {tab === 'lobby' && (
        <LobbyTab
          player={player}
          market={market}
          ic={Number(pData.intellectual_capital)}
          marketOpen={marketOpen}
          onChange={refresh}
        />
      )}
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
function AdminSection({ state, resolveTurn, loading, turn, player }) {
  const [logs,         setLogs]         = useState([]);
  const [tgLoading,    setTgLoading]    = useState(false);
  const [tgResult,     setTgResult]     = useState(null);
  useEffect(() => { api('admin/turn-log').then(d => setLogs(d.logs)).catch(() => {}); }, [state.current_turn]);

  const forceTelegram = async () => {
    if (!confirm('¿Forzar envío del reporte del último turno por Telegram?')) return;
    setTgLoading(true); setTgResult(null);
    try {
      const res = await api('admin/force-telegram', { method: 'POST', body: JSON.stringify({ admin_id: player.id }) });
      setTgResult({ ok: true, msg: `✅ Enviado — T${res.turn}` });
      toast.success(`📡 Reporte del Turno ${res.turn} enviado a Telegram`);
    } catch (e) {
      setTgResult({ ok: false, msg: '❌ ' + e.message });
      toast.error(e.message);
    } finally { setTgLoading(false); }
  };

  return (
    <div className="space-y-2">
      <Card className="bg-gradient-to-br from-orange-950/40 to-black border-orange-500/30">
        <CardHeader className="py-2 px-3">
          <CardTitle className="text-orange-400 font-mono uppercase text-xs flex items-center gap-1.5">
            <Flame className="h-3.5 w-3.5" /> Control de Turnos
          </CardTitle>
        </CardHeader>
        <CardContent className="px-3 pb-3 space-y-3">
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
          {/* Telegram Force */}
          <div className="border-t border-orange-500/20 pt-3 flex items-center gap-3 flex-wrap">
            <Button
              onClick={forceTelegram}
              disabled={tgLoading}
              className="bg-sky-700 hover:bg-sky-600 text-white font-bold uppercase tracking-wider text-xs h-9 px-4"
            >
              {tgLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : '📡'}
              {tgLoading ? 'Enviando...' : 'Forzar Telegram'}
            </Button>
            <div className="text-[9px] font-mono text-zinc-500 flex-1">Reenvía el resumen del último turno resuelto al grupo.</div>
            {tgResult && (
              <span className={`text-[10px] font-mono font-bold ${tgResult.ok ? 'text-sky-400' : 'text-red-400'}`}>{tgResult.msg}</span>
            )}
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
      <div className={`text-sm font-black font-mono ${c.text} leading-tight break-all`}>{value}</div>
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
