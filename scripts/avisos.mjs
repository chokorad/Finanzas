// Envía los avisos por correo. Corre en GitHub Actions (ver ../.github/workflows/avisos.yml).
// Variables de entorno (secrets del repo): FIREBASE_SERVICE_ACCOUNT, GMAIL_USER, GMAIL_APP_PASSWORD.
// MODO opcional: "prueba" (manda un correo ahora, sin importar hora ni día), "am" o "pm" (fuerza ese turno).
import admin from 'firebase-admin';
import nodemailer from 'nodemailer';
import { ahoraLocal, slotDe, armarAviso, ymd } from './logica.mjs';

const { FIREBASE_SERVICE_ACCOUNT, GMAIL_USER, GMAIL_APP_PASSWORD } = process.env;
const MODO = (process.env.MODO || '').trim() === 'auto' ? '' : (process.env.MODO || '').trim();   // 'auto' = igual que el horario programado
for (const [k, v] of Object.entries({ FIREBASE_SERVICE_ACCOUNT, GMAIL_USER, GMAIL_APP_PASSWORD })) {
  if (!v) { console.error(`Falta el secret ${k}`); process.exit(1); }
}

const { hoy, hora, dow } = ahoraLocal();
const prueba = MODO === 'prueba';
const slot = prueba ? 'am' : (MODO === 'am' || MODO === 'pm') ? MODO : slotDe(hora);
console.log(`Ahora (Tijuana): ${ymd(hoy)} ${hora}h, dow=${dow}, turno=${slot}, modo=${MODO || 'programado'}`);

if (!prueba && !MODO) {
  if (dow === 0 || dow === 6) { console.log('Fin de semana: no se envía.'); process.exit(0); }
  if (!slot) { console.log('Fuera de turno.'); process.exit(0); }
}

admin.initializeApp({ credential: admin.credential.cert(JSON.parse(FIREBASE_SERVICE_ACCOUNT)) });
const db = admin.firestore();
const uid = (await admin.auth().getUserByEmail(GMAIL_USER)).uid;
const base = db.collection('users').doc(uid);

const marca = base.collection('finanzas_envios').doc(`${ymd(hoy)}_${slot}`);
if (!prueba && !MODO && (await marca.get()).exists) { console.log('Ya se envió este turno.'); process.exit(0); }

const leer = async n => (await base.collection(n).get()).docs.map(d => ({ id: d.id, ...d.data() }));
const datos = { pagos: await leer('finanzas_pagos'), rend: await leer('finanzas_rend'), cup: await leer('finanzas_cupones'), cobrar: await leer('finanzas_cobrar'), cancelar: await leer('finanzas_cancelar') };

let aviso = armarAviso(datos, { hoy, dow: prueba ? 5 : dow, slot });
if (prueba && !aviso) aviso = { asunto: '☀️ Finanzas: prueba de avisos ✅', html: '<p>Los avisos funcionan. Hoy no hay pendientes urgentes.</p>', total: 0 };
if (!aviso) { console.log('Nada que avisar.'); if (!prueba) await marca.set({ vacio: true, en: admin.firestore.FieldValue.serverTimestamp() }); process.exit(0); }
if (prueba) aviso.asunto = '[PRUEBA] ' + aviso.asunto;

const t = nodemailer.createTransport({ host: 'smtp.gmail.com', port: 465, secure: true, auth: { user: GMAIL_USER, pass: GMAIL_APP_PASSWORD } });
await t.sendMail({ from: `Finanzas <${GMAIL_USER}>`, to: GMAIL_USER, subject: aviso.asunto, html: aviso.html });
console.log('Enviado:', aviso.asunto);
if (!prueba) await marca.set({ asunto: aviso.asunto, total: aviso.total, en: admin.firestore.FieldValue.serverTimestamp() });
