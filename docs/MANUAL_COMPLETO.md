# DISTRITO 77 — Manual Completo del Administrador
### Versión campaña Junio–Diciembre 2025 · 6 jugadores

---

## ÍNDICE
1. Concepto general
2. El tablero (32 casillas)
3. Corporaciones — la mecánica central
4. Cómo funciona el mercado (comprar y vender acciones)
5. Capital Intelectual (IC)
6. El árbol tecnológico
7. Sistema de niveles (L1–L10)
8. Casillas especiales
9. El sistema de alianzas
10. El Rey Nissai — Mercado clandestino
11. Casino de Medianoche
12. Bounty Board — contratos P2P
13. Resolución de turno (medianoche)
14. Impuesto progresivo al patrimonio
15. Chapter 11 — quiebra y recuperación
16. Eventos globales
17. Logros globales
18. Roles y sus mecánicas únicas
19. Proyección económica: Día 1 vs Día 60 vs Día 200

---

## 1. CONCEPTO GENERAL

Distrito 77 es un juego de economía asíncrona para 6 jugadores. **1 turno por día**, que se resuelve automáticamente a medianoche (hora Argentina). No es necesario que todos estén conectados al mismo tiempo.

Cada jugador controla un personaje con un rol económico único, compra acciones de corporaciones ficticias, invierte en tecnología, forja alianzas y puede sabotear a sus rivales. La partida transcurre aproximadamente 200 turnos (de junio a diciembre 2025).

**Flujo diario de un jugador:**
1. Abrís la app → tirás el dado (mueve tu pieza en el tablero)
2. Ponés órdenes de compra/venta en el mercado
3. A medianoche → el servidor resuelve todo automáticamente
4. Al día siguiente, revisás qué pasó: dividendos recibidos, trades ejecutados, sabotajes

---

## 2. EL TABLERO (32 CASILLAS)

El tablero tiene 32 posiciones (casillas 0 a 31). Tu pieza arranca en casilla 0 y avanza según el dado (1–6) que tirás cada turno.

### Casillas de corporaciones (la mayoría)
Cuando caés en una casilla donde hay una corporación con accionistas, pagás **alquiler de tránsito: 5% del FMV de esa corp**. Ese dinero se distribuye proporcionalmente entre los accionistas.

**Ejemplo:** Caés en la casilla de NEXUS HOLDINGS (FMV $8.000). Pagás $400 de tránsito. Si CECE tiene 60 acciones y FRANCO tiene 40, CECE recibe $240 y FRANCO $160.

### Casillas avanzadas sin accionistas (casillas 20+)
Si una corp avanzada no tiene accionistas y caés en ella, el alquiler va al **Tesoro del Estado** (pozo común del juego).

### Los distritos y colores
Cada corporación pertenece a un distrito que tiene un color visual en el tablero (banda de colores al estilo Monopoly). Los distritos importan porque:
- Los **eventos globales** afectan districts enteros (+/- FMV)
- Algunos roles tienen ventajas específicas por distrito (MANU en Zona Industrial)

---

## 3. CORPORACIONES — LA MECÁNICA CENTRAL

### ¿Qué es el FMV?
FMV = **Fair Market Value** = el valor total de mercado de la corporación. No es el precio de una acción, es el valor de toda la empresa.

- Cada corp tiene **100 acciones totales** (total_shares = 100)
- **Precio por acción = FMV / 100**
- Si el FMV de NEXUS es $8.000, una acción cuesta $80

### ¿Cómo sube y baja el FMV?
El precio se ajusta por oferta y demanda de este turno:

```
ΔFMVpor accion = (compras netas del turno) × 3% × precio_actual
```

**Ejemplo concreto:** En el turno 5, FRANCO compra 10 acciones de NEXUS y nadie vende.
- Demanda neta = +10 acciones
- ΔFMV = 10 × 3% × $80 = +$24
- El FMV sube de $8.000 a $8.024

Si en el mismo turno alguien vende 5 acciones:
- Demanda neta = +10 − 5 = +5
- ΔFMV = 5 × 3% × $80 = +$12 (sube menos)

Si todos venden y nadie compra, el FMV baja. El FMV tiene un piso (50% del valor original) y un techo (250%).

**Eventos globales** también modifican el FMV: un boom en "Distrito Neón" puede subir todos los FMV de ese distrito un 15% en un solo turno.

### ¿Cómo sé si una corporación es buena? — Los 🔥 fueguitos

El puntaje de fueguitos (0–5) mide la rentabilidad relativa de la corporación en el turno actual:
- Compara cuánto dividendo genera vs. cuánto mantenimiento cuesta
- Corps en 🔥🔥🔥🔥🔥 son las que tienen mejor ratio ingreso/costo ahora mismo
- El puntaje cambia cada turno conforme escalan ambas curvas

**Regla práctica:** apuntá siempre a corps con 4–5 fueguitos en turnos tempranos.

---

## 4. CÓMO FUNCIONA EL MERCADO (COMPRAR Y VENDER ACCIONES)

### El spread
- **Compra:** pagás 3% más que el precio de mercado (**buyPrice = FMV/100 × 1.03**)
- **Venta:** recibís 3% menos (**sellPrice = FMV/100 × 0.97**)

Ese 3% es el costo de transacción, no se lo queda nadie, simplemente es el spread del mercado.

**Ejemplo completo (Turno 1):**
Corp: NEXUS HOLDINGS · FMV: $8.000 · Precio por acción: $80

Comprás 10 acciones:
- Costo = 10 × $80 × 1.03 = **$824**
- Ahora tenés 10 acciones (10% de la empresa)

### ¿Qué ganás por tener acciones?

Cada turno cobrás **dividendos** y pagás **mantenimiento**. Estas son las dos fórmulas clave del juego:

```
DIVIDENDO = (tus_acciones / 100) × base_income × multiplicador_de_ingreso

multiplicador_de_ingreso = 1 + 0.01 × turno^1.15
```

```
MANTENIMIENTO = (tus_acciones / 100) × FMV × 1.5% × multiplicador_de_costo

multiplicador_de_costo = 1.02^(turno − 1)
```

El `base_income` de cada corp es fijo (definido al crear la corp). Es lo que la empresa "produce" por turno antes de los multiplicadores.

### Ejemplo completo — NEXUS HOLDINGS con 10 acciones

**Supongamos:** FMV = $8.000, base_income = $960 (ratio 12%), tenés 10 acciones = 10%

| Turno | Inc. Mult | Cost Mult | Dividendo | Mantenimiento | **Neto** |
|-------|-----------|-----------|-----------|---------------|---------|
| **T1** | 1.01 | 1.00 | $96.96 | $12.00 | **+$84.96** |
| **T30** | 1.50 | 1.78 | $144.0 | $21.36 | **+$122.6** |
| **T60** | 2.11 | 3.22 | $202.6 | $38.6 | **+$164.0** |
| **T120** | 3.46 | 10.57 | $332.2 | $126.8 | **+$205.4** |
| **T200** | 5.41 | 51.4 | $519.4 | $616.8 | **−$97.4** |

**Lo que esto significa en la práctica:**
- Turnos 1–150: esta inversión es rentable y crece
- Alrededor del turno 155–160: los costos de mantenimiento superan los dividendos
- Turno 200: te está costando dinero mantenerla

Esto no es un bug, es diseño: **el juego te fuerza a actualizar tu portfolio con el tiempo**. Las corps premium (con mejor ratio base_income/FMV) duran más tiempo siendo rentables.

### ¿Cómo calcular rápido si vale la pena?
Mirá el **neto/turno** que muestra tu portfolio. Si está en verde, ganás. Si está en rojo, la corp te está drenando.

Regla de oro: si el `base_income / FMV > 12%`, la corp es sostenible hasta el turno 150+.

### El CEO
Quien tiene más acciones de una corp es automáticamente el **CEO** (se recalcula cada turno). El CEO tiene ventajas via tech tree (ver sección 6).

---

## 5. CAPITAL INTELECTUAL (IC)

El IC es el segundo recurso del juego, separado del cash. No se puede transferir entre jugadores (salvo por hackeo Nissai).

### ¿Cómo se genera?
**Cada turno, automáticamente, todo jugador recibe:**

```
IC ganado por turno = 30 + (2 × número_de_turno)
```

| Turno | IC base por turno |
|-------|-----------------|
| T1 | 32 IC |
| T30 | 90 IC |
| T60 | 150 IC |
| T120 | 270 IC |
| T200 | 430 IC |

**Modificadores:**
- **FRANCO (Data Scientist):** ×1.20 (20% extra siempre)
- **Nodo log-1 desbloqueado:** +5% adicional
- **Nodo log-2 desbloqueado:** +15% adicional

**Ejemplo — FRANCO en turno 60:**
- Base: 150 IC
- ×1.20 (rol): **180 IC por turno**

**Ejemplo — CECE (Economista) en turno 60 con log-1:**
- Base: 150 IC
- ×1.05 (log-1): **157.5 IC por turno**

### ¿Para qué se usa el IC?
1. **Desbloquear nodos del árbol tecnológico** (el uso principal)
2. **Pagar sabotajes Nissai** (AUDIT, HACK, RUMOR, FISCO)
3. El IC gastado cuenta para tu **Nivel de jugador** (Level system)

### IC acumulado a lo largo del tiempo

| Turno | IC acumulado (jugador base) | Con Franco (+20%) |
|-------|---------------------------|-------------------|
| T10 | ~560 IC | ~672 IC |
| T30 | ~1.980 IC | ~2.376 IC |
| T60 | ~5.460 IC | ~6.552 IC |
| T120 | ~17.160 IC | ~20.592 IC |
| T200 | ~44.200 IC | ~53.040 IC |

---

## 6. EL ÁRBOL TECNOLÓGICO

### Estructura general
4 ramas globales + 1 rama personal por rol. Cada rama tiene tiers del T1 al T20 (aunque en esta campaña los tier más altos son prácticamente inalcanzables).

| Rama | Color | Temática |
|------|-------|----------|
| FINANCIERA (fin-X) | Cyan | Reducción de spreads, menos impuestos |
| URBANO (urb-X) | Lima | CEO boosts, FMV protection, mantenimiento |
| LOGÍSTICA (log-X) | Naranja | IC generation, mayoría de corps |
| PERSONAL (ds-/ec-/ps-/se-/me-) | Púrpura | Exclusivo por rol |

### Costos de los tiers
```
T1: 100 IC     T2: 200 IC     T3: 400 IC
T4: 700 IC     T5: 1.200 IC   T6: 2.000 IC
(escala logarítmica hacia arriba)
```

### El sistema de Patentes
- El **primero** que desbloquea un nodo global obtiene **PATENTE EXCLUSIVA por 10 turnos**
- Durante esos 10 turnos, nadie más puede usar ese nodo
- Después de 10 turnos, el nodo pasa a **OPEN SOURCE** (disponible para todos al 25% del costo)

**Ejemplo — nodo fin-2 "Arbitraje" (reduce spread de venta de 3% a 1.5%):**
- CECE lo desbloquea en T15 → tiene patente exclusiva hasta T25
- En T25 pasa a Open Source: $50 IC (25% de $200)
- A partir de T25, cualquiera puede comprarlo por $50 IC

### La Rama Personal (nunca expira)
Los nodos personales (ds-1 a ds-10, ec-1 a ec-10, etc.) son **exclusivos por rol y nunca se vuelven Open Source**. Solo FRANCO puede desbloquear nodos ds-X, solo CECE/TOBE pueden desbloquear ec-X, etc.

### Nodos clave que conviene conocer

| Nodo | Rama | Efecto | Costo |
|------|------|--------|-------|
| `fin-2` | Financiera T2 | Spread de venta: 3%→1.5% | 200 IC |
| `fin-3` | Financiera T3 | Wealth tax ×0.80 (20% menos impuesto) | 400 IC |
| `fin-4` | Financiera T4 | Spread de compra: 3%→1.5% | 700 IC |
| `urb-1` | Urbano T1 | Mantenimiento −10% | 100 IC |
| `urb-2` | Urbano T2 | FMV de tus CEO corps +2% por turno | 200 IC |
| `urb-3` | Urbano T3 | CEO de tus corps: dividendo +10% | 400 IC |
| `urb-4` | Urbano T4 | CEO: corps inmunes a caída de FMV por ventas | 700 IC |
| `log-1` | Logística T1 | IC generado +5% | 100 IC |
| `log-2` | Logística T2 | IC generado +15% | 200 IC |
| `log-3` | Logística T3 | Mantenimiento −5% adicional | 400 IC |
| `log-4` | Logística T4 | Si tenés >50% de una corp, dividendo +5% | 700 IC |

### Cómo desbloquear un nodo
1. En la app → pestaña **Lab**
2. Seleccioná la rama
3. Si el nodo es T1 o su prerequisito está cumplido: aparece el botón "Desbloquear"
4. Si alguien ya tiene patente: aparece "Patente ajena · Esperá X turnos"
5. Si pasó a Open Source: cuesta 25% del original

---

## 7. SISTEMA DE NIVELES (L1–L10)

El nivel NO es progreso de tiempo — es **cuánto IC gastaste en el Lab**. No importa cuántos turnos pasaron, importa cuánto invertiste.

### Thresholds exactos

| Nivel | IC gastado acumulado | Qué desbloquea |
|-------|---------------------|----------------|
| **L1** | 0 IC | Casillas 1–19 + todas las techs T1 |
| **L2** | 500 IC | NEXUS HOLDINGS, HYPERION LABS |
| **L3** | 1.500 IC | VOID INDUSTRIES, AURORA CAPITAL, PHANTOM THREADS |
| **L4** | 3.000 IC | GRID ZERO, SABLE FINANCE, CHROME SYNDICATE |
| **L5** | 6.000 IC | APEX HOLDINGS |
| **L6** | 12.000 IC | Endgame content |
| **L7** | 25.000 IC | Late endgame |
| **L8–L10** | 50k–200k IC | Fuera de alcance esta campaña |

**¿Cuándo llega cada uno al nivel 2?**
- Jugador base necesita gastar 500 IC → en T30 tiene ~1.980 IC acumulado, o sea si empieza a invertir desde T1 puede llegar a L2 alrededor del T8–10.
- L3 (1.500 IC) es alcanzable alrededor del T25–30.
- L5 (6.000 IC) es alcanzable alrededor del T60–70 si jugás activo.

### ¿Por qué importa tanto el nivel?
Si querés comprar acciones de APEX HOLDINGS (la corp más poderosa, FMV $16.000) sin ser L5, el sistema simplemente te rechaza la orden — tanto en frontend (botón bloqueado) como en backend (error 403).

---

## 8. CASILLAS ESPECIALES

### Casilla 5, 15, 25 — PRENDAS 🎭
Sin efecto económico. El servidor notifica al grupo por Telegram: "FRANCO cayó en Prendas." El grupo decide la prenda en el momento (físicamente, si están juntos, o via chat).

### Casilla 10 — EL PSICÓLOGO 🛋️
Efecto automático: quien cae **paga $200 en el acto**. Ese dinero va directamente a **RETA** (el Psicólogo del grupo). Si RETA cae en su propia casilla, no paga nada (ni recibe nada).

En promedio, un jugador pasa por la casilla 10 cada ~5–6 turnos. A lo largo de 200 turnos, puede caer ahí ~30–35 veces → eso representa $6.000–$7.000 que recibe RETA en total solo por esta mecánica.

### Casilla 20 — EL ESTADO 🏛️
La corporación "El Estado" tiene en esta casilla su cuartel general. Las rentas de corps avanzadas sin accionistas fluyen hacia el Tesoro del Estado. No hay efecto adicional para el jugador que cae aquí.

### Casilla 30 — MERCADO NEGRO 🥷
El servidor otorga un **descuento especial del 25%** en la próxima operación Nissai del jugador que cae aquí. (Esta funcionalidad está implementada como aviso por Telegram — el descuento se aplica manualmente en el turno siguiente.)

---

## 9. EL SISTEMA DE ALIANZAS

### ¿Qué es una alianza?
Un acuerdo formal entre dos jugadores que bloquea dinero real como garantía. No es solo un pacto verbal: el código lo hace cumplir automáticamente.

### Cómo funciona

1. **Proponer:** Jugador A propone alianza a Jugador B, eligiendo el % de escrow (5%–30% del cash de ambos).
2. **Aceptar:** Jugador B acepta → el sistema descuenta automáticamente X% del cash de AMBOS y lo bloquea en la alianza.
3. **Mientras está activa:** Ambos conservan sus acciones y operan con normalidad. El dinero bloqueado no está disponible.
4. **Disolver (mutua):** Ambos recuperan su parte. Sin penalidad.

### La trampa — ¿qué pasa si uno traiciona?
La traición se activa automáticamente si un aliado intenta **comprar acciones de una corp cuyo CEO es el otro aliado**.

Al detectar eso en la resolución del turno:
- El traidor pierde **todo su escrow**
- La víctima recupera **su propio escrow + el del traidor**
- La alianza se rompe como "BROKEN"
- **Bono:** RETA (el Psicólogo) cobra el 5% del total del escrow como "honorarios terapéuticos" por la ruptura

**Ejemplo concreto:**
- FRANCO y CECE forman alianza con 20% de escrow
- FRANCO tiene $5.000 cash → bloquea $1.000
- CECE tiene $8.000 cash → bloquea $1.600
- Total escrow: $2.600
- FRANCO compra acciones de NEXUS (de la cual CECE es CEO) → traición detectada
- RETA cobra 5% de $2.600 = $130
- CECE recibe $2.600 − $130 = $2.470 (su propio escrow + el de Franco menos honorarios)
- FRANCO pierde los $1.000 de su escrow

---

## 10. EL REY NISSAI — MERCADO CLANDESTINO

El Nissai es el mercado negro de sabotajes. Los orders se ejecutan a medianoche, de forma anónima — el objetivo solo ve "agente anónimo."

### Los 5 sabotajes disponibles

| Sabotaje | Costo | Objetivo | Efecto |
|----------|-------|----------|--------|
| **Auditoría Sorpresa** 🕵️ | 200 IC | Jugador | El target paga el doble de su wealth tax del turno anterior |
| **Hackeo de Servidores** 💻 | 150 IC | Jugador | Robás el 30% de su IC (mínimo 50, máximo 500 IC) |
| **Corte de Luz** ⚡ | $600 cash | Corporación | Los dividendos de ESA corp se anulan completamente este turno |
| **Rumor Bajista** 📰 | 200 IC | Jugador | La corp más valiosa de la que es CEO cae −10% FMV |
| **Filtración al Fisco** 📋 | 350 IC | Jugador | El target pierde 3 turnos de exención impositiva |

### Cómo usarlo
1. Arena → 🥷 Nissai
2. Elegís el sabotaje
3. Seleccionás objetivo (jugador o corp específica)
4. Confirmás → se descuenta el IC/cash al instante
5. Se ejecuta en la resolución del turno de medianoche

**Nota importante:** No podés cancelarlo una vez enviado (a diferencia de las órdenes de mercado que se pueden cancelar hasta medianoche).

---

## 11. CASINO DE MEDIANOCHE 🎰

### Las probabilidades exactas (no aproximadas)

| Resultado | Multiplicador | Probabilidad |
|-----------|--------------|-------------|
| 💀 PERDISTE TODO | ×0 | **60%** |
| ✨ SMALL WIN | ×1.5 | 18% |
| 💰 WIN | ×2.5 | 18% |
| 🎰 JACKPOT | ×6.0 | 4% |

### Reglas
- **1 apuesta por turno**, se resuelve a medianoche
- **Mínimo:** $100
- **Máximo:** 40% de tu cash actual (el sistema no deja apostar más)
- El cash se descuenta al momento de apostar. Si perdés, no volvés a ver ese dinero.

### ¿Cuándo tiene sentido apostar?
- **Valor esperado: −4%** por apuesta (el casino tiene ventaja de la casa)
- Matemáticamente, nunca "conviene" apostar en el largo plazo
- **Pero:** si estás muy por detrás en la clasificación y necesitás acelerar, una apuesta alta con suerte puede ser tu único camino de ponerte al día
- Lo mismo si TOBE y CECE están en alianza y te van a aplastar de todas formas: high risk, high reward

---

## 12. BOUNTY BOARD — CONTRATOS P2P 🏴‍☠️

### ¿Cómo funciona?
1. Poné precio a la cabeza de alguien: mínimo $200, sin límite
2. Ese cash se descuenta de tu cuenta al instante
3. Si el objetivo va a **Chapter 11** mientras el bounty está activo → cobrás **×2 del bounty**
4. Si cancelás antes de que se concrete → recuperás el 50%

### Vencimiento
Los bounties tienen un número de turnos hasta expirar (`turns_to_expire` en la base de datos, 20 turnos por defecto). Si el objetivo no va a quiebra en ese tiempo, el bounty expira y perdés el dinero.

### Múltiples bounties sobre el mismo objetivo
Si varios jugadores pusieron bounty sobre el mismo objetivo y este va a quiebra, **solo el mayor bounty cobra ×2**. Los demás recuperan su inversión original (sin ganancia).

**Estrategia combinada:** ponés un bounty sobre alguien Y le mandás un Corte de Luz + Rumor Bajista desde Nissai para acelerar su quiebra.

---

## 13. RESOLUCIÓN DE TURNO (MEDIANOCHE)

Este es el evento más importante del juego. Todo pasa automáticamente en este orden:

### Fases en orden:

**FASE 0 — Detección de traiciones de alianza**
Se revisa si algún aliado compró acciones del CEO del otro. Si lo hizo → se rompe la alianza, se redistribuye el escrow.

**FASE 0.5 — Ejecución de órdenes Nissai**
Los sabotajes pendientes del turno se ejecutan: AUDIT, HACK, BLACKOUT, RUMOR, FISCO.

**FASE 1 — Ejecución de trades**
Las órdenes de compra/venta del mercado se procesan en orden cronológico. El FMV se ajusta según la presión compradora/vendedora.

**FASE 1.5 — Movimiento en el tablero**
Los dados tirados durante el día mueven las piezas. Se calculan efectos de casillas especiales (Psicólogo $200, Prendas notificación, alquileres de tránsito, renta al Estado).

**FASE 2 — Dividendos**
Cada jugador cobra sus dividendos de todas sus corps. Se aplican multiplicadores de rol y bonos de tech.

**FASE 2.5 — Corte de Luz (Nissai BLACKOUT)**
Si hubo Corte de Luz, se revierten los dividendos de esa corp.

**FASE 3 — Mantenimiento**
Se cobran los costos de mantenimiento de todas las corps. Se aplican descuentos de tech (urb-1, log-3).
BEEN paga su costo fijo de servidor ($50 por turno).

**FASE 4 — Reasignación de CEOs**
Quien tiene más acciones de cada corp se convierte en CEO. Las corps con urb-2 crecen +2% FMV.

**FASE 5 — Impuesto al patrimonio**
Se calcula el net worth de cada jugador y se cobra el impuesto progresivo (ver sección 14).

**FASE 5.5 — IC y expiración de patentes**
Se acredita el IC del turno a cada jugador. Las patentes que llevan ≥10 turnos pasan a Open Source (excepto ramas personales).

**FASE 6 — Chapter 11**
Si alguien quedó con cash negativo, se activa la inyección de emergencia automáticamente.

**FASE 7 — Bounties**
Si alguien fue a quiebra este turno, se pagan los bounties activos.

**FASE 7.5 — Nissai market level + evento global**
Se recalcula el nivel del mercado Nissai. 40% de probabilidad de que ocurra un evento global.

**FASE 8 — Avance del turno**
`current_turn += 1`. El sistema se desbloquea para el día siguiente.

---

## 14. IMPUESTO PROGRESIVO AL PATRIMONIO

Se cobra cada turno sobre tu **Net Worth total** (cash + valor de acciones).

| Rango de NW | Tasa |
|-------------|------|
| Hasta $10.000 | 0% |
| $10.001 – $50.000 | 2.5% |
| $50.001 – $150.000 | 7% |
| Más de $150.000 | 15% (12% para Economistas) |

**Ejemplo — turno 60, FRANCO tiene NW $45.000:**
- Primeros $10.000: 0% → $0
- $10.001 a $45.000 = $35.000 → 2.5% = **$875/turno**

**Ejemplo — turno 120, CECE tiene NW $80.000:**
- $0–$10.000: $0
- $10.000–$50.000 = $40.000 × 2.5% = $1.000
- $50.000–$80.000 = $30.000 × 7% = $2.100
- **Total: $3.100/turno en impuestos**

**Reducción con fin-3 tech:** multiplica el impuesto por 0.80 (20% menos)

---

## 15. CHAPTER 11 — QUIEBRA Y RECUPERACIÓN

### ¿Cuándo ocurre?
Si tu cash queda en negativo al finalizar la resolución del turno.

### Qué pasa automáticamente:
1. Recibís una inyección de emergencia de **$2.000 cash**
2. Tus próximos **5 turnos son exentos de impuestos** (para que te recuperes)
3. Tus acciones y deudas quedan como están

### Consecuencias adicionales:
- Si tenías bounties activos sobre vos, se pagan ×2 al bounty más grande
- Santi cobra 5% de la inyección como "honorarios de crisis"

---

## 16. EVENTOS GLOBALES (40% de probabilidad por turno)

Cada turno tiene 40% de chance de que ocurra un evento global. No puede repetirse un evento de los últimos 5 turnos.

### Lista completa de eventos posibles

**Eventos de distrito (afectan FMV de todas las corps del distrito):**
- 🏗️ BOOM EN ZONA SUR → +12% FMV
- 📉 CRACK EN EL CENTRO → −10% FMV
- ⚡ HUELGA ZONA INDUSTRIAL → −8% FMV
- 🌟 FESTIVAL NEÓN → +15% FMV
- 🚢 CONTRABANDO EN EL PUERTO → +10% FMV
- 💎 DEBACLE EN LA ZONA ALTA → −12% FMV
- 🎨 GALERÍA VIRAL → +9% FMV (Distrito Arte)
- 🔥 INCENDIO ZONA NORTE → −7% FMV

**Eventos macro (afectan a todos):**
- 🐂 MERCADO ALCISTA → +7% todos los FMV
- 🐻 MERCADO BAJISTA → −7% todos los FMV
- 🧠 BOOM TECNOLÓGICO → todos reciben +30% de IC este turno
- 🎁 FERIADO IMPOSITIVO → devuelve 50% del impuesto del turno anterior a todos

---

## 17. LOGROS GLOBALES (one-time, primero en lograrlo gana)

Los logros son recompensas únicas: una vez que alguien los gana, desaparecen para el resto.

| Logro | Condición | Premio |
|-------|-----------|--------|
| **Primera alianza** | Primer duo en formalizar alianza | $300 para ambos |
| **10% de una corp** | Primer jugador con ≥10 acciones de alguna corp | Cash bonus |
| **Wolf of D77** | 5+ trades ejecutados en un mismo turno | Cash bonus |
| **CEO del año** | CEO de la corp más valiosa en algún turno | Cash bonus |
| **Tech T2** | Primer jugador en desbloquear nodo de tier 2+ | IC bonus |

---

## 18. ROLES Y MECÁNICAS ÚNICAS

### 🟢 FRANCO — Data Scientist
**Ventaja:** +20% IC por turno (siempre, sin costo)
**Desventaja:** +10% en TODAS las compras de acciones (paga más caro)
**Estrategia natural:** Lab first. Acumular IC, patentar nodos temprano, vender las patentes indirectamente al llegar a Open Source con ventaja de timing.

---

### 🔵 BEEN — Ingeniero en Sistemas (Benja)
**Ventaja especial:** Puede **bypassear patentes ajenas**. Si alguien tiene patente de un nodo, BEEN puede igualmente desbloquearlo pagando el costo base completo. Entra como Open Source (sin exclusividad).
**Desventaja:** Paga $50/turno de "costo de servidor" fijo. En 200 turnos = $10.000 en costos fijos. También nunca puede tener Patente exclusiva en ramas globales (siempre entra como OS).
**Estrategia natural:** Esperar a que otros paten nodos caros, luego bypassearlos y aprovechar el efecto al mismo precio pero sin haber esperado 10 turnos.

---

### 🟡 CECE / TOBE — Economistas
**Ventaja:** +10% de dividendos en todas las corps. Tasa máxima de wealth tax reducida: 12% en lugar de 15%.
**Desventaja:** +20% en todos los costos de tech (la burocracia les cobra más).
**Estrategia natural:** Mercado puro. Acumular acciones de corps de alto FMV, aprovechar el +10% de dividendos a largo plazo. Evitar gastar demasiado en tech hasta que sea Open Source.
**Nota:** Dos Economistas en el juego significa que si se alían, el bono de dividendos +10% de ambos más las corps que controlen conjuntamente puede ser devastador tarde en el juego.

---

### 🩷 RETA — Psicólogo (Santi)
**Ingresos pasivos:**
1. **Casilla 10:** Cada jugador que cae paga $200 automáticamente → va a RETA
2. **Ruptura de alianzas:** 5% del total del escrow como "honorarios"
3. **Chapter 11:** 5% de la inyección de emergencia como honorarios de crisis

**Desventaja:** −15% de dividendos en todas las corps (0.85× multiplicador). En industrial corps = −15% también.
**Estrategia natural:** No puede competir en dividendos puros, pero tiene flujo de caja pasivo muy estable. Debe construir alianzas para maximizar los honorarios de ruptura (sí, literalmente incentivado a que se rompan). Invertir en corps que paguen bien dividendos incluso con el descuento.

---

### 🟠 MANU — Ingeniero Electromecánico
**Ventaja:** −20% en compras de corps del **Zona Industrial** (paga $0.80 por cada $1 que los demás pagan). +2% de dividendos en corps industriales.
**Desventaja:** −15% de dividendos en todas las demás corps (fuera de industrial).
**Estrategia natural:** Monopolizar el Zona Industrial. VOID INDUSTRIES, GRID ZERO, CHROME SYNDICATE son sus corps target. Fuera de ese distrito, está handicapeado — no debería diversificar a sectores ajenos hasta el turno 80+.

---

## 19. PROYECCIÓN ECONÓMICA: DÍA 1 vs DÍA 60 vs DÍA 200

Estas son proyecciones realistas para un jugador **activo promedio** (sin rol específico):

### Día 1 — Turno 1
- Cash: $3.000 (inicio)
- IC: ~32 (primer turno)
- Portfolio: 0 corps
- Nivel: L1
- Opciones disponibles: corps básicas (FMV $900–$4.000), tech T1

**Qué debería hacer:** comprar 10–20 acciones de 2–3 corps de 3 fueguitos, desbloquear urb-1 (100 IC) para bajar mantenimiento.

### Día 30 — Turno 30
- Cash: ~$5.000–$8.000
- IC acumulado: ~1.980 (sin gastar) / ~1.000 restante (con tech temprana)
- Portfolio: 3–5 corps, neto/turno ~+$400–$600
- Nivel: L2–L3
- Opciones: corps avanzadas (NEXUS, HYPERION), tech T2–T3

**Qué debería hacer:** expandir portfolio a corps de 4–5 fueguitos, apuntar a L3 para acceder a corps de $10k–$13k FMV.

### Día 60 — Turno 60
- Cash: ~$12.000–$18.000
- IC: ~5.460 total acumulado, ~2.000–3.000 restante (post inversión en tech)
- Portfolio: 5–8 corps, neto/turno ~+$800–$1.200
- Nivel: L3–L4
- Net Worth estimado: **$30.000–$50.000**

**Qué debería hacer:** consolidar control (CEO) en 2–3 corps estratégicas, patentes de nodos T3–T4, evaluar alianzas.

### Día 120 — Turno 120
- Cash: ~$25.000–$40.000
- IC: muy dependiente de cuánto gastaste vs. generaste
- Portfolio: 8–12 corps, empezando a ver mantenimiento crecer
- Net Worth estimado: **$80.000–$130.000**
- Nivel: L4–L5

**Qué debería hacer:** vigilar corps que están entrando en zona de costos negativos, vender las de bajo ratio base_income/FMV, comprar APEX (L5) si llegaste.

### Día 200 — Turno 200
- Net Worth estimado: **$150.000–$250.000** (jugadores activos)
- Impuesto semanal: ~$3.000–$7.500 por turno
- Las corps tempranas (FMV < $3.000) ya están drenando cash
- El que llegó a L5 primero probablemente tenga una ventaja de $40.000–$60.000 NW

**El juego nunca tiene un "fin" explícito:** gana quien tenga mayor NW al turno 200 (o cuando el grupo decida que termina).
