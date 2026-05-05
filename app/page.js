'use client';

import { useEffect, useState, useRef } from 'react';
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
import { Loader2, LogOut, Zap, TrendingUp, Wallet, Building2, Crown, ShoppingCart, History, Flame, Skull, ShieldAlert, Dices } from 'lucide-react';
import BoardBackground from '@/components/BoardBackground';
import DiceModal from '@/components/DiceModal';
import ActionReceipt from '@/components/ActionReceipt';
import FlashOverlay from '@/components/FlashOverlay';
import AlliancesTab from '@/components/AlliancesTab';
import TechTreeTab from '@/components/TechTreeTab';

const fmt = (n) => {
  if (n === null || n === undefined || isNaN(n)) return '$0';
  const num = Number(n);
  const sign = num < 0 ? '-' : '';
  return sign + '$' + Math.abs(num).toLocaleString('es-AR', { maximumFractionDigits: 0 });
};
const fmtDec = (n) => {
  if (n === null || n === undefined || isNaN(n)) return '$0';
  return '$' + Number(n).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

const api = async (path, opts = {}) => {
  const res = await fetch('/api/' + path, {
    headers: { 'Content-Type': 'application/json' },
    ...opts,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Error');
  return data;
};

function App() {
  const [player, setPlayer] = useState(null);
  const [initLoading, setInitLoading] = useState(true);
  const [dashboard, setDashboard] = useState(null);
  const [market, setMarket] = useState([]);
  const [players, setPlayers] = useState([]);
  const [state, setState] = useState({ current_turn: 1, locked: false });
  const [loading, setLoading] = useState(false);
  const [showDice, setShowDice] = useState(false);
  const [flash, setFlash] = useState(null);
  const prevTurnRef = useRef(null);

  useEffect(() => {
    (async () => {
      try { await api('init', { method: 'POST' }); } catch (e) { console.error('Init', e); }
      const saved = typeof window !== 'undefined' ? localStorage.getItem('d77_player') : null;
      if (saved) setPlayer(JSON.parse(saved));
      setInitLoading(false);
    })();
  }, []);

  const loadAll = async (pid) => {
    if (!pid) return;
    try {
      const [dash, mkt, pls, st] = await Promise.all([
        api('dashboard/' + pid), api('market'), api('players'), api('game/state'),
      ]);
      // Detect turn advance → flash based on last audit net delta
      if (prevTurnRef.current !== null && dash.turn > prevTurnRef.current) {
        const net = (dash.audit || []).reduce((s, t) => s + Number(t.amount), 0);
        if (Math.abs(net) > 10) {
          setFlash({
            type: net >= 0 ? 'positive' : 'negative',
            label: (net >= 0 ? '+$' : '-$') + Math.abs(Math.round(net)).toLocaleString('es-AR'),
          });
        }
      }
      prevTurnRef.current = dash.turn;
      setDashboard(dash);
      setMarket(mkt.market);
      setPlayers(pls.players);
      setState(st);
      // Check dice roll status for this turn
      const diceRes = await api('dice/status/' + pid);
      if (!diceRes.roll) setShowDice(true);
    } catch (e) { toast.error('Error al cargar: ' + e.message); }
  };

  useEffect(() => {
    if (player) loadAll(player.id);
    const interval = player ? setInterval(() => loadAll(player.id), 15000) : null;
    return () => interval && clearInterval(interval);
  }, [player]);

  if (initLoading) return <div className="min-h-screen flex items-center justify-center bg-black"><Loader2 className="h-8 w-8 animate-spin text-lime-400" /></div>;
  if (!player) return (<><BoardBackground /><LoginScreen onLogin={(p) => { localStorage.setItem('d77_player', JSON.stringify(p)); setPlayer(p); prevTurnRef.current = null; }} /></>);

  return (
    <>
      <BoardBackground />
      <FlashOverlay flash={flash} onDone={() => setFlash(null)} />
      {showDice && dashboard && (
        <DiceModal
          playerId={player.id}
          turn={dashboard.turn}
          onClose={() => setShowDice(false)}
        />
      )}
      <Dashboard player={player} dashboard={dashboard} market={market} players={players} state={state} loading={loading} setLoading={setLoading}
        onOpenDice={() => setShowDice(true)}
        refresh={() => loadAll(player.id)} logout={() => { localStorage.removeItem('d77_player'); setPlayer(null); setDashboard(null); prevTurnRef.current = null; }} />
    </>
  );
}

function LoginScreen({ onLogin }) {
  const [username, setUsername] = useState('');
  const [pin, setPin] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { player } = await api('auth/login', { method: 'POST', body: JSON.stringify({ username, pin }) });
      toast.success(`Bienvenido ${player.username}`);
      onLogin(player);
    } catch (e) { toast.error(e.message); } finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen relative flex items-center justify-center px-4">
      <div className="relative z-10 w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1 border border-lime-400/40 bg-lime-400/10 rounded-full mb-4">
            <div className="w-2 h-2 bg-lime-400 rounded-full animate-pulse" />
            <span className="text-xs font-mono uppercase tracking-widest text-lime-300">Live Server · 7 Players</span>
          </div>
          <h1 className="text-6xl font-black tracking-tighter text-white leading-none">DISTRITO<span className="text-lime-400">77</span></h1>
          <p className="text-zinc-500 font-mono text-xs uppercase tracking-widest mt-2">Persistent Browser Game · WEGO System</p>
        </div>

        <Card className="bg-zinc-950/80 backdrop-blur border-zinc-800">
          <CardHeader>
            <CardTitle className="text-lime-400 font-mono uppercase tracking-wider text-sm">// Acceso</CardTitle>
            <CardDescription className="text-zinc-500">Usuario y PIN de 4 dígitos</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={submit} className="space-y-4">
              <div>
                <Label className="text-zinc-400 font-mono text-xs uppercase">Alias</Label>
                <Input className="bg-black border-zinc-800 text-white font-mono uppercase tracking-wider focus-visible:ring-lime-400"
                  value={username} onChange={(e) => setUsername(e.target.value)} placeholder="FRANCO" required />
              </div>
              <div>
                <Label className="text-zinc-400 font-mono text-xs uppercase">PIN</Label>
                <Input className="bg-black border-zinc-800 text-white font-mono tracking-[0.5em] text-center focus-visible:ring-lime-400"
                  type="password" inputMode="numeric" maxLength={4} value={pin}
                  onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))} placeholder="••••" required />
              </div>
              <Button type="submit" disabled={loading} className="w-full bg-lime-400 hover:bg-lime-300 text-black font-bold uppercase tracking-wider">
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Conectar'}
              </Button>
            </form>
            <div className="mt-6 pt-4 border-t border-zinc-800">
              <p className="text-[10px] font-mono uppercase text-zinc-600 mb-2">// Demo Players</p>
              <div className="flex flex-wrap gap-1 text-[10px] font-mono text-zinc-500">
                <span>FRANCO/0814</span>·<span>NOVA/1111</span>·<span>PANTERA/2222</span>·<span>REYNA/3333</span>·<span>TITAN/4444</span>·<span>SOMBRA/5555</span>·<span>KAIRO/6666</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Dashboard({ player, dashboard, market, players, state, refresh, logout, loading, setLoading, onOpenDice }) {
  if (!dashboard) return <div className="min-h-screen flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-lime-400" /></div>;
  const { player: pData, turn, netWorth, portfolio, audit, pendingOrders, auditTurn } = dashboard;

  const resolveTurn = async () => {
    if (!confirm(`¿Resolver turno ${turn}? Esto es irreversible.`)) return;
    setLoading(true);
    try {
      const res = await api('admin/resolve-turn', { method: 'POST', body: JSON.stringify({ admin_id: player.id }) });
      toast.success(`Turno ${turn} resuelto. ${res.summary.trades.length} trades ejecutados.`);
      await refresh();
    } catch (e) { toast.error(e.message); } finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen">
      <header className="border-b border-zinc-900 bg-black/60 backdrop-blur-xl sticky top-0 z-40">
        <div className="container mx-auto px-4 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <h1 className="text-2xl font-black tracking-tighter">DISTRITO<span className="text-lime-400">77</span></h1>
            <div className="hidden md:flex items-center gap-2 px-3 py-1 bg-zinc-900/80 rounded-full border border-zinc-800">
              <Flame className="h-3 w-3 text-orange-400" />
              <span className="text-xs font-mono uppercase tracking-wider">Turno <span className="text-lime-400 font-bold">{turn}</span></span>
              <span className="text-zinc-700">·</span>
              {(() => {
                const pos = pData.board_position ?? 0;
                const sq  = SQUARE_LABELS[pos];
                return (
                  <span className="text-xs font-mono tracking-wider">
                    📍 <span className={sq ? sq.cls + ' font-bold' : 'text-cyan-400 font-bold'}>{pos}</span>
                    {sq && <span className={sq.cls + ' ml-1 text-[10px]'}>{sq.label}</span>}
                  </span>
                );
              })()}
              {state.locked && <Badge className="bg-red-500/20 text-red-400 text-[10px]">RESOLVIENDO</Badge>}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" onClick={onOpenDice} className="text-lime-400 hover:text-lime-300 hover:bg-lime-400/10" title="Tirar/Ver dado">
              <Dices className="h-5 w-5" />
            </Button>
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full flex items-center justify-center font-black text-black" style={{ backgroundColor: pData.avatar_color }}>{pData.username[0]}</div>
              <div className="hidden sm:block">
                <div className="text-sm font-bold leading-none flex items-center gap-1.5">{pData.username}{pData.is_admin && <span className="text-[9px] font-mono text-lime-400 uppercase">Admin</span>}</div>
                <RoleBadge role={pData.player_role} />
              </div>
            </div>
            <Button variant="ghost" size="icon" onClick={logout} className="text-zinc-400 hover:text-white"><LogOut className="h-4 w-4" /></Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 space-y-6">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <KpiCard label="Net Worth" value={fmt(netWorth)} icon={<TrendingUp className="h-4 w-4" />} accent="lime" />
          <KpiCard label="Liquid Cash" value={fmt(pData.liquid_cash)} icon={<Wallet className="h-4 w-4" />} accent="cyan" />
          <KpiCard label="Int. Capital" value={Math.round(pData.intellectual_capital).toLocaleString('es-AR') + ' IC'} icon={<Zap className="h-4 w-4" />} accent="orange" />
          <KpiCard label="Corps" value={portfolio.length} icon={<Building2 className="h-4 w-4" />} accent="pink" />
        </div>

        {pData.bankrupt && (
          <div className="bg-red-950/40 border border-red-500/50 rounded-lg p-4 flex items-start gap-3">
            <ShieldAlert className="h-5 w-5 text-red-400 flex-shrink-0 mt-0.5" />
            <div>
              <div className="font-bold text-red-300 uppercase text-sm">Chapter 11 · Receivership</div>
              <div className="text-xs text-red-400/80 mt-1">Inyección de liquidez aplicada. {pData.tax_exempt_turns} turnos de exención fiscal restantes.</div>
            </div>
          </div>
        )}

        <Tabs defaultValue="dashboard" className="w-full">
          <TabsList className="bg-zinc-950 border border-zinc-900 p-1 font-mono uppercase text-xs">
            <TabsTrigger value="dashboard" className="data-[state=active]:bg-lime-400 data-[state=active]:text-black">Daily</TabsTrigger>
            <TabsTrigger value="market" className="data-[state=active]:bg-lime-400 data-[state=active]:text-black">Mercado</TabsTrigger>
            <TabsTrigger value="portfolio" className="data-[state=active]:bg-lime-400 data-[state=active]:text-black">Portfolio</TabsTrigger>
            <TabsTrigger value="leaderboard" className="data-[state=active]:bg-lime-400 data-[state=active]:text-black">Ranking</TabsTrigger>
            <TabsTrigger value="alliances" className="data-[state=active]:bg-lime-400 data-[state=active]:text-black">Alianzas</TabsTrigger>
            <TabsTrigger value="tech" className="data-[state=active]:bg-orange-400 data-[state=active]:text-black">Tech</TabsTrigger>
            {pData.is_admin && <TabsTrigger value="admin" className="data-[state=active]:bg-orange-400 data-[state=active]:text-black">Admin</TabsTrigger>}
          </TabsList>

          <TabsContent value="dashboard" className="space-y-4 mt-4">
            <div className="grid lg:grid-cols-2 gap-4">
              <Card className="bg-zinc-950 border-zinc-900">
                <CardHeader>
                  <CardTitle className="text-lime-400 font-mono uppercase text-sm flex items-center gap-2"><History className="h-4 w-4" /> Auditoría de Ingresos</CardTitle>
                  <CardDescription className="text-zinc-500 text-xs font-mono">Turno #{auditTurn || '—'} (último resuelto)</CardDescription>
                </CardHeader>
                <CardContent>
                  {audit.length === 0 ? (
                    <p className="text-sm text-zinc-500 italic">Sin movimientos. El primer turno aún no fue resuelto.</p>
                  ) : (
                    <div className="space-y-1 max-h-80 overflow-y-auto">
                      {audit.map((t, i) => (
                        <div key={i} className="flex items-center justify-between py-1.5 border-b border-zinc-900 text-sm">
                          <div className="flex items-center gap-2 flex-1 min-w-0">
                            <TxBadge type={t.tx_type} />
                            <span className="text-zinc-400 text-xs truncate">{t.description}</span>
                          </div>
                          <span className={`font-mono font-bold ${Number(t.amount) >= 0 ? 'text-lime-400' : 'text-red-400'}`}>
                            {Number(t.amount) >= 0 ? '+' : ''}{fmtDec(t.amount)}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card className="bg-zinc-950 border-zinc-900">
                <CardHeader>
                  <CardTitle className="text-orange-400 font-mono uppercase text-sm flex items-center gap-2"><ShoppingCart className="h-4 w-4" /> Cola de Órdenes · Turno {turn}</CardTitle>
                  <CardDescription className="text-zinc-500 text-xs font-mono">Se ejecutan al resolver el turno</CardDescription>
                </CardHeader>
                <CardContent>
                  {pendingOrders.length === 0 ? (
                    <p className="text-sm text-zinc-500 italic">Sin órdenes en cola. Usá la pestaña Mercado.</p>
                  ) : (
                    <div className="space-y-2">
                      <AnimatePresence>
                        {pendingOrders.map((o) => (
                          <ActionReceipt
                            key={o.id}
                            order={o}
                            onCancel={async (id) => { try { await api('orders/' + id, { method: 'DELETE' }); toast.success('Orden cancelada'); refresh(); } catch (e) { toast.error(e.message); } }}
                          />
                        ))}
                      </AnimatePresence>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="market" className="mt-4">
            <MarketTab market={market} player={player} refresh={refresh} />
          </TabsContent>

          <TabsContent value="portfolio" className="mt-4">
            <Card className="bg-zinc-950 border-zinc-900">
              <CardHeader>
                <CardTitle className="text-lime-400 font-mono uppercase text-sm">Portfolio de Acciones</CardTitle>
              </CardHeader>
              <CardContent>
                {portfolio.length === 0 ? (
                  <p className="text-zinc-500 italic">No posees acciones en ninguna corporación.</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow className="border-zinc-800 hover:bg-transparent">
                        <TableHead className="text-zinc-500 font-mono uppercase text-[10px]">Corporación</TableHead>
                        <TableHead className="text-zinc-500 font-mono uppercase text-[10px]">Shares</TableHead>
                        <TableHead className="text-zinc-500 font-mono uppercase text-[10px]">%</TableHead>
                        <TableHead className="text-zinc-500 font-mono uppercase text-[10px]">FMV</TableHead>
                        <TableHead className="text-zinc-500 font-mono uppercase text-[10px]">Valor Pos.</TableHead>
                        <TableHead className="text-zinc-500 font-mono uppercase text-[10px]">CEO</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {portfolio.map((s) => {
                        const pct = (s.shares / s.total_shares) * 100;
                        const value = (s.shares / s.total_shares) * Number(s.fair_market_value);
                        const isCeo = s.ceo_player_id === player.id;
                        return (
                          <TableRow key={s.corp_id} className="border-zinc-900 hover:bg-zinc-900/30">
                            <TableCell>
                              <div className="font-bold text-white text-sm">{s.name}</div>
                              <div className="text-[10px] text-zinc-500 font-mono uppercase">{s.district}</div>
                            </TableCell>
                            <TableCell className="font-mono">{s.shares}</TableCell>
                            <TableCell className="font-mono text-lime-400">{pct.toFixed(1)}%</TableCell>
                            <TableCell className="font-mono">{fmt(s.fair_market_value)}</TableCell>
                            <TableCell className="font-mono font-bold text-lime-400">{fmt(value)}</TableCell>
                            <TableCell>
                              {isCeo ? <Badge className="bg-orange-500/20 text-orange-300 border-orange-500/30"><Crown className="h-3 w-3 mr-1" /> TÚ</Badge>
                                : <span className="text-xs text-zinc-500 font-mono">{s.ceo_name || '—'}</span>}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="leaderboard" className="mt-4">
            <Card className="bg-zinc-950 border-zinc-900">
              <CardHeader><CardTitle className="text-lime-400 font-mono uppercase text-sm">Ranking · Net Worth</CardTitle></CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {players.map((p, i) => (
                    <div key={p.id} className={`flex items-center gap-3 p-3 rounded border ${p.id === player.id ? 'border-lime-500/50 bg-lime-500/5' : 'border-zinc-900 bg-zinc-900/30'}`}>
                      <div className="text-2xl font-black text-zinc-700 w-8">{i + 1}</div>
                      <div className="w-10 h-10 rounded-full flex items-center justify-center font-black text-black text-lg" style={{ backgroundColor: p.avatar_color }}>{p.username[0]}</div>
                      <div className="flex-1">
                        <div className="font-bold flex items-center gap-2">{p.username}{p.bankrupt && <Skull className="h-3 w-3 text-red-400" />}</div>
                        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                          <RoleBadge role={p.player_role} />
                          <span className="text-xs text-zinc-500 font-mono">Cash: {fmt(p.liquid_cash)}</span>
                          {(() => {
                            const pos = p.board_position ?? 0;
                            const sq  = SQUARE_LABELS[pos];
                            return (
                              <span className={`text-[10px] font-mono ${sq ? sq.cls : 'text-zinc-600'}`}>
                                📍 {pos}{sq ? ' · ' + sq.label : ''}
                              </span>
                            );
                          })()}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-lg font-bold font-mono text-lime-400">{fmt(p.net_worth)}</div>
                        <div className="text-[10px] text-zinc-500 font-mono uppercase">Net Worth</div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {pData.is_admin && (
            <TabsContent value="admin" className="mt-4">
              <AdminTab state={state} resolveTurn={resolveTurn} loading={loading} />
            </TabsContent>
          )}

          <TabsContent value="alliances" className="mt-4">
            <AlliancesTab
              player={player}
              players={players}
              liquidCash={Number(pData.liquid_cash)}
              onChange={refresh}
            />
          </TabsContent>

          <TabsContent value="tech" className="mt-4">
            <TechTreeTab
              player={player}
              ic={Number(pData.intellectual_capital)}
              onChange={refresh}
            />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}

function KpiCard({ label, value, icon, accent }) {
  const colors = {
    lime: { text: 'text-lime-400', border: 'border-lime-500/20' },
    cyan: { text: 'text-cyan-400', border: 'border-cyan-500/20' },
    orange: { text: 'text-orange-400', border: 'border-orange-500/20' },
    pink: { text: 'text-pink-400', border: 'border-pink-500/20' },
  };
  const c = colors[accent];
  return (
    <div className={`bg-zinc-950 border ${c.border} rounded-lg p-4`}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] uppercase font-mono tracking-widest text-zinc-500">{label}</span>
        <span className={c.text}>{icon}</span>
      </div>
      <div className={`text-2xl font-black font-mono ${c.text}`}>{value}</div>
    </div>
  );
}

// Casillas especiales del tablero (coincide con BOARD_SPECIAL_SQUARES del server)
const SQUARE_LABELS = {
  5:  { label: '⚠️ Prendas',      cls: 'text-amber-400' },
  10: { label: '🛋️ El Psicólogo', cls: 'text-pink-400'  },
  15: { label: '⚠️ Prendas',      cls: 'text-amber-400' },
};

const ROLE_LABELS = {
  DATA_SCIENTIST:  { label: 'Data Scientist',  color: '#a3e635' },
  ECONOMIST:       { label: 'Economista',       color: '#22d3ee' },
  PSYCHOLOGIST:    { label: 'Psicólogo/a',      color: '#ec4899' },
  SYSTEMS_ENGINEER:{ label: 'Ing. Sistemas',    color: '#eab308' },
  MECH_ENGINEER:   { label: 'Ing. Mecánico/a',  color: '#8b5cf6' },
};

function RoleBadge({ role }) {
  const r = ROLE_LABELS[role];
  if (!r) return null;
  return (
    <span className="text-[10px] font-mono uppercase px-1.5 py-0.5 rounded-full border"
      style={{ color: r.color, borderColor: r.color + '60', backgroundColor: r.color + '18' }}>
      {r.label}
    </span>
  );
}

function TxBadge({ type }) {
  const map = {
    DIVIDEND:         { label: 'DIV',   cls: 'bg-lime-500/20 text-lime-300' },
    MAINTENANCE:      { label: 'MNT',   cls: 'bg-orange-500/20 text-orange-300' },
    WEALTH_TAX:       { label: 'TAX',   cls: 'bg-red-500/20 text-red-300' },
    BUY_SHARES:       { label: 'BUY',   cls: 'bg-cyan-500/20 text-cyan-300' },
    SELL_SHARES:      { label: 'SELL',  cls: 'bg-pink-500/20 text-pink-300' },
    CHAPTER_11:       { label: 'C11',   cls: 'bg-purple-500/20 text-purple-300' },
    TAX_EXEMPT:       { label: 'EXE',   cls: 'bg-zinc-700/40 text-zinc-400' },
    ESCROW_LOCK:      { label: 'LOCK',  cls: 'bg-orange-500/20 text-orange-300' },
    ESCROW_RETURN:    { label: 'RTN',   cls: 'bg-lime-500/20 text-lime-300' },
    ESCROW_SEIZE:     { label: 'SEIZE', cls: 'bg-lime-500/30 text-lime-200' },
    ESCROW_RECOVERY:  { label: 'RECV',  cls: 'bg-lime-500/20 text-lime-300' },
    ESCROW_FORFEIT:   { label: 'LOSS',  cls: 'bg-red-500/30 text-red-200' },
    IC_GAIN:          { label: 'IC+',   cls: 'bg-orange-500/20 text-orange-300' },
    TECH_UNLOCK:      { label: 'TECH',  cls: 'bg-cyan-500/30 text-cyan-200' },
    THERAPY_FEE:      { label: 'THER',  cls: 'bg-pink-500/20 text-pink-300' },
    SERVER_MAINTENANCE:{ label: 'SRV',  cls: 'bg-yellow-500/20 text-yellow-300' },
    ACHIEVEMENT:         { label: 'ACH',  cls: 'bg-amber-500/30 text-amber-200' },
    TRANSIT_RENT:        { label: 'RENT', cls: 'bg-rose-500/20 text-rose-300'   },
    TRANSIT_RENT_INCOME: { label: 'R+',   cls: 'bg-lime-500/20 text-lime-300'   },
  };
  const m = map[type] || { label: type, cls: 'bg-zinc-800 text-zinc-400' };
  return <Badge className={`${m.cls} border-0 font-mono text-[10px] px-1.5 py-0`}>{m.label}</Badge>;
}

function MarketTab({ market, player, refresh }) {
  const [selectedCorp, setSelectedCorp] = useState(null);
  const [orderType, setOrderType] = useState('BUY_SHARES');
  const [shares, setShares] = useState('');
  const [limitPrice, setLimitPrice] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    if (!selectedCorp || !shares) return toast.error('Seleccioná corporación y cantidad');
    setSubmitting(true);
    try {
      await api('orders', {
        method: 'POST',
        body: JSON.stringify({
          player_id: player.id,
          order_type: orderType,
          corporation_id: selectedCorp,
          shares: parseInt(shares, 10),
          limit_price: limitPrice ? parseFloat(limitPrice) : null,
        }),
      });
      toast.success('Orden en cola');
      setShares(''); setLimitPrice('');
      refresh();
    } catch (e) { toast.error(e.message); } finally { setSubmitting(false); }
  };

  const selectedCorpData = market.find((c) => c.id === selectedCorp);

  return (
    <div className="grid lg:grid-cols-3 gap-4">
      <Card className="bg-zinc-950 border-zinc-900 lg:col-span-2">
        <CardHeader>
          <CardTitle className="text-lime-400 font-mono uppercase text-sm">Tablero de Corporaciones</CardTitle>
          <CardDescription className="text-zinc-500 text-xs font-mono">Click para seleccionar · FMV total de la empresa</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid sm:grid-cols-2 gap-3 max-h-[600px] overflow-y-auto pr-2">
            {market.map((c) => {
              const marketSupply = c.total_shares - c.owned_shares;
              const isSelected = selectedCorp === c.id;
              return (
                <motion.button
                  key={c.id}
                  onClick={() => setSelectedCorp(c.id)}
                  whileHover={{ y: -4, rotateX: 2, rotateY: -2, scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  transition={{ type: 'spring', stiffness: 300, damping: 20 }}
                  style={{ transformStyle: 'preserve-3d', perspective: 800 }}
                  className={`text-left p-3 rounded-lg border transition-colors ${
                    isSelected
                      ? 'border-lime-400 bg-lime-400/5 shadow-[0_0_30px_rgba(163,230,53,0.25)]'
                      : 'border-zinc-900 bg-zinc-900/40 hover:border-lime-400/40 hover:shadow-[0_0_25px_rgba(163,230,53,0.12)]'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <div className="font-bold text-sm text-white">{c.name}</div>
                    <Badge className="bg-zinc-800 text-zinc-400 border-0 text-[9px] font-mono">{c.district}</Badge>
                  </div>
                  <div className="text-[10px] text-zinc-500 italic mb-2">{c.tagline}</div>
                  <div className="grid grid-cols-3 gap-1 text-[10px] font-mono">
                    <div><div className="text-zinc-600 uppercase">FMV</div><div className="text-lime-400 font-bold">{fmt(c.fair_market_value)}</div></div>
                    <div><div className="text-zinc-600 uppercase">Rent</div><div className="text-cyan-400 font-bold">{fmt(c.base_income)}</div></div>
                    <div><div className="text-zinc-600 uppercase">Disp.</div><div className="text-orange-400 font-bold">{marketSupply}/100</div></div>
                  </div>
                  <div className="mt-2 text-[10px] font-mono text-zinc-500">CEO: <span className="text-zinc-300">{c.ceo_name || 'Vacante'}</span></div>
                </motion.button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <Card className="bg-zinc-950 border-zinc-900 h-fit lg:sticky lg:top-20">
        <CardHeader>
          <CardTitle className="text-orange-400 font-mono uppercase text-sm">Nueva Orden</CardTitle>
          {selectedCorpData && (
            <CardDescription className="text-zinc-400 text-xs">
              <span className="text-white font-bold">{selectedCorpData.name}</span><br />
              Precio/share: <span className="text-lime-400 font-mono">{fmtDec(selectedCorpData.fair_market_value / 100)}</span>
            </CardDescription>
          )}
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <Label className="text-zinc-400 font-mono text-[10px] uppercase">Tipo</Label>
            <Select value={orderType} onValueChange={setOrderType}>
              <SelectTrigger className="bg-black border-zinc-800 text-white"><SelectValue /></SelectTrigger>
              <SelectContent className="bg-zinc-950 border-zinc-800 text-white">
                <SelectItem value="BUY_SHARES">COMPRAR del mercado</SelectItem>
                <SelectItem value="SELL_SHARES">VENDER al mercado</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-zinc-400 font-mono text-[10px] uppercase">Cantidad de Shares</Label>
            <Input type="number" min="1" max="100" value={shares} onChange={(e) => setShares(e.target.value)}
              className="bg-black border-zinc-800 text-white font-mono" placeholder="0" />
          </div>
          <div>
            <Label className="text-zinc-400 font-mono text-[10px] uppercase">Límite $/share (opcional)</Label>
            <Input type="number" step="0.01" value={limitPrice} onChange={(e) => setLimitPrice(e.target.value)}
              className="bg-black border-zinc-800 text-white font-mono" placeholder="Precio máx. acept." />
          </div>

          {selectedCorpData && shares && (
            <div className="bg-black border border-zinc-800 rounded p-3 space-y-1 text-xs font-mono">
              <div className="flex justify-between"><span className="text-zinc-500">Precio base/share:</span><span>{fmtDec(selectedCorpData.fair_market_value / 100)}</span></div>
              <div className="flex justify-between"><span className="text-zinc-500">Premium/Discount:</span><span>{orderType === 'BUY_SHARES' ? '+3%' : '-3%'}</span></div>
              <div className="flex justify-between border-t border-zinc-800 pt-1 mt-1">
                <span className="text-zinc-300">{orderType === 'BUY_SHARES' ? 'Costo Estimado:' : 'Ingreso Estimado:'}</span>
                <span className={orderType === 'BUY_SHARES' ? 'text-red-400 font-bold' : 'text-lime-400 font-bold'}>
                  {fmt((selectedCorpData.fair_market_value / 100) * parseInt(shares || '0', 10) * (orderType === 'BUY_SHARES' ? 1.03 : 0.97))}
                </span>
              </div>
            </div>
          )}

          <Button onClick={submit} disabled={submitting || !selectedCorp} className="w-full bg-lime-400 hover:bg-lime-300 text-black font-bold uppercase">
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Encolar Orden'}
          </Button>

          <p className="text-[10px] text-zinc-600 font-mono">
            Banda precios: {fmt((selectedCorpData?.fair_market_value || 0) * 0.5)} – {fmt((selectedCorpData?.fair_market_value || 0) * 2.5)}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

function AdminTab({ state, resolveTurn, loading }) {
  const [logs, setLogs] = useState([]);
  useEffect(() => { api('admin/turn-log').then((d) => setLogs(d.logs)).catch(() => {}); }, [state.current_turn]);

  return (
    <div className="space-y-4">
      <Card className="bg-gradient-to-br from-orange-950/40 to-black border-orange-500/30">
        <CardHeader>
          <CardTitle className="text-orange-400 font-mono uppercase text-sm flex items-center gap-2"><Flame className="h-4 w-4" /> Control de Turnos (Admin)</CardTitle>
          <CardDescription className="text-zinc-400">Resolver turno ejecuta: trades → dividendos → mantenimiento → CEO → impuesto patrimonial → bancarrota.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4 flex-wrap">
            <div>
              <div className="text-xs font-mono uppercase text-zinc-500">Turno actual</div>
              <div className="text-5xl font-black text-orange-400">{state.current_turn}</div>
            </div>
            <Button onClick={resolveTurn} disabled={loading || state.locked}
              className="bg-orange-400 hover:bg-orange-300 text-black font-bold uppercase tracking-wider h-14 px-8">
              {loading ? <Loader2 className="h-5 w-5 animate-spin mr-2" /> : <Flame className="h-5 w-5 mr-2" />}
              Resolver Turno {state.current_turn}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="bg-zinc-950 border-zinc-900">
        <CardHeader><CardTitle className="text-lime-400 font-mono uppercase text-sm">Historial de Turnos</CardTitle></CardHeader>
        <CardContent>
          {logs.length === 0 ? (
            <p className="text-zinc-500 italic text-sm">Sin turnos resueltos todavía.</p>
          ) : (
            <div className="space-y-2 max-h-[400px] overflow-y-auto">
              {logs.map((l) => (
                <div key={l.turn_number} className="border border-zinc-900 rounded p-3 bg-zinc-900/30">
                  <div className="flex items-center justify-between mb-2">
                    <div className="font-bold font-mono">TURNO #{l.turn_number}</div>
                    <div className="text-[10px] text-zinc-500 font-mono">{new Date(l.resolved_at).toLocaleString('es-AR')}</div>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-xs font-mono">
                    <div><span className="text-zinc-500">Trades:</span> <span className="text-lime-400">{l.summary?.trades?.length || 0}</span></div>
                    <div><span className="text-zinc-500">Eventos:</span> <span className="text-orange-400">{l.summary?.events?.length || 0}</span></div>
                    <div><span className="text-zinc-500">FMV upd.:</span> <span className="text-cyan-400">{Object.keys(l.summary?.fmv_changes || {}).length}</span></div>
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
