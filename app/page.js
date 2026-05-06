'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toast } from 'sonner';
import {
  Loader2, LogOut, Zap, TrendingUp, Wallet, Building2, Crown,
  ShoppingCart, History, Flame, Skull, ShieldAlert, Dices,
} from 'lucide-react';
import LiveBoard from '@/components/LiveBoard';
import DiceModal from '@/components/DiceModal';
import ActionReceipt from '@/components/ActionReceipt';
import FlashOverlay from '@/components/FlashOverlay';
import AlliancesTab from '@/components/AlliancesTab';
import TechTreeTab from '@/components/TechTreeTab';
import SurvivalGuide from '@/components/SurvivalGuide';

// ── Utilidades ────────────────────────────────────────────────────────────────
const fmt = (n) => {
  if (n === null || n === undefined || isNaN(n)) return '$0';
  const num  = Number(n);
  const sign = num < 0 ? '-' : '';
  return sign + '$' + Math.abs(num).toLocaleString('es-AR', { maximumFractionDigits: 0 });
};
const fmtDec = (n) => {
  if (n === null || n === undefined || isNaN(n)) return '$0';
  return '$' + Number(n).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

const api = async (path, opts = {}) => {
  const res  = await fetch('/api/' + path, { headers: { 'Content-Type': 'application/json' }, ...opts });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Error');
  return data;
};

// Casillas especiales (sincronizado con BOARD_SPECIAL_SQUARES del server)
const SQUARE_LABELS = {
  5:  { label: '⚠️ Prendas',      cls: 'text-amber-400' },
  10: { label: '🛋️ Psicólogo',    cls: 'text-pink-400'  },
  15: { label: '⚠️ Prendas',      cls: 'text-amber-400' },
};

const ROLE_LABELS = {
  DATA_SCIENTIST:   { label: 'Data Scientist',  color: '#a3e635' },
  ECONOMIST:        { label: 'Economista',       color: '#22d3ee' },
  PSYCHOLOGIST:     { label: 'Psicólogo/a',      color: '#ec4899' },
  SYSTEMS_ENGINEER: { label: 'Ing. Sistemas',    color: '#eab308' },
  MECH_ENGINEER:    { label: 'Ing. Mecánico/a',  color: '#8b5cf6' },
};

// ── App root ──────────────────────────────────────────────────────────────────
function App() {
  const [player,      setPlayer]      = useState(null);
  const [initLoading, setInitLoading] = useState(true);
  const [dashboard,   setDashboard]   = useState(null);
  const [market,      setMarket]      = useState([]);
  const [players,     setPlayers]     = useState([]);
  const [state,       setState]       = useState({ current_turn: 1, locked: false });
  const [loading,     setLoading]     = useState(false);
  const [showDice,    setShowDice]    = useState(false);
  const [flash,       setFlash]       = useState(null);
  // ── Proyección de dado sobre el tablero (permanente hasta el próximo turno) ──
  const [projectedSquare, setProjectedSquare] = useState(null);
  const prevTurnRef  = useRef(null);

  useEffect(() => {
    (async () => {
      try { await api('init', { method: 'POST' }); } catch (e) { console.error('Init', e); }
      const saved = typeof window !== 'undefined' ? localStorage.getItem('d77_player') : null;
      if (saved) setPlayer(JSON.parse(saved));
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
          setFlash({
            type:  net >= 0 ? 'positive' : 'negative',
            label: (net >= 0 ? '+$' : '-$') + Math.abs(Math.round(net)).toLocaleString('es-AR'),
          });
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

  // Cuando el dado aterriza: iluminar la celda de forma permanente hasta el siguiente turno
  const handleRollComplete = useCallback(({ landing }) => {
    setProjectedSquare(landing);
  }, []);

  const handleDiceClose = useCallback(() => {
    setShowDice(false);
    // mantenemos el glow hasta que el timer lo limpie solo
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem('d77_player');
    setPlayer(null);
    setDashboard(null);
    setProjectedSquare(null);
    prevTurnRef.current = null;
  }, []);

  // ── Render ──
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
        <LoginScreen onLogin={(p) => {
          localStorage.setItem('d77_player', JSON.stringify(p));
          setPlayer(p);
          prevTurnRef.current = null;
        }} />
      </LiveBoard>
    );
  }

  return (
    <LiveBoard players={players} market={market} projectedSquare={projectedSquare}>
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
      />

      {/* Guía flotante — siempre disponible cuando hay jugador */}
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
      const { player } = await api('auth/login', {
        method: 'POST',
        body: JSON.stringify({ username, pin }),
      });
      toast.success(`Bienvenido ${player.username}`);
      onLogin(player);
    } catch (e) { toast.error(e.message); } finally { setLoading(false); }
  };

  return (
    <div className="h-full overflow-y-auto flex items-center justify-center px-4 py-6">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="mb-6 text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1 border border-lime-400/40 bg-lime-400/10 rounded-full mb-3">
            <div className="w-2 h-2 bg-lime-400 rounded-full animate-pulse" />
            <span className="text-[10px] font-mono uppercase tracking-widest text-lime-300">
              Live Server · 7 Players
            </span>
          </div>
          <h1 className="text-5xl font-black tracking-tighter text-white leading-none">
            DISTRITO<span className="text-lime-400">77</span>
          </h1>
          <p className="text-zinc-500 font-mono text-[10px] uppercase tracking-widest mt-1">
            Persistent Browser Game · WEGO System
          </p>
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
                <Input
                  className="bg-black border-zinc-800 text-white font-mono uppercase tracking-wider focus-visible:ring-lime-400"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="FRANKI"
                  required
                />
              </div>
              <div>
                <Label className="text-zinc-400 font-mono text-[10px] uppercase">PIN</Label>
                <Input
                  className="bg-black border-zinc-800 text-white font-mono tracking-[0.5em] text-center focus-visible:ring-lime-400"
                  type="password"
                  inputMode="numeric"
                  maxLength={4}
                  value={pin}
                  onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
                  placeholder="••••"
                  required
                />
              </div>
              <Button
                type="submit"
                disabled={loading}
                className="w-full bg-lime-400 hover:bg-lime-300 text-black font-bold uppercase tracking-wider"
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Conectar'}
              </Button>
            </form>

            <div className="mt-4 pt-3 border-t border-zinc-800">
              <p className="text-[9px] font-mono uppercase text-zinc-600 mb-1.5">// Roster</p>
              <div className="flex flex-wrap gap-x-2 gap-y-1 text-[9px] font-mono text-zinc-500">
                {[
                  ['FRANKI','0814'],['CECE','1234'],['TOBE','5678'],
                  ['SANTI','9012'],['BEN','3456'],['MANU','7890'],['RETA','2468'],
                ].map(([u,p]) => (
                  <button
                    key={u}
                    type="button"
                    className="hover:text-lime-400 transition-colors"
                    onClick={() => { setUsername(u); setPin(p); }}
                  >
                    {u}
                  </button>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ── Dashboard ─────────────────────────────────────────────────────────────────
function Dashboard({ player, dashboard, market, players, state, refresh, logout, loading, setLoading, onOpenDice, projectedSquare }) {
  if (!dashboard) {
    return (
      <div className="h-full flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-lime-400" />
      </div>
    );
  }

  const { player: pData, turn, netWorth, portfolio, audit, pendingOrders, auditTurn, lastGlobalEvent } = dashboard;

  const resolveTurn = async () => {
    if (!confirm(`¿Resolver turno ${turn}? Esto es irreversible.`)) return;
    setLoading(true);
    try {
      const res = await api('admin/resolve-turn', {
        method: 'POST',
        body: JSON.stringify({ admin_id: player.id }),
      });
      toast.success(`Turno ${turn} resuelto. ${res.summary.trades.length} trades ejecutados.`);
      await refresh();
    } catch (e) { toast.error(e.message); } finally { setLoading(false); }
  };

  return (
    // h-full + flex col: header fijo arriba, contenido scroll abajo
    <div className="h-full flex flex-col overflow-hidden bg-black/10">
      {/* ── Header compacto ── */}
      <header className="shrink-0 border-b border-zinc-900 bg-black/70 backdrop-blur-xl z-30 px-3 py-2">
        <div className="flex items-center justify-between gap-2">
          {/* Logo + estado */}
          <div className="flex items-center gap-2 min-w-0 overflow-hidden">
            <h1 className="text-lg font-black tracking-tighter shrink-0">
              D<span className="text-lime-400">77</span>
            </h1>
            <div className="flex flex-wrap items-center gap-1.5 min-w-0">
              <div className="hidden sm:flex items-center gap-1.5 px-2 py-0.5 bg-zinc-900/80 rounded-full border border-zinc-800 text-[10px] font-mono">
                <Flame className="h-2.5 w-2.5 text-orange-400" />
                <span className="text-zinc-400">T<span className="text-lime-400 font-bold">{turn}</span></span>
                <span className="text-zinc-700">·</span>
                {(() => {
                  const pos = pData.board_position ?? 0;
                  const sq  = SQUARE_LABELS[pos];
                  return (
                    <span className={sq ? sq.cls + ' font-bold' : 'text-cyan-400 font-bold'}>
                      📍{pos}{sq ? ' ' + sq.label : ''}
                    </span>
                  );
                })()}
                {state.locked && <Badge className="bg-red-500/20 text-red-400 text-[9px] ml-1">LOCK</Badge>}
              </div>
              {/* Indicador de aterrizaje del dado */}
              {projectedSquare !== null && (() => {
                const sq   = SQUARE_LABELS[projectedSquare];
                const corp = market.find(c => c.board_position === projectedSquare);
                const dest = sq ? sq.label : corp ? corp.name : `Casilla ${projectedSquare}`;
                return (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.85 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="flex items-center gap-1 px-2 py-0.5 bg-lime-400/15 border border-lime-400/50 rounded-full text-[10px] font-mono text-lime-300 shrink-0"
                  >
                    <span>🎲</span>
                    <span className="font-bold text-lime-400">{projectedSquare}</span>
                    <span className="text-lime-500">➔</span>
                    <span className="truncate max-w-[80px]">{dest}</span>
                  </motion.div>
                );
              })()}
            </div>
          </div>

          {/* Acciones */}
          <div className="flex items-center gap-1.5 shrink-0">
            <Button
              variant="ghost" size="icon"
              onClick={onOpenDice}
              className="h-8 w-8 text-lime-400 hover:text-lime-300 hover:bg-lime-400/10"
              title="Tirar dado"
            >
              <Dices className="h-4 w-4" />
            </Button>
            <div className="flex items-center gap-1.5">
              <div
                className="w-7 h-7 rounded-full flex items-center justify-center font-black text-black text-xs ring-2 ring-black/20"
                style={{ backgroundColor: pData.avatar_color }}
              >
                {pData.username[0]}
              </div>
              <div className="hidden sm:block leading-none">
                <div className="text-xs font-bold flex items-center gap-1">
                  {pData.username}
                  {pData.is_admin && <span className="text-[8px] font-mono text-lime-400 uppercase">Admin</span>}
                </div>
                <RoleBadge role={pData.player_role} />
              </div>
            </div>
            <Button variant="ghost" size="icon" onClick={logout} className="h-8 w-8 text-zinc-500 hover:text-white">
              <LogOut className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </header>

      {/* ── Contenido scrollable ── */}
      <div className="flex-1 overflow-y-auto overscroll-contain" style={{ scrollbarWidth: 'thin', scrollbarColor: '#3f3f46 transparent' }}>
        <div className="px-2 py-2 space-y-2">

          {/* KPIs */}
          <div className="grid grid-cols-2 gap-2">
            <KpiCard label="Net Worth"   value={fmt(netWorth)}                                                   icon={<TrendingUp className="h-3.5 w-3.5" />} accent="lime" />
            <KpiCard label="Cash"        value={fmt(pData.liquid_cash)}                                          icon={<Wallet     className="h-3.5 w-3.5" />} accent="cyan" />
            <KpiCard label="IC"          value={Math.round(pData.intellectual_capital).toLocaleString('es-AR') + ' IC'} icon={<Zap    className="h-3.5 w-3.5" />} accent="orange" />
            <KpiCard label="Corps"       value={portfolio.length}                                                icon={<Building2  className="h-3.5 w-3.5" />} accent="pink" />
          </div>

          {/* Capítulo 11 */}
          {pData.bankrupt && (
            <div className="bg-red-950/40 border border-red-500/50 rounded-lg p-3 flex items-start gap-2">
              <ShieldAlert className="h-4 w-4 text-red-400 shrink-0 mt-0.5" />
              <div>
                <div className="font-bold text-red-300 uppercase text-xs">Chapter 11 · Receivership</div>
                <div className="text-[10px] text-red-400/80 mt-0.5">
                  Inyección aplicada. {pData.tax_exempt_turns} turnos exentos restantes.
                </div>
              </div>
            </div>
          )}

          {/* Tabs */}
          <Tabs defaultValue="dashboard" className="w-full">
            <TabsList className="bg-zinc-950 border border-zinc-900 p-0.5 font-mono uppercase text-[10px] h-auto flex-wrap gap-0.5 w-full">
              {[
                ['dashboard','Daily'],
                ['market','Mercado'],
                ['portfolio','Portfolio'],
                ['leaderboard','Ranking'],
                ['alliances','Alianzas'],
                ['tech','Tech'],
                ...(pData.is_admin ? [['admin','Admin']] : []),
              ].map(([val,lbl]) => (
                <TabsTrigger
                  key={val}
                  value={val}
                  className={`flex-1 min-w-[48px] py-1 text-[10px] data-[state=active]:text-black ${
                    val === 'tech' || val === 'admin'
                      ? 'data-[state=active]:bg-orange-400'
                      : 'data-[state=active]:bg-lime-400'
                  }`}
                >
                  {lbl}
                </TabsTrigger>
              ))}
            </TabsList>

            {/* Daily */}
            <TabsContent value="dashboard" className="space-y-2 mt-2">
              {/* Evento global del último turno */}
              {lastGlobalEvent && (
                <div className="bg-indigo-950/40 border border-indigo-500/40 rounded-xl p-3 flex items-start gap-3">
                  <span className="text-2xl shrink-0 leading-none mt-0.5">🌐</span>
                  <div className="min-w-0">
                    <div className="font-black text-indigo-300 text-xs uppercase tracking-wider">{lastGlobalEvent.label}</div>
                    <div className="text-[11px] text-indigo-400/80 mt-0.5">{lastGlobalEvent.desc}</div>
                    {lastGlobalEvent.district && (
                      <div className="text-[10px] font-mono text-indigo-500 mt-1">
                        Zona afectada: <span className="text-indigo-300 font-bold">{lastGlobalEvent.district}</span>
                        {' · '}{lastGlobalEvent.pct > 0 ? '+' : ''}{(lastGlobalEvent.pct * 100).toFixed(0)}% FMV
                      </div>
                    )}
                    <div className="text-[9px] font-mono text-indigo-600 mt-1 uppercase">Turno #{auditTurn}</div>
                  </div>
                </div>
              )}
              <div className="grid md:grid-cols-2 gap-2">
                {/* Auditoría */}
                <Card className="bg-zinc-950 border-zinc-900">
                  <CardHeader className="py-2 px-3">
                    <CardTitle className="text-lime-400 font-mono uppercase text-xs flex items-center gap-1.5">
                      <History className="h-3.5 w-3.5" /> Auditoría
                    </CardTitle>
                    <CardDescription className="text-zinc-500 text-[10px] font-mono">
                      Turno #{auditTurn || '—'} (último resuelto)
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="px-3 pb-3">
                    {audit.length === 0 ? (
                      <p className="text-xs text-zinc-500 italic">Sin movimientos.</p>
                    ) : (
                      <div className="space-y-0.5 max-h-56 overflow-y-auto">
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
                  </CardContent>
                </Card>

                {/* Cola de órdenes */}
                <Card className="bg-zinc-950 border-zinc-900">
                  <CardHeader className="py-2 px-3">
                    <CardTitle className="text-orange-400 font-mono uppercase text-xs flex items-center gap-1.5">
                      <ShoppingCart className="h-3.5 w-3.5" /> Cola · Turno {turn}
                    </CardTitle>
                    <CardDescription className="text-zinc-500 text-[10px] font-mono">
                      Se ejecutan al resolver
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="px-3 pb-3">
                    {pendingOrders.length === 0 ? (
                      <p className="text-xs text-zinc-500 italic">Sin órdenes. Usá Mercado.</p>
                    ) : (
                      <div className="space-y-1.5">
                        <AnimatePresence>
                          {pendingOrders.map((o) => (
                            <ActionReceipt
                              key={o.id}
                              order={o}
                              onCancel={async (id) => {
                                try { await api('orders/' + id, { method: 'DELETE' }); toast.success('Cancelada'); refresh(); }
                                catch (e) { toast.error(e.message); }
                              }}
                            />
                          ))}
                        </AnimatePresence>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            {/* Mercado */}
            <TabsContent value="market" className="mt-2">
              <MarketTab market={market} player={player} refresh={refresh} />
            </TabsContent>

            {/* Portfolio */}
            <TabsContent value="portfolio" className="mt-2">
              <Card className="bg-zinc-950 border-zinc-900">
                <CardHeader className="py-2 px-3">
                  <CardTitle className="text-lime-400 font-mono uppercase text-xs">Portfolio de Acciones</CardTitle>
                </CardHeader>
                <CardContent className="px-3 pb-3">
                  {portfolio.length === 0 ? (
                    <p className="text-zinc-500 italic text-xs">No posees acciones.</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow className="border-zinc-800 hover:bg-transparent">
                            {['Corporación','Shares','%','FMV','Valor','CEO'].map(h => (
                              <TableHead key={h} className="text-zinc-500 font-mono uppercase text-[9px] px-2 py-1">{h}</TableHead>
                            ))}
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {portfolio.map((s) => {
                            const pct   = (s.shares / s.total_shares) * 100;
                            const value = (s.shares / s.total_shares) * Number(s.fair_market_value);
                            const isCeo = s.ceo_player_id === player.id;
                            return (
                              <TableRow key={s.corp_id} className="border-zinc-900 hover:bg-zinc-900/30">
                                <TableCell className="px-2 py-1.5">
                                  <div className="font-bold text-white text-xs">{s.name}</div>
                                  <div className="text-[9px] text-zinc-500 font-mono uppercase">{s.district}</div>
                                </TableCell>
                                <TableCell className="font-mono text-xs px-2 py-1.5">{s.shares}</TableCell>
                                <TableCell className="font-mono text-lime-400 text-xs px-2 py-1.5">{pct.toFixed(1)}%</TableCell>
                                <TableCell className="font-mono text-xs px-2 py-1.5">{fmt(s.fair_market_value)}</TableCell>
                                <TableCell className="font-mono font-bold text-lime-400 text-xs px-2 py-1.5">{fmt(value)}</TableCell>
                                <TableCell className="px-2 py-1.5">
                                  {isCeo
                                    ? <Badge className="bg-orange-500/20 text-orange-300 border-orange-500/30 text-[9px]"><Crown className="h-2.5 w-2.5 mr-0.5" />TÚ</Badge>
                                    : <span className="text-[10px] text-zinc-500 font-mono">{s.ceo_name || '—'}</span>}
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* Ranking */}
            <TabsContent value="leaderboard" className="mt-2">
              <Card className="bg-zinc-950 border-zinc-900">
                <CardHeader className="py-2 px-3">
                  <CardTitle className="text-lime-400 font-mono uppercase text-xs">Ranking · Net Worth</CardTitle>
                </CardHeader>
                <CardContent className="px-3 pb-3">
                  <div className="space-y-1.5">
                    {players.map((p, i) => (
                      <div
                        key={p.id}
                        className={`flex items-center gap-2 p-2 rounded border ${
                          p.id === player.id ? 'border-lime-500/50 bg-lime-500/5' : 'border-zinc-900 bg-zinc-900/30'
                        }`}
                      >
                        <div className="text-xl font-black text-zinc-700 w-6 shrink-0">{i + 1}</div>
                        <div
                          className="w-8 h-8 rounded-full flex items-center justify-center font-black text-black text-sm shrink-0"
                          style={{ backgroundColor: p.avatar_color }}
                        >
                          {p.username[0]}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="font-bold text-sm flex items-center gap-1.5">
                            {p.username}
                            {p.bankrupt && <Skull className="h-3 w-3 text-red-400" />}
                          </div>
                          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                            <RoleBadge role={p.player_role} />
                            <span className="text-[9px] text-zinc-500 font-mono">
                              {fmt(p.liquid_cash)}
                            </span>
                            {(() => {
                              const pos = p.board_position ?? 0;
                              const sq  = SQUARE_LABELS[pos];
                              return (
                                <span className={`text-[9px] font-mono ${sq ? sq.cls : 'text-zinc-600'}`}>
                                  📍{pos}{sq ? ' · ' + sq.label : ''}
                                </span>
                              );
                            })()}
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <div className="text-base font-bold font-mono text-lime-400">{fmt(p.net_worth)}</div>
                          <div className="text-[9px] text-zinc-500 font-mono uppercase">Net Worth</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Admin */}
            {pData.is_admin && (
              <TabsContent value="admin" className="mt-2">
                <AdminTab state={state} resolveTurn={resolveTurn} loading={loading} />
              </TabsContent>
            )}

            {/* Alianzas */}
            <TabsContent value="alliances" className="mt-2">
              <AlliancesTab
                player={player}
                players={players}
                liquidCash={Number(pData.liquid_cash)}
                onChange={refresh}
              />
            </TabsContent>

            {/* Tech Tree */}
            <TabsContent value="tech" className="mt-2">
              <TechTreeTab
                player={player}
                ic={Number(pData.intellectual_capital)}
                onChange={refresh}
              />
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}

// ── KPI Card ──────────────────────────────────────────────────────────────────
function KpiCard({ label, value, icon, accent }) {
  const colors = {
    lime:   { text: 'text-lime-400',   border: 'border-lime-500/20'   },
    cyan:   { text: 'text-cyan-400',   border: 'border-cyan-500/20'   },
    orange: { text: 'text-orange-400', border: 'border-orange-500/20' },
    pink:   { text: 'text-pink-400',   border: 'border-pink-500/20'   },
  };
  const c = colors[accent];
  return (
    <div className={`bg-zinc-950 border ${c.border} rounded-lg p-3`}>
      <div className="flex items-center justify-between mb-1">
        <span className="text-[9px] uppercase font-mono tracking-widest text-zinc-500">{label}</span>
        <span className={c.text}>{icon}</span>
      </div>
      <div className={`text-xl font-black font-mono ${c.text}`}>{value}</div>
    </div>
  );
}

// ── Role Badge ────────────────────────────────────────────────────────────────
function RoleBadge({ role }) {
  const r = ROLE_LABELS[role];
  if (!r) return null;
  return (
    <span
      className="text-[9px] font-mono uppercase px-1.5 py-0.5 rounded-full border leading-none"
      style={{ color: r.color, borderColor: r.color + '60', backgroundColor: r.color + '18' }}
    >
      {r.label}
    </span>
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
  };
  const m = map[type] || { label: type, cls: 'bg-zinc-800 text-zinc-400' };
  return (
    <Badge className={`${m.cls} border-0 font-mono text-[9px] px-1.5 py-0 shrink-0`}>{m.label}</Badge>
  );
}

// ── Market Tab ────────────────────────────────────────────────────────────────
function MarketTab({ market, player, refresh }) {
  const [selectedCorp, setSelectedCorp] = useState(null);
  const [orderType,    setOrderType]    = useState('BUY_SHARES');
  const [shares,       setShares]       = useState('');
  const [limitPrice,   setLimitPrice]   = useState('');
  const [submitting,   setSubmitting]   = useState(false);

  const submit = async () => {
    if (!selectedCorp || !shares) return toast.error('Seleccioná corp y cantidad');
    setSubmitting(true);
    try {
      await api('orders', {
        method: 'POST',
        body: JSON.stringify({
          player_id:      player.id,
          order_type:     orderType,
          corporation_id: selectedCorp,
          shares:         parseInt(shares, 10),
          limit_price:    limitPrice ? parseFloat(limitPrice) : null,
        }),
      });
      toast.success('Orden en cola');
      setShares(''); setLimitPrice('');
      refresh();
    } catch (e) { toast.error(e.message); } finally { setSubmitting(false); }
  };

  const corp = market.find(c => c.id === selectedCorp);

  return (
    <div className="grid md:grid-cols-3 gap-2">
      {/* Lista de corps */}
      <div className="md:col-span-2">
        <Card className="bg-zinc-950 border-zinc-900">
          <CardHeader className="py-2 px-3">
            <CardTitle className="text-lime-400 font-mono uppercase text-xs">Corporaciones</CardTitle>
            <CardDescription className="text-zinc-500 text-[10px] font-mono">
              Tap para seleccionar · FMV total
            </CardDescription>
          </CardHeader>
          <CardContent className="px-3 pb-3">
            <div className="grid sm:grid-cols-2 gap-2 max-h-96 overflow-y-auto pr-1">
              {market.map((c) => {
                const supply     = c.total_shares - c.owned_shares;
                const isSelected = selectedCorp === c.id;
                return (
                  <motion.button
                    key={c.id}
                    onClick={() => setSelectedCorp(c.id)}
                    whileHover={{ y: -2, scale: 1.01 }}
                    whileTap={{ scale: 0.98 }}
                    transition={{ type: 'spring', stiffness: 400, damping: 25 }}
                    style={{ willChange: 'transform' }}
                    className={`text-left p-2.5 rounded-lg border transition-colors ${
                      isSelected
                        ? 'border-lime-400 bg-lime-400/5 shadow-[0_0_20px_rgba(163,230,53,0.2)]'
                        : 'border-zinc-900 bg-zinc-900/40 hover:border-lime-400/30'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-1 mb-0.5">
                      <div className="font-bold text-xs text-white leading-tight">{c.name}</div>
                      <Badge className="bg-zinc-800 text-zinc-400 border-0 text-[8px] font-mono shrink-0">{c.district}</Badge>
                    </div>
                    <div className="text-[9px] text-zinc-500 italic mb-1.5">{c.tagline}</div>
                    <div className="grid grid-cols-3 gap-1 text-[9px] font-mono">
                      <div><div className="text-zinc-600 uppercase">FMV</div><div className="text-lime-400 font-bold">{fmt(c.fair_market_value)}</div></div>
                      <div><div className="text-zinc-600 uppercase">Rent</div><div className="text-cyan-400 font-bold">{fmt(c.base_income)}</div></div>
                      <div><div className="text-zinc-600 uppercase">Disp.</div><div className="text-orange-400 font-bold">{supply}/100</div></div>
                    </div>
                    <div className="mt-1.5 text-[9px] font-mono text-zinc-500">
                      CEO: <span className="text-zinc-300">{c.ceo_name || 'Vacante'}</span>
                    </div>
                  </motion.button>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Panel de orden */}
      <div>
        <Card className="bg-zinc-950 border-zinc-900 md:sticky md:top-4">
          <CardHeader className="py-2 px-3">
            <CardTitle className="text-orange-400 font-mono uppercase text-xs">Nueva Orden</CardTitle>
            {corp && (
              <CardDescription className="text-zinc-400 text-[10px]">
                <span className="text-white font-bold">{corp.name}</span><br />
                Precio/share: <span className="text-lime-400 font-mono">{fmtDec(corp.fair_market_value / 100)}</span>
              </CardDescription>
            )}
          </CardHeader>
          <CardContent className="px-3 pb-3 space-y-2">
            <div>
              <Label className="text-zinc-400 font-mono text-[9px] uppercase">Tipo</Label>
              <Select value={orderType} onValueChange={setOrderType}>
                <SelectTrigger className="bg-black border-zinc-800 text-white text-xs h-8"><SelectValue /></SelectTrigger>
                <SelectContent className="bg-zinc-950 border-zinc-800 text-white">
                  <SelectItem value="BUY_SHARES">COMPRAR del mercado</SelectItem>
                  <SelectItem value="SELL_SHARES">VENDER al mercado</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-zinc-400 font-mono text-[9px] uppercase">Cantidad</Label>
              <Input type="number" min="1" max="100" value={shares} onChange={e => setShares(e.target.value)}
                className="bg-black border-zinc-800 text-white font-mono h-8 text-xs" placeholder="0" />
            </div>
            <div>
              <Label className="text-zinc-400 font-mono text-[9px] uppercase">Límite $/share (opc.)</Label>
              <Input type="number" step="0.01" value={limitPrice} onChange={e => setLimitPrice(e.target.value)}
                className="bg-black border-zinc-800 text-white font-mono h-8 text-xs" placeholder="Precio máx." />
            </div>

            {corp && shares && (
              <div className="bg-black border border-zinc-800 rounded p-2 space-y-0.5 text-[10px] font-mono">
                <div className="flex justify-between">
                  <span className="text-zinc-500">Base/share:</span>
                  <span>{fmtDec(corp.fair_market_value / 100)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-500">Spread:</span>
                  <span>{orderType === 'BUY_SHARES' ? '+3%' : '-3%'}</span>
                </div>
                <div className="flex justify-between border-t border-zinc-800 pt-1 mt-1">
                  <span className="text-zinc-300">{orderType === 'BUY_SHARES' ? 'Costo est.:' : 'Ingreso est.:'}</span>
                  <span className={orderType === 'BUY_SHARES' ? 'text-red-400 font-bold' : 'text-lime-400 font-bold'}>
                    {fmt((corp.fair_market_value / 100) * parseInt(shares || '0', 10) * (orderType === 'BUY_SHARES' ? 1.03 : 0.97))}
                  </span>
                </div>
              </div>
            )}

            <Button
              onClick={submit}
              disabled={submitting || !selectedCorp}
              className="w-full bg-lime-400 hover:bg-lime-300 text-black font-bold uppercase text-xs h-9"
            >
              {submitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Encolar Orden'}
            </Button>
            <p className="text-[9px] text-zinc-600 font-mono text-center">
              Banda: {fmt((corp?.fair_market_value || 0) * 0.5)} – {fmt((corp?.fair_market_value || 0) * 2.5)}
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ── Admin Tab ─────────────────────────────────────────────────────────────────
function AdminTab({ state, resolveTurn, loading }) {
  const [logs, setLogs] = useState([]);
  useEffect(() => {
    api('admin/turn-log').then(d => setLogs(d.logs)).catch(() => {});
  }, [state.current_turn]);

  return (
    <div className="space-y-2">
      <Card className="bg-gradient-to-br from-orange-950/40 to-black border-orange-500/30">
        <CardHeader className="py-2 px-3">
          <CardTitle className="text-orange-400 font-mono uppercase text-xs flex items-center gap-1.5">
            <Flame className="h-3.5 w-3.5" /> Control de Turnos
          </CardTitle>
          <CardDescription className="text-zinc-400 text-[10px]">
            Resuelve: trades → dividendos → mantenimiento → CEO → impuesto → bancarrota
          </CardDescription>
        </CardHeader>
        <CardContent className="px-3 pb-3">
          <div className="flex items-center gap-4 flex-wrap">
            <div>
              <div className="text-[10px] font-mono uppercase text-zinc-500">Turno actual</div>
              <div className="text-4xl font-black text-orange-400">{state.current_turn}</div>
            </div>
            <Button
              onClick={resolveTurn}
              disabled={loading || state.locked}
              className="bg-orange-400 hover:bg-orange-300 text-black font-bold uppercase tracking-wider h-12 px-6 text-sm"
            >
              {loading
                ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
                : <Flame className="h-4 w-4 mr-1.5" />}
              Resolver T{state.current_turn}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="bg-zinc-950 border-zinc-900">
        <CardHeader className="py-2 px-3">
          <CardTitle className="text-lime-400 font-mono uppercase text-xs">Historial</CardTitle>
        </CardHeader>
        <CardContent className="px-3 pb-3">
          {logs.length === 0 ? (
            <p className="text-zinc-500 italic text-xs">Sin turnos resueltos.</p>
          ) : (
            <div className="space-y-1.5 max-h-72 overflow-y-auto">
              {logs.map(l => (
                <div key={l.turn_number} className="border border-zinc-900 rounded p-2 bg-zinc-900/30">
                  <div className="flex items-center justify-between mb-1">
                    <div className="font-bold font-mono text-xs">TURNO #{l.turn_number}</div>
                    <div className="text-[9px] text-zinc-500 font-mono">
                      {new Date(l.resolved_at).toLocaleString('es-AR')}
                    </div>
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

export default App;
