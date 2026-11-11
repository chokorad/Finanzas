# CHANGELOG

## 2026-11-09 — Spend-goal promos + new icon
- Coupons can have a spend goal (progress bar, "+ Gasto", re-activation flag); button to add the Amex–Walmart promo. Files: `app.js`, `index.html` (CSS `.prog`), `scripts/logica.mjs` (morning email: activate reminder, Monday progress, 30-day expiry window), `scripts/prueba.mjs`.
- New app icon from Mario's image: `icon-192/512.png`, `apple-touch-icon.png`, `favicon-32.png`. `sw.js` cache v6.

## 2026-11-09 — Repo renamed
- GitHub repo renamed `Finanzas` -> `finanzas-app`; Pages URL is now `https://chokorad.github.io/finanzas-app/`. Reason: Chrome on the owner's Pixel Fold had an orphaned install record for the old path ("already installed" but "Could not open app"). New path = new scope. Local folder name stays `Finanzas`. `sw.js` cache v5. Add `chokorad.github.io` check in Firebase authorized domains is unchanged (same domain).

## 2026-11-09 — Manifest shape experiment
- `manifest.json`: removed explicit `id`, `start_url` -> `./index.html`, icons merged into `any maskable` entries (same shape as the Cobros manifest that installs fine). Reason: Chrome on Pixel Fold says "Open app" instead of "Install" for Finanzas and fotos-sala only; `chrome://webapks` shows no phantom install. `sw.js` cache v4.

## 2026-11-09 — Install fix
- `manifest.json`: added explicit `id` (`/Finanzas/app`) because Chrome on Android reported the app as "already installed" (no `id`, shared origin chokorad.github.io). `sw.js` cache bumped to v3.

## 2026-11-09 — First version
- New app: 5 sections (Hoy, Pagos, Rendimientos, Cupones, Por cobrar), Firestore data under `finanzas_*`, Google Drive attachments for Por cobrar.
- Email reminders via GitHub Actions (`scripts/`, `.github/workflows/avisos.yml`), weekdays 7:00 and 21:00 America/Tijuana, weekend look-ahead on Thu/Fri, dedupe markers, self re-enable step.
- Shares the Firebase project of Cobros; own collections.
- Files: everything in the repo root and `scripts/`.

- Por cobrar: 'Nota rápida' (🎤 usa el dictado del teclado) guarda un pendiente `porDefinir:true` con solo el texto; aparece en Hoy y en el correo AM como 'Por definir' hasta que se edita y guarda (se pone `porDefinir:false`). Si se agrega Gemini algún día, llenaría monto/deQuien solo.

- v9: la versión se ve al pie de la app ("Finanzas vN · fecha"). Regla: en cada cambio subir `VERSION` en app.js y `CACHE` en sw.js al mismo número.

- v10: calendario mensual arriba de la pestaña Hoy (solo en pantalla, los correos no cambian). Emojis por tipo: 💳 pago de tarjeta, 🎓 colegiatura (ventana 1–5), 🌱 día de empezar la condición de rendimientos, ⏳ último día del mes para cumplirla, 🎟 vencimiento de cupón, 💵 cobro esperado. Colores: rojo ≤3 días o vencido, ámbar ≤10 días, verde listo. Campos nuevos opcionales: `fechaEsperada` (finanzas_cobrar) y `diaInicio` (finanzas_rend, vacío = día 1).

- v11: el correo de las 7:00 ahora incluye el calendario: "Rendimientos: hoy toca empezar" (día `diaInicio`, o día 1), "Cobros esperados" (`fechaEsperada`, rojo si ya pasó) y "📅 Próximos 7 días" (pagos, rendimientos, cupones y cobros que vienen). Solo turno AM. Lógica en scripts/logica.mjs.

- v12: el correo de las 7:00 trae arriba el calendario del mes como cuadrícula (mismos emojis y colores que la app; si es día 25 o más, también el mes siguiente). `calendarioHtml()`/`eventosMes()` en scripts/logica.mjs son espejo de `vistaCal()`/`eventosMes()` de app.js: si cambias uno, cambia el otro.

- v13: 💰 depósitos de nómina ISSSTE en el calendario (app y correo): quincena del 15 (≈ $18,100) y de fin de mes (≈ $21,300), más extras estimados (aguinaldo nov/dic, vale decembrino 8-dic, prima vacacional 15-dic y 31-mar, antigüedad 31-dic y 25-may, bono de Reyes 6-ene, mérito fin de ene/abr/jul/oct). Datos fijos en `QUINCENA`/`EXTRAS_NOMINA` (app.js y scripts/logica.mjs, deben coincidir; fuente: claude/ingresos-nomina.md del proyecto). En el correo van en la agenda de 7 días como "suaves": no disparan un correo por sí solos.

- v14: los 💰 de nómina usan las fechas reales que dio Mario (`QUINCENAS` en app.js y scripts/logica.mjs): 10 y 25 nov, 10 y 17 dic 2026. Se quitaron las fechas estimadas de la v13 (15/fin de mes y extras). Pendiente: Mario pasará las fechas de 2027 y, si quiere, los extras (aguinaldo, vale, etc.).

- v15: (1) Pestaña **Dinero** reemplaza a Rendim.: capital total (suma de `finanzas_rend.saldo`), rendimiento estimado (min(saldo, tope) × tasa / 12), jarras de Eker + renglón aparte "Tarjetas" (`finanzas_jarras`, campo `aparte`), metas con avance (`finanzas_metas`: Medellín 62,200 y Carro 120,000 contra la jarra "largo plazo"), "Sin asignar" = total − jarras (rojo si no cuadra), botones Actualizar saldos / Mover entre jarras / ＋ / −. Todo se acumula, sin reinicios. El efectivo y Santander son cuentas (`efectivo:true`). Botón "Cargar mis cifras (10 nov 2026)" siembra cuentas, jarras, metas, cortes y la tarjeta Mercado Pago. (2) **Estados de cuenta**: campo `corte` en pagos, revisión = corte + 2 días (fin de semana → viernes), pendientes en Hoy, Pagos, correo AM y calendario (📄); se marca con "Revisado" (`estados: ['YYYY-MM']`, desde `ESTADOS_DESDE` = 2026-11). (3) Botón flotante 🎤 (nota rápida) en todas las pestañas. (4) Tarjeta Mercado Pago: pago 17, corte 7.
