import { NextResponse } from 'next/server';
import { resolveTurn } from '@/lib/gameLogic';

export const maxDuration = 60;

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID   = process.env.TELEGRAM_CHAT_ID;

async function sendTelegramMessage(text) {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) return;
  await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text, parse_mode: 'Markdown' }),
  });
}

function buildTelegramMessage(summary) {
  const { turn, trades = [], events = [], fmv_changes = {}, achievements = [] } = summary;
  const lines = [];

  lines.push(`🏙️ *DISTRITO 77 · TURNO ${turn} RESUELTO*`);
  lines.push(`━━━━━━━━━━━━━━━━━━━`);

  // Trades
  if (trades.length > 0) {
    lines.push(`📈 *Trades ejecutados:* ${trades.length}`);
  }

  // 🎲 Prendas — castigos físicos (solo aviso al grupo, sin código)
  const prendasEvents = events.filter(e => e.type === 'PRENDAS');
  if (prendasEvents.length > 0) {
    lines.push('');
    lines.push(`🎲 *PRENDAS DEL TURNO ${turn}:*`);
    for (const e of prendasEvents) {
      lines.push(`  ⚠️ *${e.username}* cayó en la casilla ${e.position} — ¡hay que cumplir el castigo físico!`);
    }
  }

  // 🛋️ Visitas al Psicólogo
  const psicEvents = events.filter(e => e.type === 'PSICOLOGO_VISIT');
  for (const e of psicEvents) {
    lines.push(`🛋️ *${e.username}* fue al Psicólogo (casilla 10) y pagó $${e.fee}`);
  }

  // 🚶 Alquileres de tránsito
  const rentEvents = events.filter(e => e.type === 'TRANSIT_RENT');
  for (const e of rentEvents) {
    lines.push(`🚶 *${e.username}* pagó $${e.rent} de tránsito en _${e.corp}_`);
  }

  // 💀 Bancarrotas
  const c11Events = events.filter(e => e.type === 'CHAPTER_11');
  for (const e of c11Events) {
    lines.push(`💀 *${e.username || 'Un jugador'}* entró en Capítulo 11 (inyección $2,000)`);
  }

  // 🏆 Logros desbloqueados
  if (achievements.length > 0) {
    lines.push('');
    for (const a of achievements) {
      lines.push(`🏆 *¡LOGRO!* *${a.winnerName || a.winner}* → _${a.name || a.id}_`);
    }
  }

  // 📊 Top FMV movers (fmv_changes = { "Corp Name": { from, to } })
  const fmvEntries = Object.entries(fmv_changes);
  if (fmvEntries.length > 0) {
    const movers = fmvEntries
      .map(([name, change]) => ({
        name,
        pct: (change && typeof change === 'object' && change.from > 0)
          ? ((change.to - change.from) / change.from) * 100
          : 0,
      }))
      .filter(m => Math.abs(m.pct) >= 0.5)
      .sort((a, b) => Math.abs(b.pct) - Math.abs(a.pct))
      .slice(0, 3);
    if (movers.length > 0) {
      lines.push('');
      lines.push(`📊 *Top movers FMV:*`);
      for (const m of movers) {
        const sign = m.pct >= 0 ? '▲' : '▼';
        lines.push(`  ${sign} ${m.name}: ${m.pct > 0 ? '+' : ''}${m.pct.toFixed(1)}%`);
      }
    }
  }

  lines.push('');
  lines.push(`_${new Date().toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' })} ART_`);
  lines.push(`👉 distrito77.vercel.app`);

  return lines.join('\n');
}

export async function GET(request) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const summary = await resolveTurn();
    const message = buildTelegramMessage(summary);
    await sendTelegramMessage(message);
    return NextResponse.json({ ok: true, turn: summary.turn });
  } catch (e) {
    console.error('[CRON] Error en resolveTurn:', e);
    await sendTelegramMessage(`❌ *ERROR en turno automático*\n\`${e.message}\`\nRevisá los logs en Vercel.`);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
