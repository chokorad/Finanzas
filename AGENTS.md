# AGENTS.md — read this first

## Purpose
"Finanzas" is a personal reminder PWA for Mario (GitHub: chokorad, Mexicali). Mario has severe attention problems and kept missing payment dates, so the app **pushes** reminders to his email instead of waiting for him to open it. Five sections: Hoy (summary), Pagos (credit cards + son's school tuition), Rendimientos (monthly conditions to keep yield on 4 savings accounts), Cupones (expiring coupons/promo codes), Por cobrar (money owed to him, with notes and attached files). UI text is Spanish (Mexico). Single user; only `mariohquintero@gmail.com` may sign in.

## Stack
- Frontend: vanilla HTML/CSS/JS ES modules, no build step, no npm for the app. Firebase JS SDK 12.19.0 loaded from `www.gstatic.com` (version pinned in `app.js` and cached by `sw.js`).
- Data: Firestore (free Spark plan), shared Firebase project with the "Cobros" app (`cobros-97f8b`). Everything lives under `users/{uid}/finanzas_*`.
- Files: attachments of "Por cobrar" go to the user's Google Drive (REST, scope `drive.file`, folder "Finanzas - Por cobrar"). **Not** Firebase Storage (it needs the paid Blaze plan; Mario wants zero cost).
- Emails: GitHub Actions cron (`.github/workflows/avisos.yml`) runs `scripts/avisos.mjs` (Node 20, firebase-admin + nodemailer through Gmail SMTP with an app password).
- Hosting: GitHub Pages (static). PWA: `manifest.json` + `sw.js`.

## Run locally
Static files only: `python -m http.server 8080` in the project folder, open `http://localhost:8080`. Google sign-in on localhost needs `localhost` in Firebase Auth authorized domains. Test email logic without network: `cd scripts && npm install && node prueba.mjs`.

## Deploy
Push to `main` of the GitHub repo; Pages serves the root. The email job needs three repo secrets (never commit them): `FIREBASE_SERVICE_ACCOUNT`, `GMAIL_USER`, `GMAIL_APP_PASSWORD`. Step-by-step setup is in `LEEME.md` (Spanish, for Mario).

## Rules for editing
- **Two copies of the reminder logic**: `ciclos()`, `estadoRend()`, `estadoCup()` exist in `app.js` (screen) and `scripts/logica.mjs` (emails). Change both together and run `node scripts/prueba.mjs`.
- Do not rename Firestore fields or collections (`finanzas_pagos`, `finanzas_rend`, `finanzas_cupones`, `finanzas_cobrar`, `finanzas_envios`); existing data depends on them.
- Bump `CACHE` in `sw.js` after any change to shipped files.
- Never write secrets in the repo. `config.js` holds only the public Firebase web config.
- Do not add Firebase Storage, Cloud Functions or anything that requires the Blaze plan.
- Keep UI text in Spanish; keep code comments and docs in English (or Spanish where a file already is).
- Keep changes small; log them in `CHANGELOG.md`.
