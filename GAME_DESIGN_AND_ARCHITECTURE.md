# GAME DESIGN & ARCHITECTURE — DISTRITO 77
### Documento Maestro de Diseño (GDD) · Fuente Única de Verdad

> **Estado del proyecto:** Codebase funcional al 100% (Emergent Phase 1–4). Las secciones marcadas con `🚧 PENDIENTE` son las que debemos implementar.  
> **Campaña:** Duración estimada hasta el **31 de diciembre de 2025** (~240 turnos diarios).  
> **Stack:** Next.js 14 · Supabase (PostgreSQL) · Tailwind + Framer Motion · Vercel (hosting + cron)

---

## Tabla de Contenidos

1. [Visión General & Filosofía de Diseño](#1-visión-general--filosofía-de-diseño)
2. [Loop Central del Juego — Sistema WEGO](#2-loop-central-del-juego--sistema-wego)
3. [Motor Económico — Fórmulas Exactas](#3-motor-económico--fórmulas-exactas)
4. [Esquema de Base de Datos](#4-esquema-de-base-de-datos)
5. [El Árbol Tecnológico (Tech Tree)](#5-el-árbol-tecnológico-tech-tree)
6. [Roles Hardcodeados de Jugadores](#6-roles-hardcodeados-de-jugadores--)
7. [Sistema de Alianzas y Contratos Inteligentes](#7-sistema-de-alianzas-y-contratos-inteligentes)
8. [Dado Diario Anticipado](#8-dado-diario-anticipado)
9. [Sistema de Logros Globales](#9-sistema-de-logros-globales--)
10. [Vercel Cron + Bot de Telegram](#10-vercel-cron--bot-de-telegram--)
11. [Interfaz de Usuario (UI/UX)](#11-interfaz-de-usuario-uiux)
12. [Mecánicas Anti-Rage & Balance](#12-mecánicas-anti-rage--balance)
13. [Hoja de Ruta de Implementación](#13-hoja-de-ruta-de-implementación)
14. [Convenciones de Código](#14-convenciones-de-código)

---

## 1. Visión General & Filosofía de Diseño

### 1.1 El Problema Original (El "Factor Tobe")

El Monopoly clásico destruye amistades porque:
- Un jugador puede exigir precios arbitrarios y extorsivos en los tratos.
- Una mala tirada de dados en un turno tardío elimina al jugador permanentemente.
- El juego termina de forma abrupta sin mecanismos de recuperación.
- No hay incentivo para aliarse; las alianzas son verbales y sin consecuencias.

### 1.2 La Solución: Distrito 77

**Distrito 77** es un PBBG (*Persistent Browser-Based Game*) asíncrono que resuelve cada uno de estos problemas a nivel de código:

| Problema Clásico | Solución en D77 |
|---|---|
| Precios extorsivos | Bandas de precio forzadas (50%–250% del FMV) |
| Eliminación por bancarrota | Capítulo 11: el sistema inyecta liquidez y congela deudas |
| El rico se escapa infinito | Impuesto Progresivo al Patrimonio (hasta 15%) |
| Alianzas sin consecuencias | Escrow bloqueado; traición automáticamente confisca garantías |
| Ventaja del primero en jugar | Sistema WEGO: todas las órdenes se resuelven simultáneamente |

### 1.3 Pilares de Diseño

1. **Asincronismo Puro:** Los jugadores planifican durante el día. El servidor resuelve todo junto a las 00:00 ART.
2. **Economía Persistente:** La partida dura meses. La economía debe aguantar sin hiperinflación.
3. **Identidad por Rol:** Cada jugador tiene habilidades únicas ligadas a su carrera real, creando estrategias complementarias.
4. **Dopamina Progresiva:** Dado animado, flashs de ganancias/pérdidas, logros globales, y el Bot de Telegram que "salsa" al grupo.

---

## 2. Loop Central del Juego — Sistema WEGO

### 2.1 Definición del Sistema WEGO

WEGO (*We Go simultaneously*) es un sistema de resolución de turnos simultánea. No importa quién se loguea primero; todas las órdenes quedan en cola y el servidor las ejecuta en un único batch.

```
┌─────────────────────────────────────────────────────────┐
│                    DÍA (Fase de Planificación)           │
│                                                          │
│  Jugador entra → Tira dado → Ve resultados → Encola     │
│  órdenes (comprar/vender/aliarse/invertir en tech)       │
│                                                          │
│  ⚠️ Las órdenes son SECRETAS; nadie ve las de otros      │
└─────────────────────────┬───────────────────────────────┘
                          │
                    00:00 ART
                          │
                          ▼
┌─────────────────────────────────────────────────────────┐
│                 RESOLUCIÓN DE TURNO (Fase WEGO)          │
│                                                          │
│  Phase 0: Detección de ruptura de alianzas              │
│  Phase 1: Procesamiento de trades (compra/venta)         │
│  Phase 2: Pago de dividendos (CTE bulk)                  │
│  Phase 3: Cobro de mantenimiento (CTE bulk)              │
│  Phase 4: Reasignación de CEO (bulk)                     │
│  Phase 5: Impuesto Progresivo al Patrimonio (CTE)        │
│  Phase 5.5: Acumulación de IC + expiración de patentes   │
│  Phase 6: Detección de Capítulo 11                       │
│  Finalize: Guardar turn_log, incrementar current_turn    │
└─────────────────────────────────────────────────────────┘
```

### 2.2 El Día a Día de un Jugador (15 minutos)

1. **Entrar y tirar el dado** — Un modal forzado muestra el dado animado. El resultado (1–6) queda registrado en la DB y no puede cambiarse. El jugador sabe cuántas casillas avanzará cuando se resuelva el turno.
2. **Ver la Auditoría de Ingresos** — Resumen completo del turno anterior: dividendos cobrados, mantenimiento pagado, impuestos, penalidades.
3. **Analizar el Mercado** — Ver el FMV de las 20 corporaciones, quién es CEO de cada una, cuántas acciones quedan disponibles.
4. **Gestionar el Tech Tree** — Invertir IC en nodos tecnológicos para desbloquear bonificadores matemáticos.
5. **Gestionar Alianzas** — Proponer, aceptar o disolver contratos de escrow con otros jugadores.
6. **Encolar Órdenes** — Dejar programadas compras/ventas de acciones (con precio límite opcional como "Plan B").

> **Nota de UX:** El jugador puede encolar múltiples órdenes por turno. Si la primera falla (precio spike), la segunda se ejecuta automáticamente.

### 2.3 Algoritmo de Resolución — Detalle Técnico

El algoritmo vive en `lib/gameLogic.js → resolveTurn()`. Usa CTEs (Common Table Expressions) de PostgreSQL para procesar todos los jugadores en una sola query en lugar de un loop por jugador. Esto redujo el tiempo de resolución de ~30s a ~1.8s.

**Secuencia de operaciones:**

```
1. game_state.locked = TRUE          ← Bloquear nuevas órdenes durante resolución
2. Phase 0: Alliance breach scan     ← detectar traiciones ANTES de procesar trades
3. Phase 1: Process orders           ← SELL primero, luego BUY (por corp, por orden de llegada)
4. Phase 2: Dividends CTE            ← UPDATE players bulk
5. Phase 3: Maintenance CTE          ← UPDATE players bulk
6. Phase 4: CEO reassign             ← DISTINCT ON (corporation_id) ORDER BY shares DESC
7. Phase 5: Wealth tax CTE           ← brackets en SQL puro
8. Phase 5.5: IC accumulation        ← baseIc = 30 + 2*turn
9. Phase 5.5: Patent flip            ← status='PATENT' → 'OPEN_SOURCE' si (turn - unlocked_at) >= 10
10. Phase 6: Chapter 11              ← liquid_cash < 0 AND bankrupt = FALSE
11. game_state.current_turn += 1     ← Avanzar turno
12. game_state.locked = FALSE        ← Desbloquear
```

---

## 3. Motor Económico — Fórmulas Exactas

Todas las constantes económicas están centralizadas en `lib/gameLogic.js → CONFIG`.

### 3.1 Capital Inicial

| Parámetro | Valor |
|---|---|
| Cash inicial por jugador | `$5,000` |
| IC inicial por jugador | `500 IC` |
| Acciones distribuidas por corporación | 30–60% del total |
| Acciones restantes en el mercado | 40–70% del total |

### 3.2 Ingresos — Crecimiento Polinómico

Los dividendos que genera cada corporación escalan según el turno actual usando una fórmula polinómica:

```
incomeMultiplier(turn) = 1 + 0.01 × turn^1.15
```

El ingreso de un jugador para un turno `t` es:
```
dividendo_jugador = Σ (base_income_corp × incomeMultiplier(t) × (shares_jugador / total_shares_corp))
```

**Proyección a largo plazo:**
- Turno 1:   multiplicador = 1.01
- Turno 30:  multiplicador ≈ 1.43
- Turno 90:  multiplicador ≈ 2.63
- Turno 240: multiplicador ≈ 5.80

### 3.3 Costos — Escalado Exponencial

El mantenimiento y los costos de assets escalan exponencialmente para crear presión deflacionaria natural en el late-game:

```
costMultiplier(turn) = 1.02^(turn - 1)
```

| Turno | cost_mult | income_mult | Ratio costos/ingresos |
|---|---|---|---|
| T1   | 1.000 | 1.010 | 0.99x |
| T30  | 1.811 | 1.430 | 1.27x |
| T90  | 5.943 | 2.630 | 2.26x |
| T240 | 117.5 | 5.800 | 20.3x |

> **Efecto buscado:** En el late-game (T90+), los costos de mantenimiento superan ampliamente los ingresos, forzando estrategias de eficiencia. Nadie puede acumular propiedades indefinidamente sin invertir en el Tech Tree.

### 3.4 Mantenimiento de Propiedades (Currency Sink)

Se cobra como porcentaje del FMV de las acciones que posee cada jugador:

```
mantenimiento_jugador = Σ [(shares / total_shares) × FMV_corp × 0.015 × costMultiplier(turn)]
```

**Constante:** `MAINTENANCE_RATE = 0.015` (1.5% por turno del valor de la posición)

### 3.5 Impuesto Progresivo al Patrimonio (Wealth Tax)

El patrimonio neto (`net_worth`) se calcula como:
```
net_worth = liquid_cash + Σ [(shares / total_shares) × FMV_corp]
```

Los brackets aplicados son **marginales** (cada tramo solo paga la tasa de ese tramo):

| Tramo de Patrimonio | Tasa Marginal | Descripción |
|---|---|---|
| `$0 – $10,000` | **0%** | Protección de clase baja |
| `$10,001 – $50,000` | **2.5%** | Clase media |
| `$50,001 – $150,000` | **7%** | Clase alta |
| `> $150,001` | **15%** | Monopolista |

**Ejemplo:** Un jugador con NW = $80,000 paga:
```
= ($50,000 - $10,000) × 2.5%  +  ($80,000 - $50,000) × 7%
= $1,000                        +  $2,100
= $3,100 de impuesto total
```

**Exención:** Si `tax_exempt_turns > 0` (jugador en Capítulo 11), el impuesto es `$0`.

### 3.6 Valuación de Mercado (FMV Dinámico)

El Valor de Mercado Justo (*Fair Market Value*) de cada corporación ajusta dinámicamente según la demanda del turno:

```
net_demand = (total_shares_compradas) - (total_shares_vendidas)
fmv_delta  = net_demand × 0.03 × (FMV_actual / 100)
nuevo_FMV  = clamp(FMV_actual + fmv_delta, FMV_actual × 0.5, FMV_actual × 1.5)
```

**Bandas de ajuste:** El FMV no puede subir o bajar más de ±50% en un solo turno.

**Precio de transacción** (con spread de mercado):
- Compra: `precio_compra = (FMV / 100) × 1.03`  (+3% premium)
- Venta:  `precio_venta  = (FMV / 100) × 0.97`  (-3% descuento)

### 3.7 Bandas Anti-Extorsión

Ningún trade persona-a-persona puede realizarse fuera de:
```
precio_floor   = FMV × 0.50   (50% del valor de mercado)
precio_ceiling = FMV × 2.50   (250% del valor de mercado)
```

Esto elimina el "te pido $2000 por un terreno de $100 para bloquearte."

### 3.8 Capital Intelectual (IC) — Generación Base

El IC es la moneda exclusiva del Tech Tree. Se acumula automáticamente cada turno:

```
IC_base(turn) = 30 + (2 × turn)
```

Modificadores por nodos tecnológicos desbloqueados:
```
IC_total = IC_base × (1 + 0.05 × [tiene log-1]) + 0.15 × [tiene log-2])
```

**Curva de acumulación:**
- T1: +32 IC
- T30: +90 IC
- T90: +210 IC
- T240: +510 IC

> El IC también se ve afectado por los **Roles** de los jugadores (ver sección 6).

### 3.9 Capítulo 11 — Protección de Bancarrota

**Trigger:** `liquid_cash < 0 AND bankrupt = FALSE`

**Proceso automático en la Phase 6:**
1. Inyección de liquidez: `liquid_cash += $2,000`
2. Flag: `bankrupt = TRUE`
3. `tax_exempt_turns = 5` (5 turnos sin pagar Wealth Tax)

**Recuperación:** `bankrupt = FALSE` cuando `liquid_cash >= $500`

> **Intención de diseño:** El Capítulo 11 no debe activarse en condiciones normales. Es la red de contención para decisiones muy malas (vender todo barato, comprar a precio inflado, quedar expuesto a impuestos con bajo cash).

---

## 4. Esquema de Base de Datos

Todas las tablas se crean idempotentemente en `lib/schema.js → createSchema()`.

### 4.1 Diagrama de Relaciones

```
players (1) ──< shareholdings >── (N) corporations
players (1) ──< orders
players (1) ──< transactions
players (1) ──< daily_rolls
players (1) ──< tech_unlocks >── (N) tech_nodes
players (1) ──< alliances (como proposer_id)
players (1) ──< alliances (como recipient_id)
corporations (1) ──── players (como ceo_player_id)
game_state (singleton, id=1)
turn_log
```

### 4.2 Tablas Principales

#### `players`
| Columna | Tipo | Descripción |
|---|---|---|
| `id` | UUID PK | Identificador único |
| `username` | TEXT UNIQUE | Alias en mayúsculas (FRANCO, NOVA...) |
| `pin` | TEXT | PIN de 4 dígitos |
| `liquid_cash` | NUMERIC(14,2) | Dinero líquido disponible |
| `intellectual_capital` | NUMERIC(14,2) | Moneda del Tech Tree |
| `is_admin` | BOOLEAN | Solo FRANCO puede resolver turnos |
| `bankrupt` | BOOLEAN | Flag de Capítulo 11 activo |
| `tax_exempt_turns` | INT | Turnos restantes de exención fiscal |
| `avatar_color` | TEXT | Color HEX del avatar |
| `player_role` | TEXT | 🚧 **PENDIENTE** — rol hardcodeado de la carrera |

#### `corporations`
| Columna | Tipo | Descripción |
|---|---|---|
| `id` | UUID PK | — |
| `name` | TEXT UNIQUE | Nombre streetwear (BARRIO 77 SNEAKERS...) |
| `district` | TEXT | Zona geográfica |
| `tagline` | TEXT | Frase corta de flavor |
| `fair_market_value` | NUMERIC(14,2) | FMV total de la empresa (100 shares = 1 unidad) |
| `base_income` | NUMERIC(14,2) | Ingreso base por turno (4.5%–7% del FMV inicial) |
| `total_shares` | INT | Siempre 100 |
| `ceo_player_id` | UUID FK → players | Jugador con más shares |

#### `shareholdings`
Tabla pivote many-to-many. Restricción `UNIQUE(player_id, corporation_id)`.

#### `orders`
Cola de órdenes PENDIENTES para el turno actual. Los estados posibles son: `PENDING → EXECUTED / PARTIAL / REJECTED`.

#### `alliances`
Estados del ciclo de vida: `PROPOSED → ACTIVE → BROKEN / DISSOLVED / REJECTED / CANCELLED`.

#### `tech_unlocks`
Registro de qué jugador desbloqueó qué nodo. Estado: `PATENT → OPEN_SOURCE` (flip automático a los 10 turnos).

#### `daily_rolls`
`UNIQUE(player_id, turn_number)` garantiza que cada jugador solo tire una vez por turno.

#### `game_state`
Singleton (solo existe `id=1`). Almacena `current_turn` y el flag `locked` (evita resoluciones concurrentes).

---

## 5. El Árbol Tecnológico (Tech Tree)

### 5.1 Sistema de Patentes Open Source

El Tech Tree tiene **3 ramas** con **4 niveles** cada una. Los nodos se desbloquean gastando IC.

**Mecánica de Patentes:**
1. **Primera compra** de un nodo → Status `PATENT`. Exclusividad de **10 turnos**.
2. Otros jugadores **NO PUEDEN** comprar ese nodo mientras haya patente activa.
3. Pasados exactamente 10 turnos → Flip automático a `OPEN_SOURCE`.
4. En estado Open Source, el costo baja al **25% del base_cost** para todos.

**Excepción:** El rol de **Ben (Ingeniería en Sistemas)** puede ignorar la exclusividad de la patente (ver Sección 6).

### 5.2 Ramas y Nodos Actuales

#### Rama: INGENIERÍA FINANCIERA (cyan)

| ID | Tier | Nombre | Costo IC | Efecto Matemático |
|---|---|---|---|---|
| `fin-1` | T1 | Análisis Técnico | 200 | UI: histórico detallado de FMV |
| `fin-2` | T2 | Arbitraje | 400 | Sell spread: -1.5% (de 3% → 1.5%) |
| `fin-3` | T3 | Hedging | 700 | Wealth Tax efectivo × 0.80 (−20%) |
| `fin-4` | T4 | HFT Bot | 1,200 | Buy spread: -1.5% (de 3% → 1.5%) |

#### Rama: DESARROLLO URBANO (lime)

| ID | Tier | Nombre | Costo IC | Efecto Matemático |
|---|---|---|---|---|
| `urb-1` | T1 | Zonificación | 200 | Costo de mantenimiento × 0.90 (−10%) |
| `urb-2` | T2 | Renovación | 400 | FMV de corps donde sos CEO +2% por turno |
| `urb-3` | T3 | Gentrificación | 700 | Dividendos como CEO +10% extra |
| `urb-4` | T4 | Distrito Premium | 1,200 | Tus corps son inmunes a caídas de FMV por ventas |

#### Rama: LOGÍSTICA (orange)

| ID | Tier | Nombre | Costo IC | Efecto Matemático |
|---|---|---|---|---|
| `log-1` | T1 | Cadena de Suministro | 200 | IC ganado por turno +5% |
| `log-2` | T2 | Just-in-Time | 400 | IC ganado por turno +15% adicional |
| `log-3` | T3 | Red Distribuida | 700 | Mantenimiento −5% extra |
| `log-4` | T4 | Monopolio Operativo | 1,200 | +5% dividendos cuando tenés >50% de una corp |

### 5.3 Efectos en el Backend

Los efectos de `fin-2`, `fin-3`, `fin-4`, `urb-1`, `urb-2`, `urb-3`, `urb-4`, `log-3`, `log-4` están **parcialmente implementados** en la Phase 5 del algoritmo de resolución y en el cálculo de IC. Los efectos de `urb-2` (FMV CEO) y `urb-4` (FMV floor) aún requieren lógica adicional en `resolveTurn()`.

> 🚧 **PENDIENTE:** Activar los efectos matemáticos completos de todos los nodos en `resolveTurn()`.

---

## 6. Roles Hardcodeados de Jugadores 🚧

> **Estado:** Diseñado, NO implementado. La columna `player_role` no existe aún en la tabla `players`.

### 6.1 Filosofía del Sistema de Roles

Los roles son **fijos, hardcodeados por jugador real** y están basados en las carreras universitarias del grupo. No son elegibles; están asignados en el seed. Esto crea asimetrías de información y estrategias complementarias:

- Franki domina el Tech Tree pero paga más por activos físicos.
- Cece y Tobe evaden impuestos mejor que nadie, pero innovan lento.
- Santi no genera mucho dinero solo, pero se beneficia del caos ajeno.
- Ben puede ignorar patentes, pero siempre paga mantenimiento de servidor.
- Manu es rey de los activos industriales, pero el mercado de acciones lo perjudica.

### 6.2 Tabla Maestra de Roles

#### 🤖 FRANKI — `role: 'DATA_SCIENTIST'` · IA & Ciencia de Datos
| Aspecto | Modificador | Fórmula |
|---|---|---|
| **Pro:** Generación de IC | +20% extra por turno | `IC_ganado × 1.20` |
| **Contra:** Costo de propiedades físicas | +10% en compra de shares de corps "industriales" o "comerciales" | `precio_compra × 1.10` |

**Sabor narrativo:** Franki procesa datos más rápido que nadie, desbloqueando tecnología a un ritmo imposible de igualar en el late-game. Sin embargo, prefiere el código a los ladrillos: comprar propiedades físicas le cuesta más caro.

---

#### 📈 CECE — `role: 'ECONOMIST'` · Economía
#### 📈 TOBE — `role: 'ECONOMIST'` · Economía
| Aspecto | Modificador | Fórmula |
|---|---|---|
| **Pro:** Bracket máximo del Wealth Tax | −3% en la tasa del tramo >$150k | Tasa del tramo top: `15% → 12%` |
| **Pro:** Dividendos recibidos | +10% sobre todos los dividendos | `dividendo_recibido × 1.10` |
| **Contra:** Costo en IC del Tech Tree | +20% en todos los nodos | `costo_nodo × 1.20` |

**Sabor narrativo:** Cece y Tobe saben cómo estructurar su patrimonio para pagar menos al fisco y exprimir el máximo rendimiento de sus inversiones. Pero son demasiado conservadores para apostar por la innovación tecnológica.

> **Nota especial:** Ambos comparten el mismo rol. Esto genera una competencia interna directa: igualdad de condiciones, pero distintas estrategias de inversión. El juego dentro del juego.

---

#### 🧠 SANTI — `role: 'PSYCHOLOGIST'` · Psicología
| Aspecto | Modificador | Fórmula |
|---|---|---|
| **Pro:** "Honorarios de Terapia" (alianzas rotas) | Cobra 5% del escrow total involucrado como comisión | `comision = escrow_total × 0.05` |
| **Pro:** "Honorarios de Terapia" (Capítulo 11) | Cobra 5% de la inyección de liquidez del banco cuando cualquier jugador entra en quiebra | `comision = $2,000 × 0.05 = $100` |
| **Contra:** Sueldo diario base | −15% sobre los dividendos recibidos | `dividendo_recibido × 0.85` |

**Sabor narrativo:** Santi no gana mucho solo. Su riqueza depende enteramente de que los demás se destruyan entre sí. Cuantas más alianzas se rompan y más bancarrotas se activen, más plata cobra Santi sin mover un dedo.

**Mecánica de pago de honorarios:** La comisión se transfiere automáticamente durante:
- Phase 0 (ruptura de alianza): al procesar el escrow confiscado.
- Phase 6 (Capítulo 11): al ejecutar la inyección de liquidez.

---

#### 💻 BEN — `role: 'SYSTEMS_ENGINEER'` · Ingeniería en Sistemas
| Aspecto | Modificador | Fórmula |
|---|---|---|
| **Pro:** Bypass de Patentes | Puede comprar cualquier nodo del Tech Tree aunque esté en estado `PATENT` exclusivo de otro jugador, pagando el **costo base completo** (sin descuento) | No espera 10 turnos |
| **Contra:** Mantenimiento de Servidor | Descuento fijo de `$50` por turno, siempre, incluso durante Capítulo 11 | `liquid_cash -= 50` antes de cualquier otra operación |

**Sabor narrativo:** Ben vive con la filosofía Open Source: la tecnología debe ser libre. Puede usar cualquier invento aunque sea exclusivo. Pero mantener sus servidores corriendo tiene un costo fijo inevitable.

> **Importante:** El costo de servidor de $50 se aplica **antes** de la Phase 6 (Capítulo 11), por lo que Ben puede quedar técnicamente en negativo por este cargo incluso si su balance era exactamente $0.

---

#### ⚙️ MANU — `role: 'MECH_ENGINEER'` · Ingeniería Mecánica
| Aspecto | Modificador | Fórmula |
|---|---|---|
| **Pro:** Costo de mejoras industriales | −20% en la compra de shares de corporations clasificadas como distrito `'Zona Industrial'` | `precio_compra × 0.80` |
| **Pro:** Alquiler cobrado en propiedades industriales | +20% sobre dividendos recibidos de corps en `'Zona Industrial'` | `dividendo × 1.20` (solo si es de corp industrial) |
| **Contra:** Dividendos del mercado general | −15% sobre dividendos de **cualquier** corporación | `dividendo × 0.85` |

> **Resolución del conflicto:** Cuando Manu recibe dividendos de una corp industrial, se aplica primero el +20% de bonificación y luego el −15% general, resultando en un modificador neto de `× 1.20 × 0.85 = × 1.02`. Para corps no industriales, el modificador neto es `× 0.85`.

**Sabor narrativo:** Manu construye imperios de cemento y acero. Las propiedades industriales son su reino. Pero el mercado de acciones "abstracto" no le cierra; prefiere los activos tangibles.

### 6.3 Implementación Técnica Requerida

**Cambios en la DB:**
```sql
ALTER TABLE players ADD COLUMN player_role TEXT;
-- Valores posibles: 'DATA_SCIENTIST', 'ECONOMIST', 'PSYCHOLOGIST', 'SYSTEMS_ENGINEER', 'MECH_ENGINEER'
```

**Cambios en el seed (`lib/schema.js`):**
```javascript
const players = [
  { username: 'FRANKI', pin: '0814', is_admin: true,  color: '#a3e635', player_role: 'DATA_SCIENTIST' },
  { username: 'CECE',   pin: '1111', is_admin: false, color: '#22d3ee', player_role: 'ECONOMIST' },
  { username: 'TOBE',   pin: '2222', is_admin: false, color: '#f97316', player_role: 'ECONOMIST' },
  { username: 'SANTI',  pin: '3333', is_admin: false, color: '#ec4899', player_role: 'PSYCHOLOGIST' },
  { username: 'BEN',    pin: '4444', is_admin: false, color: '#eab308', player_role: 'SYSTEMS_ENGINEER' },
  { username: 'MANU',   pin: '5555', is_admin: false, color: '#8b5cf6', player_role: 'MECH_ENGINEER' },
];
```

**Cambios en `lib/gameLogic.js → resolveTurn()`:**

Los modificadores de rol deben inyectarse en las phases correspondientes. La estrategia recomendada es cargar los roles de todos los jugadores al inicio de `resolveTurn()` y pasarlos como un mapa a cada phase:

```javascript
// Al inicio de resolveTurn():
const playerRoles = await sql`SELECT id, player_role FROM players`;
const roleMap = Object.fromEntries(playerRoles.map(p => [p.id, p.player_role]));
```

Luego cada phase consulta `roleMap[player_id]` para aplicar el modificador correspondiente.

---

## 7. Sistema de Alianzas y Contratos Inteligentes

### 7.1 Ciclo de Vida de una Alianza

```
[Jugador A propone] → PROPOSED
       │
       ├── [Jugador B acepta] → ACTIVE (escrow bloqueado de ambas partes)
       │         │
       │         ├── [Disolución pacífica mutua] → DISSOLVED (escrow devuelto)
       │         │
       │         └── [Jugador A hace BUY en corp donde B es CEO] → BROKEN
       │                   → Atacante pierde su escrow
       │                   → Víctima recibe AMBOS escrows
       │
       ├── [Jugador B rechaza] → REJECTED
       └── [Jugador A cancela] → CANCELLED
```

### 7.2 Cálculo del Escrow

Al aceptar una alianza, se bloquea automáticamente un porcentaje configurable (5%–30%, por defecto 10%) del liquid_cash de **cada parte**:

```
escrow_proposer  = liquid_cash_proposer  × (escrow_pct / 100)
escrow_recipient = liquid_cash_recipient × (escrow_pct / 100)
```

El escrow se resta del `liquid_cash` de ambos y se guarda en `alliances.escrow_proposer / escrow_recipient`.

### 7.3 Detección de Traición (Phase 0)

Una alianza se considera **rota hostilmente** si durante el mismo turno:
- Un jugador con alianza `ACTIVE` envía una orden `BUY_SHARES`
- Para una corporación cuyo `ceo_player_id` es su aliado

La detección ocurre en Phase 0, **antes** de procesar los trades, para que la consecuencia se aplique en el mismo turno del intento.

### 7.4 Rol de Santi en las Alianzas

Cuando una alianza se rompe (Phase 0), **antes** de transferir el escrow a la víctima, se calcula la comisión de Santi:

```
total_escrow = escrow_attacker + escrow_victim
comision_santi = total_escrow × 0.05
// El escrow neto para la víctima = total_escrow - comision_santi
```

---

## 8. Dado Diario Anticipado

### 8.1 Mecánica

Al entrar al juego cada día, el sistema muestra un modal forzado con un dado animado (Framer Motion). El jugador lo "tira" y el resultado queda guardado en `daily_rolls` con `UNIQUE(player_id, turn_number)` — imposible re-tirar.

**El dado sirve para dos propósitos:**
1. **Dopamina visual** — La animación del dado rolling es el primer gancho del día.
2. **Estrategia anticipada** — El jugador sabe con antelación cuántas casillas se va a mover. Si el resultado implica caer en una propiedad cara de un rival, tiene todo el día para buscar cash, proponer un trato o armar un contrato de alianza.

### 8.2 Estado Futuro del Dado

La resolución física del movimiento en el tablero (Board 2D) es una mecánica pendiente de conectar. Actualmente el resultado se guarda pero no mueve avatares. La implementación futura debe:
1. Calcular la casilla de destino basándose en `roll_value` y la posición actual del jugador.
2. Si la casilla es una corporación → cobrar "alquiler" proporcional distribuido como dividendos.
3. Si la casilla es "El Psicólogo" → evento especial.
4. Si la casilla es "Prendas" → modal de desafío.

---

## 9. Sistema de Logros Globales 🚧

> **Estado:** Diseñado, NO implementado. Requiere nueva tabla `global_achievements`.

### 9.1 Estructura de la Tabla

```sql
CREATE TABLE global_achievements (
  id          TEXT PRIMARY KEY,          -- 'first_ceo', 'wolf_wall_st', etc.
  name        TEXT NOT NULL,
  description TEXT NOT NULL,
  prize_cash  NUMERIC(14,2) DEFAULT 0,
  prize_ic    NUMERIC(14,2) DEFAULT 0,
  winner_id   UUID REFERENCES players(id),
  won_at_turn INT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);
```

### 9.2 Logros Definidos

| ID | Nombre | Condición | Premio |
|---|---|---|---|
| `first_ceo` | El Monopolista Precoz | Primero en ser CEO de cualquier corporación | $500 |
| `tier2_tech` | Mente Brillante | Primero en desbloquear cualquier nodo Tier 2 | 200 IC |
| `first_alliance` | El Diplomático | Primero en firmar una alianza activa | $300 a **cada parte** |
| `first_10pct` | El Inversor Precoz | Primero en comprar ≥10 shares de cualquier corp | $100 |
| `wolf_wall_st` | El Lobo de Wall Street | Primero en ejecutar 5 trades en un solo turno | $300 |
| `chapter11_survivor` | Ave Fénix | Primer jugador en salir del Capítulo 11 | 150 IC |

### 9.3 Mecánica de Check

Los logros se verifican **al final de cada phase relevante** dentro de `resolveTurn()`. Al lograrse, se emite una transacción de tipo `ACHIEVEMENT` con el monto del premio, y el logro se marca con `winner_id` y `won_at_turn` para que no pueda ser reclamado nuevamente.

---

## 10. Vercel Cron + Bot de Telegram 🚧

> **Estado:** Diseñado, NO implementado. Ambos módulos deben crearse.

### 10.1 Arquitectura General

```
┌────────────────┐         ┌──────────────────────────────────┐
│  Vercel Cron   │─ trigger─▶  /api/cron/resolve-and-notify   │
│  00:00 ART     │         │  (Serverless Function, ~2s exec)  │
│  (cron job en  │         │                                   │
│   vercel.json) │         │  1. resolveTurn()                 │
└────────────────┘         │  2. buildTelegramMessage(summary) │
                           │  3. POST telegram.org/bot API     │
                           └──────────────────────────────────┘
                                            │
                                            ▼
                           ┌──────────────────────────────────┐
                           │   Grupo de Telegram de los pibes │
                           │   "🏙️ TURNO 42 RESUELTO · D77"  │
                           │   - Rankings actualizados         │
                           │   - Traiciones detectadas         │
                           │   - Patentes expiradas            │
                           │   - Quiebras activadas            │
                           └──────────────────────────────────┘
```

### 10.2 Configuración de Vercel Cron

En `vercel.json` en la raíz del proyecto:

```json
{
  "crons": [
    {
      "path": "/api/cron/resolve-and-notify",
      "schedule": "0 3 * * *"
    }
  ]
}
```

> **Nota sobre la hora:** Vercel cron usa UTC. Las 00:00 ART (Argentina Standard Time) equivalen a las **03:00 UTC** (UTC-3). El schedule `"0 3 * * *"` ejecuta a las 03:00 UTC = 00:00 ART exacto.

### 10.3 Endpoint: `/api/cron/resolve-and-notify`

**Archivo a crear:** `app/api/cron/resolve-and-notify/route.js`

```javascript
import { NextResponse } from 'next/server';
import { resolveTurn } from '@/lib/gameLogic';
import sql from '@/lib/db';

export async function GET(request) {
  // Verificar que la llamada viene de Vercel Cron
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const summary = await resolveTurn();
    const message = buildTelegramMessage(summary);
    await sendTelegramMessage(message);
    return NextResponse.json({ ok: true, summary });
  } catch (err) {
    console.error('[CRON] Error:', err);
    // Notificar el error al chat también
    await sendTelegramMessage(`⚠️ *ERROR en resolución del Turno* \n\`${err.message}\``);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
```

### 10.4 Constructor del Mensaje de Telegram

```javascript
function buildTelegramMessage(summary) {
  const lines = [];
  lines.push(`🏙️ *DISTRITO 77 — TURNO ${summary.turn} RESUELTO*`);
  lines.push(`📅 ${new Date().toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' })}`);
  lines.push('');

  // Trades
  if (summary.trades.length > 0) {
    lines.push(`📊 *Mercado:* ${summary.trades.length} operaciones ejecutadas`);
    const buys  = summary.trades.filter(t => t.type === 'BUY').length;
    const sells = summary.trades.filter(t => t.type === 'SELL').length;
    lines.push(`  ↑ ${buys} compras · ↓ ${sells} ventas`);
  }

  // Eventos especiales
  for (const ev of summary.events) {
    if (ev.type === 'ALLIANCE_BROKEN') {
      lines.push(`⚔️ *TRAICIÓN DETECTADA:* escrow de $${ev.forfeit.toFixed(0)} confiscado`);
    }
    if (ev.type === 'PATENT_EXPIRED') {
      lines.push(`🔓 Patente *${ev.node_id}* venció → ahora es Open Source`);
    }
    if (ev.type === 'CHAPTER_11') {
      lines.push(`📉 Un jugador entró en *Capítulo 11* — inyección de $2,000`);
    }
  }

  // FMV changes
  const fmvKeys = Object.keys(summary.fmv_changes || {});
  if (fmvKeys.length > 0) {
    lines.push('');
    lines.push(`📈 *Movimientos de Mercado:*`);
    for (const corp of fmvKeys.slice(0, 5)) { // máximo 5 para no spamear
      const { from, to } = summary.fmv_changes[corp];
      const pct = (((to - from) / from) * 100).toFixed(1);
      const arrow = to > from ? '▲' : '▼';
      lines.push(`  ${arrow} ${corp}: $${from.toFixed(0)} → $${to.toFixed(0)} (${pct}%)`);
    }
  }

  lines.push('');
  lines.push(`_Entrá a jugar en_ [distrito77.vercel.app](https://distrito77.vercel.app)`);

  return lines.join('\n');
}
```

### 10.5 Función de Envío a Telegram

```javascript
async function sendTelegramMessage(text) {
  const token  = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  
  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: 'Markdown',
      disable_web_page_preview: false,
    }),
  });
  
  if (!res.ok) {
    const err = await res.json();
    throw new Error(`Telegram API error: ${JSON.stringify(err)}`);
  }
  return res.json();
}
```

### 10.6 Variables de Entorno Requeridas

Agregar a Vercel Dashboard → Settings → Environment Variables:

| Variable | Descripción |
|---|---|
| `DATABASE_URL` | Connection string de Supabase (ya configurado) |
| `CRON_SECRET` | String aleatorio para autenticar llamadas del cron |
| `TELEGRAM_BOT_TOKEN` | Token del bot (obtenido de @BotFather en Telegram) |
| `TELEGRAM_CHAT_ID` | ID del grupo de Telegram (número negativo, ej: `-1001234567890`) |
| `ADMIN_SECRET` | Para el endpoint `/api/reset` (ya configurado) |

### 10.7 Setup del Bot de Telegram

1. Abrir Telegram, buscar `@BotFather`.
2. `/newbot` → poner nombre "Distrito 77 Bot" → usuario `distrito77_bot`.
3. Copiar el token y pegarlo en `TELEGRAM_BOT_TOKEN`.
4. Agregar el bot al grupo de los pibes como admin (para que pueda postear).
5. Obtener el `chat_id` visitando `https://api.telegram.org/bot<TOKEN>/getUpdates` después de mandar cualquier mensaje en el grupo.

---

## 11. Interfaz de Usuario (UI/UX)

### 11.1 Stack Visual

- **Framework:** Next.js 14 (App Router)
- **Estilos:** Tailwind CSS 3.4 con paleta dark (zinc-950/900/800)
- **Componentes:** shadcn/ui (Radix UI bajo el capó)
- **Animaciones:** Framer Motion 12 (micro-interacciones, hover 3D en cards)
- **Fondo:** BoardBackground 2D CSS-only (reemplazó el Spline 3D que saturaba la GPU)
- **Notificaciones:** sonner (toasts)
- **Íconos:** Lucide React

### 11.2 Pantallas Principales

| Pantalla | Descripción |
|---|---|
| Login | Username + PIN 4 dígitos. Fondo animado con orbes CSS. |
| Dashboard · Daily | Auditoría de ingresos del turno anterior + cola de órdenes actuales |
| Dashboard · Mercado | Grid de 20 corps con hover 3D. Panel sticky de nueva orden. |
| Dashboard · Portfolio | Tabla de participaciones con %, valor posición, CEO flag |
| Dashboard · Ranking | Leaderboard ordenado por Net Worth con badge de bancarrota |
| Dashboard · Alianzas | Lista de alianzas activas/propuestas/historial con escrow info |
| Dashboard · Tech | Árbol visual con 3 ramas, estado de patentes, preview de efectos |
| Dashboard · Admin | Botón "Resolver Turno" + historial de turn_log (solo FRANCO) |
| Dice Modal | Modal forzado al login del día con dado animado Framer Motion |

### 11.3 Accesibilidad & Performance

- Polling automático cada 15 segundos para mantener el estado sincronizado.
- Flash overlay verde/rojo cuando el turno avanza y el net del audit es significativo (>$10).
- `BoardBackground` en CSS puro (cero WebGL), compatible con celulares de gama media.

---

## 12. Mecánicas Anti-Rage & Balance

### 12.1 Resumen de Protecciones

| Mecánica | Objetivo | Implementación |
|---|---|---|
| Bandas 50%–250% | Eliminar extorsión en trades | `PRICE_FLOOR_MULT = 0.5`, `PRICE_CEILING_MULT = 2.5` |
| Wealth Tax progresivo hasta 15% | Frenar al líder absoluto | Phase 5 del algoritmo WEGO |
| Capítulo 11 | Eliminar eliminaciones permanentes | Phase 6, inyección $2,000 + 5 turnos exentos |
| WEGO simultáneo | Eliminar ventaja del jugador que entra primero | Todas las órdenes se procesan juntas |
| Escrow de alianzas | Hacer que las traiciones tengan costo real | Phase 0 del algoritmo |
| Dividendos proporcionales | Mecanismo de catch-up para perdedores | Phase 2, CTE bulk |

### 12.2 Curva de Progresión de la Campaña

La campaña de ~240 turnos tiene tres eras naturales generadas por la matemática:

| Era | Turnos | Dinámica |
|---|---|---|
| **Era Temprana** | 1–60 | Todos empiezan con $5K. Carrera por ser CEO de las mejores corps. Tech Tree accesible. |
| **Era Media** | 61–150 | Los costos empiezan a presionar. El Tech Tree marca diferencias. Alianzas y traiciones frecuentes. |
| **Era Tardía** | 151–240 | Costos exponenciales devastadores. Solo los jugadores eficientes (tech desbloqueado) sobreviven. El Wealth Tax del 15% aplana fuertemente al líder. |

---

## 13. Hoja de Ruta de Implementación

### Fase 5 — Roles + Logros + Bot (PRÓXIMA)

**Prioridad:** Alta. Sin esto el juego no está "completo".

- [ ] Agregar columna `player_role` a la tabla `players`
- [ ] Actualizar seed con nombres reales y roles asignados
- [ ] Implementar modificadores de rol en `resolveTurn()`:
  - [ ] Phase 2 (dividendos): multiplicadores por rol
  - [ ] Phase 3 (mantenimiento): descuento para `urb-1` y costo fijo de Ben
  - [ ] Phase 5 (impuesto): descuento para `fin-3` y para Economistas
  - [ ] Phase 5.5 (IC): multiplicador para Franki y `log-1/log-2`
  - [ ] Phase 0 (alianzas): comisión de Santi
  - [ ] Phase 6 (bancarrota): comisión de Santi + siempre cobrar $50 a Ben
- [ ] Implementar bypass de patentes para Ben en `/api/tech/unlock`
- [ ] Implementar descuento/surcharge en compra de shares según rol
- [ ] Crear tabla `global_achievements` y seed con los 6 logros definidos
- [ ] Verificar logros en las phases correspondientes de `resolveTurn()`
- [ ] Mostrar rol en la UI (badge en header/dashboard del jugador)

### Fase 6 — Bot de Telegram + Cron

- [ ] Crear `app/api/cron/resolve-and-notify/route.js`
- [ ] Agregar `vercel.json` con cron schedule `0 3 * * *`
- [ ] Configurar variables de entorno en Vercel Dashboard
- [ ] Setup del bot con @BotFather y obtener chat_id del grupo
- [ ] Test de envío manual antes de activar el cron automático

### Fase 7 — Efectos Tech Tree Completos

- [ ] Activar `fin-2` (sell spread -1.5%) en Phase 1
- [ ] Activar `fin-3` (tax -20%) en Phase 5
- [ ] Activar `fin-4` (buy spread -1.5%) en Phase 1
- [ ] Activar `urb-2` (CEO FMV +2%/turno) en Phase 4
- [ ] Activar `urb-3` (CEO div +10%) en Phase 2
- [ ] Activar `urb-4` (FMV floor) en ajuste de FMV de Phase 1
- [ ] Activar `log-4` (monopoly bonus +5% div si >50%) en Phase 2

### Fase 8 — Movimiento en el Tablero

- [ ] Definir layout de casilleros (20 corps en el perímetro del board)
- [ ] Almacenar posición actual del jugador en `players.board_position`
- [ ] Conectar `roll_value` de `daily_rolls` al movimiento real
- [ ] Implementar aterrizaje: cobro de alquiler proporcional al aterrizar en corp ajena
- [ ] Casillero "El Psicólogo" (evento especial)
- [ ] Casillero "Prendas" (modal de desafío)

---

## 14. Convenciones de Código

### 14.1 Reglas Inviolables

1. **No tocar la lógica de resolución de turnos** sin leer esta sección completa primero. El algoritmo WEGO fue testeado con stress test de 30 turnos simultáneos a 1.8s/turno.
2. **Toda operación financiera** debe ser una query SQL atómica o parte de una CTE. Nunca calcular dinero en JavaScript y luego escribirlo.
3. **Las columnas `NUMERIC(14,2)`** deben castearse a `Number()` en JavaScript antes de operar con ellas (PostgreSQL las devuelve como strings).
4. **El flag `game_state.locked`** previene resoluciones concurrentes. Cualquier nueva phase que se agregue al algoritmo debe respetar el bloque try/catch que libera el lock en caso de error.

### 14.2 Estructura de Archivos

```
/
├── app/
│   ├── page.js              ← UI principal (todo en un archivo por ahora)
│   ├── layout.js
│   ├── globals.css
│   └── api/
│       ├── [[...path]]/route.js   ← Todos los endpoints del juego
│       └── cron/
│           └── resolve-and-notify/route.js   🚧 PENDIENTE
├── components/
│   ├── AlliancesTab.js
│   ├── TechTreeTab.js
│   ├── ActionReceipt.js
│   ├── DiceModal.js
│   ├── BoardBackground.js
│   └── FlashOverlay.js
├── lib/
│   ├── db.js               ← Conexión Postgres (singleton)
│   ├── gameLogic.js        ← Motor económico + resolveTurn()
│   ├── schema.js           ← DDL + seed data
│   └── utils.js
├── vercel.json             🚧 PENDIENTE (agregar crons)
└── GAME_DESIGN_AND_ARCHITECTURE.md   ← Este archivo
```

### 14.3 Variables de Entorno

| Variable | Uso |
|---|---|
| `DATABASE_URL` | Connection string Supabase Postgres (transaction pooler) |
| `ADMIN_SECRET` | Protege el endpoint `/api/reset` |
| `CRON_SECRET` | Protege el endpoint de cron de Vercel 🚧 |
| `TELEGRAM_BOT_TOKEN` | Token del bot de Telegram 🚧 |
| `TELEGRAM_CHAT_ID` | ID del grupo de Telegram 🚧 |

---

## Apéndice A — Datos del Seed de Producción

| Jugador | PIN | Rol | Color |
|---|---|---|---|
| FRANKI (admin) | 0814 | DATA_SCIENTIST | `#a3e635` |
| CECE | TBD | ECONOMIST | `#22d3ee` |
| TOBE | TBD | ECONOMIST | `#f97316` |
| SANTI | TBD | PSYCHOLOGIST | `#ec4899` |
| BEN | TBD | SYSTEMS_ENGINEER | `#eab308` |
| MANU | TBD | MECH_ENGINEER | `#8b5cf6` |

> Los PINs de producción deben ser definidos por cada jugador y comunicados a Franco para el seed inicial. El seed actual usa nombres genéricos (NOVA, PANTERA, etc.) y deberá ser reemplazado antes del lanzamiento con el comando `/api/reset`.

---

## Apéndice B — Glosario

| Término | Definición |
|---|---|
| **WEGO** | Simultaneous Turn Resolution. Todas las órdenes se ejecutan juntas. |
| **FMV** | Fair Market Value. Valor de mercado total de una corporación (100 shares = 1 FMV). |
| **IC** | Intellectual Capital. Moneda exclusiva del Tech Tree. |
| **CEO** | Jugador con la mayoría de shares (>50%) de una corporación. |
| **Escrow** | Garantía económica bloqueada como colateral de una alianza. |
| **Chapter 11** | Mecanismo de bancarrota temporal con protección fiscal. |
| **ART** | Argentina Time (UTC-3). Hora objetivo de resolución de turnos: 00:00 ART. |
| **PBBG** | Persistent Browser-Based Game. Juego de navegador asíncrono y persistente. |

---

*Documento generado el 04/05/2026. Mantener actualizado con cada phase implementada.*
