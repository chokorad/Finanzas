# FEATURES

## Screens
- **Hoy**: everything that needs action now, red first. Quick buttons: Pagado / +1 / Hecho / Usado / Cobrado. Badge on the tab counts red+amber items. Empty store shows the seed button.
- **Pagos**: one card per payment with next due date, status tag, Pagado, undo (↩, only for the current month), edit. Tuition is a window 1→5 (due day 5).
- **Rendimientos**: one card per account (rate, cap, IPAB tag, balance, condition text) with counter (+1/−) or checkbox; resets every month.
- **Cupones**: sorted by expiry, code shown in monospace, "Usado" hides it from reminders.
- **Por cobrar**: open items with days open, total open amount, free-text notes, file attachments (Drive).

## Decisions already made by Mario (do not undo)
- App name: **Finanzas**. Emails to `mariohquintero@gmail.com`, Monday–Friday, 7:00 and 21:00 (America/Tijuana).
- Weekend items are announced Thursday/Friday (he never checks email on Sat/Sun).
- Tuition: reminders only on days 1–5 of each month (he has 15 days to pay), daily until marked paid. Amount 4,192.20 MXN.
- Free only: GitHub Actions for emails (not Firebase Blaze), Google Drive for files (not Firebase Storage).
- Yield accounts: Revolut 15% (4 purchases of $50+ / 30 days), Mercado Pago Apartado 15% (deposit $3,000/month; no IPAB), Nu Cajita Turbo 13% (1 purchase/month), Mifel 10% (no condition, receives new money).
- Card due days (from his own notes): LikeU → 23, Gold → 29, Amex → 11.
- Notion did not work for him because he has to go look; the app must come to him.

## Edge cases
- Day 29–31 in short months clamps to the last day.
- Cycles older than the previous month are ignored (so an item left unpaid for 2+ months stops showing as overdue; mark/clean it up).
- Drive token is not persisted; popup may be blocked on some phones — open the app in the browser and allow popups for the site.
