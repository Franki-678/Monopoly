# ADMIN MASTER GUIDE — DISTRITO 77
> Guía técnica completa para el admin (Franki). Última actualización: Mayo 2026.

---

## 1. STACK & ARQUITECTURA

| Capa | Tecnología |
|------|-----------|
| Frontend | Next.js 14 App Router, React, Tailwind CSS, Framer Motion |
| Backend | Next.js API Routes (Edge-compatible) |
| Base de datos | Supabase PostgreSQL (postgres npm tag template) |
| Deploy | Vercel (plan Hobby OK para 7 jugadores) |
| Cron | Vercel Cron → `/api/cron/resolve-and-notify` @ `0 21 * * *` (00:00 ART = 21:00 UTC) |
| Notificaciones | Telegram Bot API (`sendMessage` con Markdown) |

### Variables de entorno requeridas
```
POSTGRES_URL=...           # Supabase connection string (pooler)
TELEGRAM_BOT_TOKEN=...     # BotFather token
TELEGRAM_CHAT_ID=...       # ID del grupo testosterona💉
CRON_SECRET=...            # Bearer token para el endpoint del cron
ADMIN_SECRET=...           # Para /api/reset y acciones admin sensibles
```

---

## 2. TABLERO — 20 CASILLAS

```
Layout (sentido horario, fila superior = inicio):
Casilla  0  1  2  3  4  [5-PRENDAS]  6  7  8  9  [10-PSICOLOGO]
         19                                          11
         18                                          12
         17                                          13
         16                                          14
[15-PRENDAS]  14 13 12 11 [10-PSICOLOGO]

Grid 6×6 visual: casillas 0-5 en fila 1, 6-9 en col 6, 10-15 en fila 6 (inverso), 16-19 en col 1
```

| Casilla | Tipo | Efecto |
|---------|------|--------|
| 5, 15 | PRENDAS | Castigo físico acordado. Sin efecto económico. Telegram avisa. |
| 10 | PSICOLOGO | El jugador paga $200. El dinero va a SANTI (PSYCHOLOGIST). |
| Resto | CORP | Si hay accionistas ajenos: el jugador paga alquiler de tránsito. |

**Tránsito**: `rent = FMV_corp × 0.05`. Se distribuye proporcionalmente entre accionistas ajenos (no el CEO).  
3 corps no tienen `board_position` (off-board): no generan tránsito.

---

## 3. ECONOMÍA — FÓRMULAS COMPLETAS

### 3.1 Precio por share

```
perShare    = FMV / total_shares
floorShare  = perShare × 0.50   (precio mínimo absoluto)
ceilShare   = perShare × 2.50   (precio máximo absoluto)

buyPrice  = clamp(perShare × 1.03 × roleMultiplier, floorShare, ceilShare)
sellPrice = clamp(perShare × 0.97,                  floorShare, ceilShare)

Con fin-2 (Arbitraje): sellDiscount = 0.985  → sellPrice = perShare × 0.985
Con fin-4 (HFT Bot):   buyPremium   = 1.015  → buyPrice  = perShare × 1.015 × roleMultiplier
```

### 3.2 Multiplicadores de rol en compra

| Rol | Multiplicador |
|-----|--------------|
| DATA_SCIENTIST | +5% (×1.05) |
| MECH_ENGINEER (Zona Industrial) | -20% (×0.80) |
| Resto | ×1.00 |

### 3.3 FMV dinámico

```
netDemand  = Σbuys.shares - Σsells.shares  (para esa corp ese turno)
fmvDelta   = netDemand × 0.03 × perShare
newFMV     = clamp(fmv + fmvDelta, fmv×0.5, fmv×1.5)

Excepción: si fmvDelta < 0 AND el CEO tiene urb-4 → fmvDelta = 0 (floor activado)
urb-2: si el CEO tiene urb-2 → newFMV × 1.02 al final del turno (CEO FMV +2%/turno)
```

### 3.4 Dividendos por turno

```
incMult  = 1 + 0.01 × turn^1.15   (escala polinomial con el tiempo)

dividendo_player =
  Σ_corps [ base_income × incMult × (shares / total_shares)
            × roleMultip
            × ceoBonus    (si CEO y tiene urb-3: ×1.10)
            × monoBonus   (si shares > 50% y tiene log-4: ×1.05) ]

roleMultip:
  ECONOMIST     → 1.10
  PSYCHOLOGIST  → 0.85
  MECH_ENGINEER:
    Zona Industrial → 1.02
    Resto           → 0.85
  Otros          → 1.00
```

### 3.5 Mantenimiento por turno

```
costMult = 1.02^(turn-1)   (exponencial — se encarece cada turno)

mantenimiento_player =
  Σ_corps [ (shares / total_shares) × FMV × 0.015 × costMult
            × urb1Factor  (0.90 si tiene urb-1, sino 1.0)
            × log3Factor  (0.95 si tiene log-3, además de urb-1) ]

SYSTEMS_ENGINEER paga además $50 fijos de servidor por turno (todos los players con ese rol).
```

### 3.6 Impuesto progresivo

```
Net Worth = liquid_cash + Σ_corps[(shares/total_shares) × FMV]

Tramos (se aplica sobre el TOTAL del NW, no sobre el exceso solo):
  $0     – $10.000  →   0%
  $10K   – $50K     →   2.5% sobre el tramo
  $50K   – $150K    →   7%   sobre el tramo
  > $150K           →  15%   (12% si es ECONOMIST)

fin-3 (Hedging): impuesto final × 0.80

Exención: si tax_exempt_turns > 0 → impuesto = $0 ese turno (se decrementa 1 por turno)
```

**Ejemplo práctico**:
- NW = $80.000, rol normal, sin tech:
  - Tramo 0-10k: $0
  - Tramo 10k-50k = $40.000 × 0.025 = $1.000
  - Tramo 50k-80k = $30.000 × 0.07  = $2.100
  - **Total: $3.100**
- Con fin-3: $3.100 × 0.80 = **$2.480**

### 3.7 IC (Intellectual Capital)

```
baseIC  = 30 + 2 × turn    (crece linealmente)

IC_player = baseIC
  × (1 + 0.05 si log-1 + 0.15 si log-2)
  × (1.20 si DATA_SCIENTIST, sino 1.0)
```

### 3.8 Chapter 11

```
Trigger:  liquid_cash < 0 al finalizar el turno (post-mantenimiento, post-impuesto)
Inyección: +$2.000 de liquidez de emergencia
Tax exempt: tax_exempt_turns = 5 (5 turnos sin impuesto)
SANTI cobra: 5% de $2.000 = $100 por quiebra (si el que quiebra no es SANTI)
Recovery: se marca bankrupt=FALSE cuando liquid_cash >= $500 al inicio del siguiente turno
```

---

## 4. TECH TREE COMPLETO

| Nodo | Rama | Tier | Costo IC | Efecto |
|------|------|------|----------|--------|
| fin-1 | FINANCIERA | 1 | 200 | Visualización histórica FMV (+insight UI) |
| fin-2 | FINANCIERA | 2 | 400 | Sell spread: 3% → 1.5% |
| fin-3 | FINANCIERA | 3 | 700 | Wealth tax efectivo −20% |
| fin-4 | FINANCIERA | 4 | 1200 | Buy premium: 3% → 1.5% |
| urb-1 | URBANO | 1 | 200 | Mantenimiento −10% |
| urb-2 | URBANO | 2 | 400 | CEO: FMV +2%/turno en tus corps |
| urb-3 | URBANO | 3 | 700 | CEO: dividendos +10% en tus corps |
| urb-4 | URBANO | 4 | 1200 | FMV floor: tus corps son inmunes a caídas por ventas |
| log-1 | LOGÍSTICA | 1 | 200 | IC generado +5%/turno |
| log-2 | LOGÍSTICA | 2 | 400 | IC generado +15%/turno (adicional a log-1) |
| log-3 | LOGÍSTICA | 3 | 700 | Mantenimiento −5% (adicional a urb-1) |
| log-4 | LOGÍSTICA | 4 | 1200 | Si holdeás >50% de una corp: dividendos +5% de esa corp |

**Régimen de patentes**: Un nodo desbloqueado es PATENT por 10 turnos → luego OPEN_SOURCE (todos se benefician automáticamente). Los efectos OPEN_SOURCE se aplican igual que los PATENT.

---

## 5. ALIANZAS — MECÁNICA COMPLETA

1. Jugador A propone alianza a jugador B con un % de escrow (default 10%).
2. Ambos bloquean el cash acordado en escrow (sale de su `liquid_cash` inmediatamente).
3. Ruptura hostil: si cualquiera intenta comprar shares en una corp cuyo CEO es el aliado → ruptura automática en Phase 0.
4. Al romperse: el escrow del agresor va al agredido. SANTI cobra 5% del total.
5. Disolución pacífica: cada uno recupera su escrow sin penalidad.

**Cálculo**:
```
escrow_A = liquid_cash_A × (escrow_pct / 100)
escrow_B = liquid_cash_B × (escrow_pct / 100)
totalEscrow = escrow_A + escrow_B
commission  = totalEscrow × 0.05   (va a SANTI)
toVictim    = totalEscrow - commission
```

---

## 6. ROLES Y VENTAJAS

| Jugador | Rol | Ventaja | Penalidad |
|---------|-----|---------|----------|
| FRANKI | DATA_SCIENTIST | IC base + dividendos +5% (compra +5% más cara) | Sin exenciones especiales |
| CECE | ECONOMIST | Dividendos ×1.10, tax top bracket 12% | — |
| TOBE | ECONOMIST | Ídem CECE | — |
| SANTI | PSYCHOLOGIST | Cobra honorarios en terapia, quiebra, escrow | Dividendos ×0.85 |
| BEN | SYSTEMS_ENGINEER | — | $50 fijos por turno |
| MANU | MECH_ENGINEER | Compra en Zona Industrial −20% | Dividendos ×0.85 en otras zonas |
| RETA | SYSTEMS_ENGINEER | — | $50 fijos por turno |

---

## 7. LOGROS GLOBALES (one-time, primer jugador en lograrlo)

| ID | Nombre | Premio | Condición |
|----|--------|--------|-----------|
| first_ceo | El Monopolista Precoz | $500 cash | Primero en ser CEO de cualquier corp |
| tier2_tech | Mente Brillante | 200 IC | Primero en desbloquear un nodo Tier 2 |
| first_alliance | El Diplomático | $300 cash | Primeros en firmar alianza activa |
| first_10pct | El Inversor Precoz | $100 cash | Primero en tener ≥10 shares de una corp |
| wolf_wall_st | El Lobo de Wall Street | $300 cash | Primero en ejecutar ≥5 trades en un turno |
| chapter11_survivor | Ave Fénix | 150 IC | Primero en recuperarse del Chapter 11 |

---

## 8. ENDPOINTS API

| Método | Ruta | Descripción |
|--------|------|-------------|
| POST | `/api/init` | Crea schema + seed si vacío |
| POST | `/api/auth/login` | Login con username+PIN → devuelve player |
| GET | `/api/dashboard/:id` | Net worth, portfolio, audit, órdenes pendientes |
| GET | `/api/market` | Lista de corps con owned_shares y ceo_name |
| GET | `/api/players` | Lista de jugadores con net_worth |
| GET | `/api/game/state` | current_turn + locked |
| POST | `/api/orders` | Crea orden BUY_SHARES / SELL_SHARES |
| DELETE | `/api/orders/:id` | Cancela orden PENDING |
| POST | `/api/dice/roll` | Tira dado (1 por turno por jugador) |
| GET | `/api/dice/status/:id` | Devuelve roll actual del turno |
| GET | `/api/alliances` | Lista alianzas del jugador |
| POST | `/api/alliances` | Propone alianza |
| PATCH | `/api/alliances/:id` | Acepta / rechaza / disuelve alianza |
| GET | `/api/tech` | Estado del tech tree del jugador |
| POST | `/api/tech/unlock` | Desbloquea nodo (paga IC) |
| GET | `/api/admin/turn-log` | Historial de turnos resueltos |
| POST | `/api/admin/resolve-turn` | Resolución manual (admin) |
| GET | `/api/cron/resolve-and-notify` | Endpoint del cron (Bearer CRON_SECRET) |

---

## 9. VERCEL CRON — CONFIGURACIÓN

`vercel.json`:
```json
{
  "crons": [
    {
      "path": "/api/cron/resolve-and-notify",
      "schedule": "0 21 * * *"
    }
  ]
}
```
`00:00 ART = 21:00 UTC` (Argentina no cambia de horario).

El cron envía automáticamente al grupo de Telegram el resumen del turno con insultos del lore.

---

## 10. RESET COMPLETO (si querés reiniciar el juego)

```bash
# 1. Llamar al endpoint de reset (requiere ADMIN_SECRET en header)
curl -X POST https://distrito77.vercel.app/api/reset \
  -H "x-admin-secret: TU_ADMIN_SECRET"

# 2. Volver a seedear
curl -X POST https://distrito77.vercel.app/api/init
```

O desde Supabase Studio: `TRUNCATE TABLE players CASCADE;` seguido de un POST a `/api/init`.

---

## 11. TROUBLESHOOTING COMÚN

| Error | Causa probable | Fix |
|-------|---------------|-----|
| `column 'id' does not exist` | CTE con alias de columna ambiguo en Phase 5 tax | ✅ Corregido en Mayo 2026 — usar `n.player_id` |
| `duplicate key value (player_id, turn_number)` | Jugador tirando dado dos veces | Normal — UNIQUE constraint en daily_rolls |
| `Unauthorized` en cron | CRON_SECRET no matchea o no está seteado en Vercel | Verificar env vars en Vercel Dashboard |
| Cron no ejecuta | Schedule en UTC, no ART — verificar vercel.json | `0 21 * * *` = 00:00 ART |
| `relation "tech_unlocks" does not exist` | Schema no inicializado | POST a `/api/init` |
| FMV no cambia | netDemand = 0 (buys == sells exactamente) | Normal |

---

*Generado por Claude · Proyecto Distrito 77 · campana hasta Dic 2025*
