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

// ─── Chistes internos del grupo testosterona💉 ────────────────────────────────
function getRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

/**
 * Devuelve un insulto/chiste del lore del grupo para cada tipo de evento.
 * @param {'broke'|'patent'|'alliance'|'intro'} type
 * @param {string} [playerName]
 */
function getRandomInsult(type, playerName) {
  const P = playerName || 'Un jugador';

  const insults = {
    intro: [
      `🏙️ *DISTRITO 77: TURNO RESUELTO* 🏙️\nApaguen el Spotify con Grey's Anatomy y miren los números, manga de autistas.`,
      `🏙️ *EL GOBIERNO INFORMA* 🏙️\nAcá el que no corre vuela, y el que no, pregunta si el mate es dulce o salado como el Reta.`,
      `🏙️ *CIERRE DE MERCADO* 🏙️\nTienen menos ganas de invertir que el viejo de Matemática de dar clases. Muévanse.`,
      `🏙️ *REPORTE DIARIO DE LA TESTO* 🏙️\nLa economía está más dura que los papás del Josef pensando que nos drogamos.`,
      `🏙️ *MERCADO CERRADO* 🏙️\nBienvenidos. Hay menos refuerzos de jerarquía acá que en el Talleres de Fassi, pero se sobrevive.`,
    ],
    broke: [
      `📉 ${P} entró en Capítulo 11. Cayó más duro que Benja cuando quiso patear la pelota y se fue de jeta al piso como un Lego.`,
      `📉 ${P} a la quiebra. Está más arruinado que el Cece vomitando en la casa de Franki en el UPD.`,
      `📉 Bancarrota para ${P}. Más perdido que Manu subiéndose al bondi con el uniforme de colegio pero sin la mochila.`,
      `📉 Que alguien asista a ${P}, está más deprimido que Alejo cuando mandó la pelota a la calle y casi le da a un auto.`,
      `📉 ${P} se quedó sin un peso. Ya está pidiendo 150pe por MercadoPago para tomar agua.`,
    ],
    patent: [
      `🔓 La patente de ${P} pasó a Open Source. Más regalada que la frente de Megamente de Josef.`,
      `🔓 Patente liberada. Todos le van a meter mano a esta tecnología, igual que a los vasos que desaparecieron mágicamente en la previa.`,
      `🔓 ${P} perdió la exclusividad. Esta tech ahora es de dominio público, como el video del "peruano chapo".`,
      `🔓 Se venció la patente de ${P}. Ahora cualquiera entra, como Alejo recortado de las fotos grupales.`,
    ],
    alliance: [
      `⚔️ ¡TRAICIÓN! ${P} rompió la alianza. Demostró menos lealtad que Tobe masacrando al perro en el juego de terror.`,
      `⚔️ ALIANZA ROTA. ${P} se cagó en el contrato. Se merece un pelotazo de gay en la nuca.`,
      `⚔️ ESCROW CONFISCADO. ${P} apuñaló a su aliado. Ni el Negro se animó a tanta maldad en Economía.`,
      `⚔️ RUPTURA HOSTIL. ${P} rompió el pacto. Pinta hacerle la "putovuelta" de castigo para que aprenda.`,
      `⚔️ ${P} traicionó a su socio. Tanta mujerfobia le terminó pudriendo los códigos.`,
    ],
  };

  const options = insults[type];
  if (!options) return '';
  return getRandom(options);
}

// ─── Builder del mensaje Telegram ────────────────────────────────────────────
// ─── Insults para Nissai ──────────────────────────────────────────────────────
function nissaiLine(r) {
  const MSGS = {
    AUDIT:    `🕵️ *${r.attacker}* auditó a *${r.target}* → −$${Number(r.amount || 0).toFixed(0)} de impuesto extra. Nadie es más chanta que vos, ${r.attacker}.`,
    HACK:     `💻 *${r.attacker}* hackeó los servidores de *${r.target}* → le robó ${Number(r.amount || 0).toFixed(0)} IC. El darkweb no duerme.`,
    BLACKOUT: `⚡ *${r.attacker}* cortó la luz en *${r.corp}* → −$${Number(r.totalDamage || 0).toFixed(0)} en dividendos anulados. El generador estaba en cuotas.`,
    RUMOR:    r.corp
      ? `📰 *${r.attacker}* esparció rumores sobre *${r.target}* → ${r.corp} cayó −10% FMV. Periodismo del bueno.`
      : `📰 *${r.attacker}* intentó hundir a *${r.target}* pero no tiene corps. IC devuelto, se guardó la vergüenza.`,
    FISCO:    `📋 *${r.attacker}* entregó a *${r.target}* al fisco → −3 turnos de exención. Judas tenía mejor marketing.`,
  };
  return MSGS[r.type] || '🥷 Sabotaje ejecutado';
}

function buildTelegramMessage(summary) {
  const { turn, trades = [], events = [], fmv_changes = {}, achievements = [], globalEvent, nissaiResults = [], casinoResults = [], bountyResults = [] } = summary;
  const lines = [];

  // Intro: el chiste YA contiene el título
  lines.push(getRandomInsult('intro'));
  lines.push(`*Turno #${turn}*`);
  lines.push(`━━━━━━━━━━━━━━━━━━━`);

  // 📈 Trades
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

  // 💀 Bancarrotas — con chiste interno
  const c11Events = events.filter(e => e.type === 'CHAPTER_11');
  for (const e of c11Events) {
    const username = e.username || 'Un jugador';
    lines.push('');
    lines.push(getRandomInsult('broke', username));
    lines.push(`  ↳ Inyección de emergencia: $2,000`);
  }

  // 🏆 Logros desbloqueados
  if (achievements.length > 0) {
    lines.push('');
    for (const a of achievements) {
      lines.push(`🏆 *¡LOGRO!* *${a.winnerName || a.winner}* → _${a.name || a.id}_`);
    }
  }

  // 🥷 Mercado Negro — Nissai
  if (nissaiResults.length > 0) {
    lines.push('');
    lines.push(`🥷 *MERCADO NEGRO — ${nissaiResults.length} sabotaje${nissaiResults.length > 1 ? 's' : ''} ejecutado${nissaiResults.length > 1 ? 's' : ''}:*`);
    for (const r of nissaiResults) {
      lines.push(`  ${nissaiLine(r)}`);
    }
  }

  // 🎰 Casino de Medianoche
  if (casinoResults.length > 0) {
    lines.push('');
    lines.push(`🎰 *CASINO DE MEDIANOCHE:*`);
    for (const r of casinoResults) {
      const resultEmoji = r.result === 'JACKPOT' ? '💰' : r.result === 'WIN' ? '✅' : r.result === 'SMALL_WIN' ? '🟡' : '💀';
      const net         = Number(r.payout) - Number(r.bet_amount);
      const profitStr   = net >= 0
        ? `+$${net.toFixed(0)} neto`
        : `-$${Math.abs(net).toFixed(0)}`;
      lines.push(`  ${resultEmoji} *${r.username}* — ${r.result} · apostó $${Number(r.bet_amount).toFixed(0)} → ${profitStr}`);
    }
  }

  // 🏴‍☠️ Bounty Board
  if (bountyResults.length > 0) {
    lines.push('');
    lines.push(`🏴‍☠️ *BOUNTY BOARD:*`);
    for (const r of bountyResults) {
      if (r.type === 'CLAIMED') {
        lines.push(`  💰 *${r.winner}* cobró la recompensa por hundir a *${r.target}* → +$${Number(r.reward).toFixed(0)}`);
      } else if (r.type === 'EXPIRED') {
        lines.push(`  ⏰ Bounty sobre *${r.target}* venció sin cobrarse. Dinero devuelto.`);
      }
    }
  }

  // 🌐 Evento global (si hubo)
  if (globalEvent) {
    lines.push('');
    lines.push(`🌐 *EVENTO GLOBAL:* ${globalEvent.label}`);
    lines.push(`  ↳ ${globalEvent.desc}`);
    if (globalEvent.district) {
      const pctStr = globalEvent.pct > 0 ? `+${(globalEvent.pct * 100).toFixed(0)}%` : `${(globalEvent.pct * 100).toFixed(0)}%`;
      lines.push(`  ↳ Zona: *${globalEvent.district}* · FMV ${pctStr}`);
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
