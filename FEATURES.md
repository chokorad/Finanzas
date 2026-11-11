# FEATURES

## Screens
- **Hoy**: everything that needs action now, red first. Quick buttons: Pagado / +1 / Hecho / Usado / Cobrado. Badge on the tab counts red+amber items. Empty store shows the seed button.
- **Pagos**: one card per payment with next due date, status tag, Pagado, undo (↩, only for the current month), edit. Tuition is a window 1→5 (due day 5).
- **Rendimientos**: one card per account (rate, cap, IPAB tag, balance, condition text) with counter (+1/−) or checkbox; resets every month.
- **Cupones**: sorted by expiry, code shown in monospace, "Usado" hides it from reminders. Coupons with a spend goal (`meta`) show a progress bar, "+ Gasto" and "Ya la activé" buttons; the button "＋ Promo Amex–Walmart" adds the Amex Platinum promo ($500 back per $3,500 on walmart.com.mx, max 3, until 2027-04-07) once.
- **Por cobrar**: open items with days open, total open amount, free-text notes, file attachments (Drive).

## Decisions already made by Mario (do not undo)
- App name: **Finanzas**. Emails to `mariohquintero@gmail.com`, Monday–Friday, 7:00 and 21:00 (America/Tijuana).
- Weekend items are announced Thursday/Friday (he never checks email on Sat/Sun).
- Tuition: reminders only on days 1–5 of each month (he has 15 days to pay), daily until marked paid. Amount 4,192.20 MXN.
- Free only: GitHub Actions for emails (not Firebase Blaze), Google Drive for files (not Firebase Storage).
- Yield accounts: Revolut 15% (4 purchases of $50+ / 30 days), Mercado Pago Apartado 15% (deposit $3,000/month; no IPAB), Nu Cajita Turbo 13% (1 purchase/month), Mifel 10% (no condition, receives new money).
- Card due days (from his own notes): LikeU → 23, Gold → 29, Amex → 11.
- Notion did not work for him because he has to go look; the app must come to him.

- Amex–Walmart promo: Mario shops groceries on walmart.com.mx and wants to track accumulated spend and be told when to re-activate the promo (daily morning email while `porActivar`; Monday progress).
- App icon: neon wallet image supplied by Mario (`icon-*.png` are generated from it, corners filled so Android does not add a white ring).

## Edge cases
- Day 29–31 in short months clamps to the last day.
- Cycles older than the previous month are ignored (so an item left unpaid for 2+ months stops showing as overdue; mark/clean it up).
- Drive token is not persisted; popup may be blocked on some phones — open the app in the browser and allow popups for the site.

- Por cobrar: 'Nota rápida' (🎤 usa el dictado del teclado) guarda un pendiente `porDefinir:true` con solo el texto; aparece en Hoy y en el correo AM como 'Por definir' hasta que se edita y guarda (se pone `porDefinir:false`). Si se agrega Gemini algún día, llenaría monto/deQuien solo.

- Calendario mensual en Hoy (v10): navegación ◀ ▶, día de hoy resaltado, toque en un día muestra el detalle. Lógica en `eventosMes()`/`vistaCal()` de app.js (solo pantalla). Pendiente posible: mostrar también los eventos del calendario en los correos.

- Dinero (v15): capital total, jarras de T. Harv Eker (Necesidades 15,000 = colchón de 2 meses a $7,500; Educación, Diversión, Dar 1,500 c/u; Libertad financiera 0; Ahorro a largo plazo = resto) y "Tarjetas" aparte. Mario actualiza saldos y reparte cada quincena (no se anota gasto por gasto). Decisión: todo se acumula; el efectivo es una cuenta más; las jarras dicen de qué es el dinero y las cuentas dónde está.
- Estados de cuenta (v15): cortes LikeU 4, Gold 11, Amex 22, Mercado Pago 7; recordatorio de revisión 2 días después. La clasificación de gastos por jarra la hace Claude en el chat con los archivos (CSV/XML) que Mario mande; el resumen mensual va en un TXT en su Drive (no automatizado en la app).
- Botón flotante 🎤: abre "Nota rápida" desde cualquier pestaña (dictado con el micrófono del teclado).

- Regla de Mario (11 nov 2026) para clasificar gastos por jarra: NO agrupar ni clasificar en automático por comercio (ej. un día en Walmart pudo comprar un videojuego). Cada mes se revisa gasto por gasto con él y se clasifica con su respuesta.
