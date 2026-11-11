# ARCHITECTURE

## File map
| File | What it does |
|---|---|
| `index.html` | Shell, styles, 5 tab views, modal container |
| `app.js` | Auth, Firestore listeners, render of the 5 views, forms, Drive upload, seed data |
| `config.js` | Firebase web config + allowed emails (public values only) |
| `sw.js` | Service worker (network-first for own files, cache-first for gstatic SDK) |
| `manifest.json`, `icon-*.png`, `apple-touch-icon.png`, `favicon-32.png` | PWA install assets |
| `firestore.rules` | Rules: only `users/{uid}/**` for the allowed email |
| `scripts/logica.mjs` | Pure reminder logic + email builder (no network) |
| `scripts/avisos.mjs` | Reads Firestore with the service account, builds and sends the email, writes dedupe marker |
| `scripts/prueba.mjs` | Tests for `logica.mjs` (`node prueba.mjs`) |
| `scripts/package.json` | Deps for the email script only |
| `.github/workflows/avisos.yml` | Cron + manual trigger for the emails |

## Data model (Firestore, under `users/{uid}/`)
**finanzas_pagos** — recurring monthly payments
`nombre` string, `dia` number (due day of month, clamped to month length), `diaInicio` number|null (if set, reminders start that day: "window" like tuition 1→5), `avisoDias` number (days of advance notice when no window, default 3), `monto` number|null, `nota` string, `activo` bool, `orden` number, `desde` "YYYY-MM" (first month tracked; earlier months are ignored), `pagados` string[] of "YYYY-MM" already paid.
Example: `{nombre:"Colegiatura (hijo)", dia:5, diaInicio:1, monto:4192.2, desde:"2026-12", pagados:[]}`

**finanzas_rend** — savings accounts with a monthly condition
`nombre`, `tasa` number (%), `tope` number, `saldo` number, `ipab` bool, `tipoCond` "check"|"contador"|"ninguna", `meta` number (for contador), `condicion` string, `diaAviso` number (email reminders start this day of the month, default 20), and the monthly state `mes` "YYYY-MM", `progreso` number, `cumplido` bool. State auto-resets: if `mes` != current month it is treated as 0/false.

**finanzas_cupones** — `nombre`, `codigo`, `donde`, `vence` "YYYY-MM-DD"|"", `usado` bool, `nota`. Optional *spend-goal promo* fields: `meta` number (spend needed per bonus), `bonificacion` number (reward), `maxVeces` number|null (max bonuses), `veces` number (bonuses already earned), `gastado` number (progress in the current cycle), `porActivar` bool (promo must be (re)activated before spending counts). When a coupon has `meta`: reminder window is 30 days before `vence` (7 for plain coupons); spend added via "+ Gasto" resets `gastado` to 0 and `veces`+1 on reaching `meta`, sets `porActivar` true (or `usado` true after `maxVeces`).

**finanzas_cobrar** — money owed
`concepto`, `monto`, `deQuien`, `desde` "YYYY-MM-DD", `nota` (case numbers, phone, etc.), `estatus` "pendiente"|"cobrado", `cobradoFecha`, `archivos` array of `{nombre, fileId, link, mime}` (Drive files).

**finanzas_envios** — dedupe markers, doc id `YYYY-MM-DD_am|pm`, written by `avisos.mjs` only.

## Main flows
1. Sign in with Google → `onAuthStateChanged` checks the email → 4 `onSnapshot` listeners fill `S` → `render()`.
2. Empty store → "Cargar mis datos iniciales" button runs `sembrar()` (3 cards, tuition, 4 yield accounts).
3. Pay a card: "Pagado" → `arrayUnion(mk)` into `pagados`; the cycle disappears until next month.
4. Attach a file to a "Por cobrar" item: item must exist → "Conectar Drive" (popup, token kept in memory ~50 min) → "Subir archivo" → multipart upload to Drive folder → metadata saved in `archivos`.
5. Emails: cron fires at several UTC hours; `avisos.mjs` converts to America/Tijuana, skips weekends and out-of-window hours, skips if the `finanzas_envios` marker exists, builds the mail with `armarAviso`, sends, writes the marker.

## Email rules (`armarAviso`)
- Turns: morning 7–9 h (everything), night 21–23 h (only payments due ≤ tomorrow/overdue and coupons ≤ 1 day).
- Thursday/Friday also include items due through Monday (Mario does not read email on weekends).
- Payments: overdue and "pronto" cycles every weekday until marked paid.
- Rendimientos: from `diaAviso` until the condition is done. Cupones: 7 days before expiry. Por cobrar: open ≥ 7 days (morning only, max 10).
- Nothing to report → no email, except a Monday morning "todo en orden" heartbeat.

## External services and where secrets live
- Firebase project `cobros-97f8b` (Auth with Google provider, Firestore). Authorized domain `chokorad.github.io` must be listed.
- Google Drive API must be enabled in that Google Cloud project for uploads.
- GitHub repo secrets: `FIREBASE_SERVICE_ACCOUNT` (service-account JSON), `GMAIL_USER`, `GMAIL_APP_PASSWORD`. Nothing secret is stored in files.

Campos opcionales añadidos en v10: `finanzas_cobrar.fechaEsperada` (YYYY-MM-DD, fecha esperada del reembolso) y `finanzas_rend.diaInicio` (día del mes para empezar la condición; vacío = 1). Solo los usa el calendario de app.js.

v15 — colecciones nuevas bajo users/{uid}: `finanzas_jarras` {nombre, monto, orden, nota?, aparte?}, `finanzas_metas`, `finanzas_recurrentes` (nombre, monto, frecuencia, categoria, medio, nota, confirmar, activo) {nombre, objetivo, orden}. Campos nuevos: `finanzas_pagos.corte` (día de corte), `finanzas_pagos.estados` (array 'YYYY-MM' de cortes ya revisados), `finanzas_rend.efectivo` (oculta IPAB). Capital total = suma de `saldo` de `finanzas_rend`. Funciones espejo app.js ↔ scripts/logica.mjs: `ajustaFinde`, `revisionDe`, `estadosPendientes`, `ESTADOS_DESDE`, `QUINCENAS`, `eventosMes` (calendario).
