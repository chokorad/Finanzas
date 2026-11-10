# CHANGELOG

## 2026-11-09 — Install fix
- `manifest.json`: added explicit `id` (`/Finanzas/app`) because Chrome on Android reported the app as "already installed" (no `id`, shared origin chokorad.github.io). `sw.js` cache bumped to v3.

## 2026-11-09 — First version
- New app: 5 sections (Hoy, Pagos, Rendimientos, Cupones, Por cobrar), Firestore data under `finanzas_*`, Google Drive attachments for Por cobrar.
- Email reminders via GitHub Actions (`scripts/`, `.github/workflows/avisos.yml`), weekdays 7:00 and 21:00 America/Tijuana, weekend look-ahead on Thu/Fri, dedupe markers, self re-enable step.
- Shares the Firebase project of Cobros; own collections.
- Files: everything in the repo root and `scripts/`.
