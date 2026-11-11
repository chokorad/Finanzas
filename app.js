// Finanzas — PWA vanilla JS. Firestore (SDK) + Google Drive (REST) para archivos.
import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js';
import { getAuth, GoogleAuthProvider, signInWithPopup, onAuthStateChanged, signOut }
  from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js';
import { getFirestore, collection, doc, onSnapshot, addDoc, setDoc, updateDoc, deleteDoc,
  arrayUnion, arrayRemove, writeBatch }
  from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js';
import { firebaseConfig, CORREOS_PERMITIDOS } from './config.js';

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// ---------- utilidades ----------
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const MXN = n => (n == null || n === '') ? '' : Number(n).toLocaleString('es-MX', { style: 'currency', currency: 'MXN' });
const pad = n => String(n).padStart(2, '0');
const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const ymKey = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
const parse = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const diffDays = (a, b) => Math.round((a - b) / 86400000);
const MESES = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
const fmtFecha = d => `${d.getDate()} ${MESES[d.getMonth()]}`;
const today = () => { const n = new Date(); return new Date(n.getFullYear(), n.getMonth(), n.getDate()); };
function dueOf(key, dia) { const [y, m] = key.split('-').map(Number); const last = new Date(y, m, 0).getDate(); return new Date(y, m - 1, Math.min(dia, last)); }
function addMonths(key, k) { const [y, m] = key.split('-').map(Number); return ymKey(new Date(y, m - 1 + k, 1)); }
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.hidden = false; clearTimeout(toast._t); toast._t = setTimeout(() => t.hidden = true, 2600); }
function cuando(dd) { return dd < 0 ? `venció hace ${-dd} d` : dd === 0 ? 'vence HOY' : dd === 1 ? 'vence mañana' : `en ${dd} días`; }

// ---------- lógica (la misma vive en scripts/avisos.mjs: si cambias una, cambia la otra) ----------
function ciclos(p, hoy) {
  const key = ymKey(hoy), out = [];
  for (const k of [-1, 0, 1]) {
    const mk = addMonths(key, k);
    if (p.desde && mk < p.desde) continue;
    if ((p.pagados || []).includes(mk)) continue;
    const due = dueOf(mk, p.dia);
    const start = p.diaInicio ? dueOf(mk, p.diaInicio)
      : new Date(due.getFullYear(), due.getMonth(), due.getDate() - (p.avisoDias ?? 3));
    const dd = diffDays(due, hoy);
    const estado = dd < 0 ? 'vencido' : dd === 0 ? 'hoy' : hoy >= start ? 'pronto' : 'futuro';
    out.push({ mk, due, start, dd, estado });
  }
  return out;
}
function estadoRend(r, hoy) {
  const mesAct = ymKey(hoy), vigente = r.mes === mesAct;
  const progreso = vigente ? (r.progreso || 0) : 0, cumplido = vigente ? !!r.cumplido : false;
  const tipo = r.tipoCond || 'ninguna';
  const hecho = tipo === 'ninguna' ? true : tipo === 'check' ? cumplido : progreso >= (r.meta || 1);
  const avisar = !hecho && hoy.getDate() >= (r.diaAviso ?? 20);
  return { progreso, cumplido, hecho, avisar, tipo, mesAct };
}
function estadoCup(c, hoy) {
  if (c.usado || !c.vence) return { dd: null, pronto: false, vencido: false };
  const dd = diffDays(parse(c.vence), hoy);
  return { dd, pronto: dd >= 0 && dd <= (c.meta ? 30 : 7), vencido: dd < 0 };
}

// ---------- estado ----------
const VERSION = 'v15 · 11 nov 2026'; // súbela junto con CACHE en sw.js en cada cambio
const elVer = document.getElementById('ver'); if (elVer) elVer.textContent = 'Finanzas ' + VERSION;
const S = { pagos: [], rend: [], cup: [], cobrar: [], jarras: [], metas: [] };
const cargado = { pagos: false, rend: false };
let uid = null, unsubs = [];
const COL = { pagos: 'finanzas_pagos', rend: 'finanzas_rend', cup: 'finanzas_cupones', cobrar: 'finanzas_cobrar', jarras: 'finanzas_jarras', metas: 'finanzas_metas' };
const ref = (k, id) => id ? doc(db, 'users', uid, COL[k], id) : collection(db, 'users', uid, COL[k]);

function escuchar() {
  unsubs.forEach(u => u()); unsubs = [];
  for (const k of Object.keys(COL)) {
    unsubs.push(onSnapshot(ref(k), snap => {
      S[k] = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      cargado[k] = true; render();
    }, err => { console.error(err); toast('Error de lectura: ' + err.code); }));
  }
}

// ---------- login ----------
$('#btn-login').onclick = async () => {
  try { await signInWithPopup(auth, new GoogleAuthProvider()); }
  catch (e) { $('#login-msg').textContent = 'No se pudo entrar: ' + (e.code || e.message); }
};
$('#btn-salir').onclick = () => signOut(auth);
onAuthStateChanged(auth, user => {
  if (!user) { document.body.dataset.auth = 'no'; uid = null; unsubs.forEach(u => u()); return; }
  if (CORREOS_PERMITIDOS.length && !CORREOS_PERMITIDOS.includes(user.email)) {
    $('#login-msg').textContent = 'Ese correo no tiene acceso.'; signOut(auth); return;
  }
  uid = user.uid; $('#quien').textContent = user.email;
  document.body.dataset.auth = 'si'; escuchar();
});

// ---------- pestañas ----------
let tab = 'hoy';
document.querySelectorAll('header.top button').forEach(b => b.onclick = () => { tab = b.dataset.tab; render(); window.scrollTo(0, 0); });

// ---------- render ----------
function render() {
  if (!uid) return;
  document.querySelectorAll('header.top button').forEach(b => b.classList.toggle('act', b.dataset.tab === tab));
  document.querySelectorAll('.vista').forEach(v => v.hidden = v.id !== 'v-' + tab);
  const hoy = today();
  const urgentes = listaHoy(hoy);
  const n = urgentes.filter(u => u.nivel <= 1).length;
  const bn = $('#n-hoy'); bn.hidden = !n; bn.textContent = n;
  if (tab === 'hoy') $('#v-hoy').innerHTML = vistaHoy(urgentes, hoy);
  if (tab === 'pagos') $('#v-pagos').innerHTML = vistaPagos(hoy);
  if (tab === 'rend') $('#v-rend').innerHTML = vistaRend(hoy);
  if (tab === 'cup') $('#v-cup').innerHTML = vistaCup(hoy);
  if (tab === 'cobrar') $('#v-cobrar').innerHTML = vistaCobrar(hoy);
}

function cicloMostrado(p, hoy) { const cs = ciclos(p, hoy); return cs.find(c => c.estado !== 'futuro') || cs[0] || null; }
const claseNivel = n => n === 0 ? 'rojo' : n === 1 ? 'amb' : 'ok';

function listaHoy(hoy) {
  const out = [];
  for (const p of S.pagos.filter(p => p.activo !== false)) {
    for (const c of ciclos(p, hoy).filter(c => c.estado !== 'futuro')) {
      out.push({ nivel: c.dd <= 0 ? 0 : 1, orden: c.dd, tipo: 'pago', p, c });
    }
  }
  for (const r of S.rend) { const e = estadoRend(r, hoy); if (e.avisar) out.push({ nivel: 1, orden: 50, tipo: 'rend', r, e }); }
  for (const c of S.cup) {
    const e = estadoCup(c, hoy);
    if (c.meta) { if (!c.usado && !e.vencido && (c.porActivar || e.pronto)) out.push({ nivel: 1, orden: 55, tipo: 'promo', c, e }); }
    else if (e.pronto) out.push({ nivel: e.dd <= 1 ? 0 : 1, orden: e.dd, tipo: 'cup', c, e });
  }
  for (const e of estadosPendientes(S.pagos, hoy)) out.push({ nivel: 1, orden: 70, tipo: 'estado', e });
  for (const x of S.cobrar.filter(x => x.estatus !== 'cobrado')) {
    const dias = diffDays(hoy, parse(x.desde || ymd(hoy)));
    if (dias >= 7 || x.porDefinir) out.push({ nivel: 1, orden: x.porDefinir ? 79 : 80, tipo: 'cobrar', x, dias });
  }
  return out.sort((a, b) => a.nivel - b.nivel || a.orden - b.orden);
}

function vistaHoy(lista, hoy) { return vistaCal(hoy) + vistaHoyLista(lista, hoy); }
function vistaHoyLista(lista, hoy) {
  if ((cargado.pagos && !S.pagos.length) && (cargado.rend && !S.rend.length)) {
    return `<div class="vacio">Aún no hay nada cargado.<br><br><button id="btn-seed">Cargar mis datos iniciales</button><br><small>Tarjetas, colegiatura y cuentas de rendimiento.</small></div>`;
  }
  if (!lista.length) return `<div class="vacio">✅ Nada urgente hoy.</div>`;
  return `<h2>Pendiente</h2>` + lista.map(u => {
    if (u.tipo === 'pago') return `<div class="card ${claseNivel(u.nivel)}"><div class="fila"><div><div class="t">${esc(u.p.nombre)}</div>
      <span class="tag ${u.nivel === 0 ? 'rojo' : 'amb'}">${cuando(u.c.dd)}</span> <small>${fmtFecha(u.c.due)} ${u.p.monto ? '· ' + MXN(u.p.monto) : ''}</small></div>
      <div class="acciones"><button data-act="pago-pagar" data-id="${u.p.id}" data-mk="${u.c.mk}">Pagado</button></div></div></div>`;
    if (u.tipo === 'rend') return `<div class="card amb"><div class="fila"><div><div class="t">${esc(u.r.nombre)}</div>
      <small>${esc(u.r.condicion || '')}</small><br><span class="tag amb">${u.e.tipo === 'contador' ? u.e.progreso + '/' + (u.r.meta || 1) : 'falta este mes'}</span></div>
      <div class="acciones">${u.e.tipo === 'contador' ? `<button data-act="rend-mas" data-id="${u.r.id}">+1</button>` : `<button data-act="rend-toggle" data-id="${u.r.id}">Hecho</button>`}</div></div></div>`;
    if (u.tipo === 'estado') return `<div class="card amb"><div class="fila"><div><div class="t">📄 ${esc(u.e.p.nombre)}</div>
      <span class="tag amb">estado de cuenta pendiente</span> <small>corte ${fmtFecha(u.e.corte)} · desde ${fmtFecha(u.e.rev)} (${u.e.dias} d)</small></div>
      <div class="acciones"><button data-act="estado-ok" data-id="${u.e.p.id}" data-mk="${u.e.mk}">Revisado</button></div></div></div>`;
    if (u.tipo === 'promo') return `<div class="card amb"><div class="fila"><div><div class="t">🎟 ${esc(nomCup(u.c))}</div>
      <span class="tag amb">${u.c.porActivar ? 'actívala antes de gastar' : (u.e.dd == null ? 'en curso' : 'vence en ' + u.e.dd + ' d')}</span>
      <small>Llevas ${MXN(u.c.gastado || 0)} · faltan ${MXN(Math.max(0, u.c.meta - (u.c.gastado || 0)))}</small></div>
      <div class="acciones">${u.c.porActivar ? `<button data-act="cup-activado" data-id="${u.c.id}">Ya la activé</button>` : `<button data-act="cup-gasto" data-id="${u.c.id}">＋ Gasto</button>`}</div></div></div>`;
    if (u.tipo === 'cup') return `<div class="card ${claseNivel(u.nivel)}"><div class="fila"><div><div class="t">🎟 ${esc(u.c.nombre)}</div>
      <span class="tag ${u.nivel === 0 ? 'rojo' : 'amb'}">${u.e.dd === 0 ? 'vence HOY' : 'vence en ' + u.e.dd + ' d'}</span> <small>${esc(u.c.codigo || '')}</small></div>
      <div class="acciones"><button data-act="cup-usado" data-id="${u.c.id}">Usado</button></div></div></div>`;
    return `<div class="card amb"><div class="fila"><div><div class="t">💵 ${esc(u.x.concepto)}</div>
      <small>${esc(u.x.deQuien || '')} ${u.x.monto ? '· ' + MXN(u.x.monto) : ''}</small><br><span class="tag amb">${u.x.porDefinir ? 'por definir' : u.dias + ' días abierto'}</span></div>
      <div class="acciones"><button class="sec" data-act="cob-editar" data-id="${u.x.id}">Abrir</button><button data-act="cob-cobrado" data-id="${u.x.id}">Cobrado</button></div></div></div>`;
  }).join('');
}

function vistaPagosBase(hoy) {
  const items = S.pagos.slice().sort((a, b) => (a.orden ?? 99) - (b.orden ?? 99));
  const filas = items.map(p => {
    const c = cicloMostrado(p, hoy);
    const mkAct = ymKey(hoy), pagadoEsteMes = (p.pagados || []).includes(mkAct);
    if (!c) return `<div class="card gris"><div class="t">${esc(p.nombre)}</div></div>`;
    const nivel = c.estado === 'vencido' || c.estado === 'hoy' ? 0 : c.estado === 'pronto' ? 1 : 2;
    return `<div class="card ${claseNivel(nivel)}"><div class="fila"><div>
      <div class="t">${esc(p.nombre)}</div>
      <span class="tag ${nivel === 0 ? 'rojo' : nivel === 1 ? 'amb' : 'ok'}">${c.estado === 'futuro' ? (pagadoEsteMes ? 'pagado este mes' : 'próximo') : cuando(c.dd)}</span>
      <small>${p.diaInicio ? `del ${p.diaInicio} al ${p.dia} · ` : ''}${fmtFecha(c.due)} ${p.monto ? '· ' + MXN(p.monto) : ''}</small>
      ${p.nota ? `<div class="nota">${esc(p.nota)}</div>` : ''}</div>
      <div class="acciones">
        <button data-act="pago-pagar" data-id="${p.id}" data-mk="${c.mk}">Pagado</button>
        ${pagadoEsteMes && c.mk !== mkAct ? `<button class="sec chico" data-act="pago-deshacer" data-id="${p.id}" data-mk="${mkAct}">↩</button>` : ''}
        <button class="sec chico" data-act="pago-editar" data-id="${p.id}">✎</button></div></div></div>`;
  }).join('');
  return `<div class="barra"><button class="sec" data-act="pago-nuevo">＋ Nuevo pago</button></div>` + (filas || '<div class="vacio">Sin pagos.</div>');
}

function cuentasHtml(hoy) {
  const filas = S.rend.slice().sort((a, b) => (b.tasa || 0) - (a.tasa || 0)).map(r => {
    const e = estadoRend(r, hoy);
    const estado = e.tipo === 'ninguna' ? '<span class="tag ok">sin condición</span>'
      : e.hecho ? '<span class="tag ok">cumplido este mes</span>'
      : `<span class="tag ${e.avisar ? 'amb' : ''}">${e.tipo === 'contador' ? e.progreso + '/' + (r.meta || 1) : 'pendiente'}</span>`;
    const accion = e.tipo === 'contador'
      ? `<button class="sec chico" data-act="rend-menos" data-id="${r.id}">−</button><button data-act="rend-mas" data-id="${r.id}">+1</button>`
      : e.tipo === 'check' ? `<button class="${e.hecho ? 'sec' : ''}" data-act="rend-toggle" data-id="${r.id}">${e.hecho ? 'Deshacer' : 'Hecho'}</button>` : '';
    return `<div class="card ${e.hecho ? 'ok' : e.avisar ? 'amb' : ''}"><div class="fila"><div>
      <div class="t">${esc(r.nombre)} · ${r.tasa ?? '?'}%</div>
      ${estado}${r.efectivo ? '' : `<span class="tag ${r.ipab ? 'ok' : 'rojo'}">${r.ipab ? 'IPAB' : 'sin IPAB'}</span>`}
      <small>${r.tope ? 'tope ' + MXN(r.tope) : ''} ${r.saldo != null ? '· tienes ' + MXN(r.saldo) : ''}</small>
      <div class="nota">${esc(r.condicion || '')}</div></div>
      <div class="acciones">${accion}<button class="sec chico" data-act="rend-editar" data-id="${r.id}">✎</button></div></div></div>`;
  }).join('');
  return (filas || '<div class="vacio">Sin cuentas.</div>')
    + `<p class="mute"><small>El avance de las condiciones se reinicia solo cada mes y te avisan por correo desde el día indicado en cada cuenta.</small></p>`;
}

function vistaPagos(hoy) {
  const tarj = S.pagos.filter(p => p.activo !== false && p.corte).sort((a, b) => (a.orden ?? 99) - (b.orden ?? 99));
  let est = '';
  if (tarj.length) {
    const pend = estadosPendientes(S.pagos, hoy);
    est = '<h2>Estados de cuenta</h2>' + tarj.map(p => {
      const mios = pend.filter(e => e.p.id === p.id);
      let prox = null;
      for (const k of [0, 1]) { const mk = addMonths(ymKey(hoy), k), r = revisionDe(p, mk); if (r >= hoy && mk >= ESTADOS_DESDE) { prox = r; break; } }
      const hist = (p.estados || []).slice().sort().slice(-4).map(m => `<span class="tag ok">✅ ${MESES[+m.slice(5) - 1]}</span>`).join(' ');
      return `<div class="card ${mios.length ? 'amb' : ''}"><div class="fila"><div><div class="t">📄 ${esc(p.nombre)}</div>
        ${mios.length ? mios.map(e => `<span class="tag amb">pendiente: corte ${fmtFecha(e.corte)} · desde ${fmtFecha(e.rev)}</span>`).join(' ') : '<span class="tag ok">al corriente</span>'}
        <small>corte día ${p.corte}${prox ? ' · próxima revisión ' + fmtFecha(prox) : ''}</small>${hist ? '<br>' + hist : ''}</div>
        <div class="acciones">${mios.map(e => `<button data-act="estado-ok" data-id="${p.id}" data-mk="${e.mk}">Revisado ${MESES[+e.mk.slice(5) - 1]}</button>`).join('')}</div></div></div>`;
    }).join('');
  }
  return vistaPagosBase(hoy) + est;
}

// ---------- pestaña Dinero (capital total, jarras, cuentas) ----------
const esLargo = j => /largo plazo/i.test(j.nombre);
function vistaRend(hoy) {
  if (cargado.jarras && !S.jarras.length && cargado.rend) {
    return `<div class="vacio">Aún no hay jarras.<br><br><button id="btn-dinero">Cargar mis cifras (10 nov 2026)</button><br><small>Cuentas, jarras, metas, tarjeta Mercado Pago y días de corte. Provisional: luego lo ajustas.</small></div>` + cuentasHtml(hoy);
  }
  const cuentas = S.rend.filter(r => r.saldo != null);
  const total = cuentas.reduce((s, r) => s + (Number(r.saldo) || 0), 0);
  const estim = cuentas.reduce((s, r) => s + (r.tasa ? Math.min(Number(r.saldo) || 0, Number(r.tope) || Infinity) * r.tasa / 100 / 12 : 0), 0);
  const jars = S.jarras.slice().sort((a, b) => (a.orden ?? 99) - (b.orden ?? 99));
  const asignado = jars.reduce((s, j) => s + (Number(j.monto) || 0), 0), libre = Math.round((total - asignado) * 100) / 100;
  const pct = m => total > 0 ? Math.round((m / total) * 100) : 0;
  const metas = S.metas.slice().sort((a, b) => (a.orden ?? 99) - (b.orden ?? 99));
  const metasHtml = j => {
    if (!esLargo(j) || !metas.length) return '';
    const m0 = Number(j.monto) || 0, suma = metas.reduce((s, m) => s + (Number(m.objetivo) || 0), 0);
    return metas.map(m => { const p = Math.round(m0 / (m.objetivo || 1) * 100);
      return `<div style="margin-top:8px"><small><b>${esc(m.nombre)}</b> · ${MXN(m.objetivo)} · ${p >= 100 ? '✅ cubierta (sobran ' + MXN(m0 - m.objetivo) + ')' : p + '% · faltan ' + MXN(m.objetivo - m0)}</small>
        <div class="prog"><div style="width:${Math.max(0, Math.min(100, p))}%"></div></div>
        <button class="sec chico" data-act="meta-editar" data-id="${m.id}">✎ ${esc(m.nombre)}</button></div>`; }).join('')
      + (metas.length > 1 ? `<div style="margin-top:8px"><small>Todas juntas (${MXN(suma)}): ${Math.round(m0 / suma * 100)}%</small></div>` : '');
  };
  const jarHtml = j => `<div class="card ${j.aparte ? 'gris' : ''}"><div class="fila"><div>
      <div class="t">${j.aparte ? '💳' : '🫙'} ${esc(j.nombre)}</div>
      <span class="tag">${MXN(j.monto || 0)}</span> <small>${pct(j.monto || 0)}% del total${j.aparte ? ' · aparte de las jarras' : ''}</small>
      ${j.nota ? `<div class="nota">${esc(j.nota)}</div>` : ''}${metasHtml(j)}</div>
      <div class="acciones"><button data-act="jar-mas" data-id="${j.id}">＋</button><button class="sec" data-act="jar-menos" data-id="${j.id}">−</button><button class="sec chico" data-act="jar-editar" data-id="${j.id}">✎</button></div></div></div>`;
  return `<div class="cal" style="text-align:center"><small class="mute">Capital total</small>
      <div style="font-size:2rem;font-weight:800">${MXN(total)}</div>
      <small>Rendimiento estimado: <b>${MXN(Math.round(estim))}</b> al mes · ${MXN(Math.round(estim * 12))} al año <span class="mute">(si cumples las condiciones)</span></small></div>
    <div class="barra"><button data-act="cuentas-saldos">Actualizar saldos</button><button class="sec" data-act="jar-mover">Mover entre jarras</button><button class="sec" data-act="jar-nueva">＋ Jarra</button><button class="sec" data-act="meta-nueva">＋ Meta</button></div>
    <h2>Jarras</h2>${jars.map(jarHtml).join('')}
    <div class="card ${Math.abs(libre) < 1 ? 'ok' : 'rojo'}"><div class="t">Sin asignar: ${MXN(libre)}</div>
      <small>${Math.abs(libre) < 1 ? 'Todo tu dinero está en una jarra ✔' : libre > 0 ? 'Te sobra dinero sin jarra: repártelo.' : 'Las jarras suman más que tus cuentas: revisa saldos o montos.'}</small></div>
    <h2>Cuentas</h2><div class="barra"><button class="sec" data-act="rend-nuevo">＋ Nueva cuenta</button></div>${cuentasHtml(hoy)}`;
}

function formSaldos() {
  const cs = S.rend.slice().sort((a, b) => (b.saldo || 0) - (a.saldo || 0));
  formulario({
    titulo: 'Actualizar saldos',
    extraHtml: '<p class="mute"><small>Pon lo que tienes hoy en cada cuenta. Si dejas uno vacío no cambia.</small></p>',
    valores: Object.fromEntries(cs.map(r => ['c_' + r.id, r.saldo ?? ''])),
    campos: cs.map(r => ({ k: 'c_' + r.id, label: r.nombre, type: 'number' })),
    onSave: async d => {
      const b = writeBatch(db);
      for (const r of cs) { const v = d['c_' + r.id]; if (v != null && v !== r.saldo) b.update(ref('rend', r.id), { saldo: v }); }
      await b.commit(); cerrar(); toast('Saldos actualizados');
    },
  });
}
function formMonto(j, signo) {
  formulario({
    titulo: (signo > 0 ? 'Apartar en ' : 'Usar de ') + j.nombre,
    valores: {},
    extraHtml: `<p class="mute"><small>Hoy hay ${MXN(j.monto || 0)}. ${signo > 0 ? 'Sube la jarra' : 'Baja la jarra'} (acuérdate de que el dinero salga de alguna cuenta).</small></p>`,
    campos: [{ k: 'monto', label: 'Monto ($)', type: 'number' }],
    onSave: async d => { if (!d.monto) return toast('Pon un monto'); await updateDoc(ref('jarras', j.id), { monto: Math.round(((j.monto || 0) + signo * d.monto) * 100) / 100 }); cerrar(); toast('Listo'); },
  });
}
function formMover() {
  const opts = S.jarras.slice().sort((a, b) => (a.orden ?? 99) - (b.orden ?? 99)).map(j => [j.id, j.nombre]);
  formulario({
    titulo: 'Mover entre jarras', valores: { de: opts[0]?.[0], a: opts[1]?.[0] },
    campos: [{ k: 'de', label: 'De', type: 'select', opts }, { k: 'a', label: 'A', type: 'select', opts }, { k: 'monto', label: 'Monto ($)', type: 'number' }],
    onSave: async d => {
      if (!d.monto || d.de === d.a) return toast('Elige dos jarras distintas y un monto');
      const A = byId('jarras', d.de), B = byId('jarras', d.a), b = writeBatch(db);
      b.update(ref('jarras', A.id), { monto: Math.round(((A.monto || 0) - d.monto) * 100) / 100 });
      b.update(ref('jarras', B.id), { monto: Math.round(((B.monto || 0) + d.monto) * 100) / 100 });
      await b.commit(); cerrar(); toast('Movido');
    },
  });
}
function formJarra(j) {
  const nuevo = !j;
  formulario({
    titulo: nuevo ? 'Nueva jarra' : 'Editar jarra',
    valores: j || { monto: 0, orden: S.jarras.length + 1 },
    campos: [{ k: 'nombre', label: 'Nombre' }, { k: 'monto', label: 'Monto ($)', type: 'number' }, { k: 'nota', label: 'Nota', type: 'textarea' }],
    onSave: async d => { d.monto = d.monto || 0; if (nuevo) await addDoc(ref('jarras'), { ...d, orden: S.jarras.length + 1 }); else await updateDoc(ref('jarras', j.id), d); cerrar(); },
    onDelete: nuevo ? null : () => deleteDoc(ref('jarras', j.id)),
  });
}
function formMeta(m) {
  const nuevo = !m;
  formulario({
    titulo: nuevo ? 'Nueva meta' : 'Editar meta', valores: m || {},
    campos: [{ k: 'nombre', label: 'Nombre (Medellín, Carro…)' }, { k: 'objetivo', label: 'Cuánto cuesta ($)', type: 'number' }],
    onSave: async d => { if (nuevo) await addDoc(ref('metas'), { ...d, orden: S.metas.length + 1 }); else await updateDoc(ref('metas', m.id), d); cerrar(); },
    onDelete: nuevo ? null : () => deleteDoc(ref('metas', m.id)),
  });
}
async function sembrarDinero() {
  const b = writeBatch(db), mk = ymKey(today());
  const saldos = { Revolut: 25000, 'Mercado Pago': 25000, Nu: 25000, Mifel: 13000 };
  for (const r of S.rend) for (const [pref, v] of Object.entries(saldos)) if (r.nombre.startsWith(pref)) b.update(ref('rend', r.id), { saldo: v });
  if (!S.rend.some(r => /santander/i.test(r.nombre))) b.set(doc(ref('rend')), { nombre: 'Santander', tasa: 0, saldo: 18335, ipab: true, tipoCond: 'ninguna', condicion: 'Cuenta para pagar tarjetas. Sin rendimiento.' });
  if (!S.rend.some(r => r.efectivo)) b.set(doc(ref('rend')), { nombre: 'Efectivo', tasa: 0, saldo: 9000, efectivo: true, ipab: false, tipoCond: 'ninguna', condicion: 'Dinero en efectivo. Sin rendimiento.' });
  [['Necesidades', 15000, 'Colchón: 2 meses de gasto ($7,500 al mes).'], ['Educación', 1500], ['Diversión', 1500], ['Dar', 1500], ['Libertad financiera', 0, 'Inversión que no se toca. Vacía por ahora.'], ['Ahorro a largo plazo para gastar', 68835, 'De aquí salen Medellín y el carro.']]
    .forEach(([nombre, monto, nota], i) => b.set(doc(ref('jarras')), { nombre, monto, nota: nota || '', orden: i + 1 }));
  b.set(doc(ref('jarras')), { nombre: 'Tarjetas', monto: 27000, aparte: true, nota: 'Ya comprometido para pagar LikeU y Gold.', orden: 7 });
  b.set(doc(ref('metas')), { nombre: 'Medellín', objetivo: 62200, orden: 1 });
  b.set(doc(ref('metas')), { nombre: 'Carro', objetivo: 120000, orden: 2 });
  const cortes = { LikeU: 4, Gold: 11, Amex: 22 };
  for (const p of S.pagos) for (const [k, c] of Object.entries(cortes)) if (p.nombre.includes(k)) b.update(ref('pagos', p.id), { corte: c });
  if (!S.pagos.some(p => /mercado/i.test(p.nombre))) b.set(doc(ref('pagos')), { nombre: 'Mercado Pago', dia: 17, avisoDias: 5, corte: 7, nota: 'Corte día 7. Si el 17 cae en fin de semana, el límite pasa al siguiente día hábil.', activo: true, pagados: [], estados: [], desde: mk, orden: S.pagos.length + 1 });
  await b.commit(); toast('Cifras cargadas');
}

const nomCup = c => String(c.nombre).startsWith('Amex Platinum: $500') ? 'Amex–Walmart' : c.nombre;
function vistaCup(hoy) {
  const items = S.cup.slice().sort((a, b) => (!!a.usado - !!b.usado) || String(a.vence || '9999').localeCompare(String(b.vence || '9999')));
  const filas = items.map(c => {
    const e = estadoCup(c, hoy);
    const tag = c.usado ? '<span class="tag">usado</span>' : e.vencido ? '<span class="tag rojo">vencido</span>'
      : e.pronto ? `<span class="tag amb">${e.dd === 0 ? 'vence HOY' : 'en ' + e.dd + ' d'}</span>` : c.vence ? `<span class="tag">vence ${fmtFecha(parse(c.vence))}</span>` : '';
    const falta = c.meta ? Math.max(0, c.meta - (c.gastado || 0)) : 0;
    const det = [c.donde, c.vence && c.meta ? 'Vence ' + fmtFecha(parse(c.vence)) : '', c.meta && c.maxVeces ? 'Bonificaciones: ' + (c.veces || 0) + '/' + c.maxVeces + (c.bonificacion ? ' de ' + MXN(c.bonificacion) : '') : '', c.nota].filter(Boolean).join('\n');
    return `<div class="card ${c.usado || e.vencido ? 'gris' : e.pronto ? 'amb' : ''}"><div class="fila"><div>
      <div class="t">🎟 ${esc(nomCup(c))}</div>${tag}${c.meta ? '' : `<small>${esc(c.donde || '')}</small>`}
      ${c.codigo ? `<div class="t" style="font-family:monospace;margin-top:4px">${esc(c.codigo)}</div>` : ''}
      ${c.meta ? `<div class="prog"><div style="width:${Math.max(0, Math.min(100, Math.round(((c.gastado || 0) / c.meta) * 100)))}%"></div></div>
        <small>Llevas ${MXN(c.gastado || 0)} · faltan ${MXN(falta)}</small>
        ${c.porActivar && !c.usado ? '<br><span class="tag amb">Actívala antes de gastar</span>' : ''}` : ''}
      ${c.meta ? (det ? `<details class="det"><summary>Detalles</summary><div class="nota">${esc(det)}</div></details>` : '') : (c.nota ? `<div class="nota">${esc(c.nota)}</div>` : '')}</div>
      <div class="acciones">${c.usado ? '' : c.meta ? (c.porActivar ? `<button data-act="cup-activado" data-id="${c.id}">Ya la activé</button>` : `<button data-act="cup-gasto" data-id="${c.id}">＋ Gasto</button>`) : ''}${c.usado ? '' : `<button class="${c.meta ? 'sec chico' : ''}" data-act="cup-usado" data-id="${c.id}">${c.meta ? 'Terminada' : 'Usado'}</button>`}<button class="sec chico" data-act="cup-editar" data-id="${c.id}">✎</button></div></div></div>`;
  }).join('');
  const sinAmex = !S.cup.some(c => String(c.nombre).startsWith('Amex Platinum: $500'));
  return `<div class="barra"><button class="sec" data-act="cup-nuevo">＋ Nuevo cupón</button>${sinAmex ? '<button class="sec" data-act="cup-seed-amex">＋ Promo Amex–Walmart</button>' : ''}</div>` + (filas || '<div class="vacio">Sin cupones.</div>');
}

function vistaCobrar(hoy) {
  const ord = S.cobrar.slice().sort((a, b) => ((a.estatus === 'cobrado') - (b.estatus === 'cobrado')) || (!!b.porDefinir - !!a.porDefinir) || String(a.desde).localeCompare(String(b.desde)));
  const abiertos = ord.filter(x => x.estatus !== 'cobrado');
  const total = abiertos.reduce((s, x) => s + (Number(x.monto) || 0), 0);
  const filas = ord.map(x => {
    const cob = x.estatus === 'cobrado', dias = diffDays(hoy, parse(x.desde || ymd(hoy)));
    return `<div class="card ${cob ? 'gris' : dias >= 7 ? 'amb' : ''}"><div class="fila"><div>
      <div class="t">💵 ${esc(x.concepto)}</div>
      <small>${esc(x.deQuien || '')} ${x.monto ? '· ' + MXN(x.monto) : ''}</small><br>
      ${cob ? '<span class="tag ok">cobrado</span>' : x.porDefinir ? '<span class="tag amb">por definir</span>' : `<span class="tag ${dias >= 7 ? 'amb' : ''}">${dias} d abierto</span>`}
      ${(x.archivos || []).length ? `<span class="tag">📎 ${x.archivos.length}</span>` : ''}
      ${x.nota ? `<div class="nota">${esc(x.nota)}</div>` : ''}</div>
      <div class="acciones">${cob ? '' : `<button data-act="cob-cobrado" data-id="${x.id}">Cobrado</button>`}<button class="sec chico" data-act="cob-editar" data-id="${x.id}">✎</button></div></div></div>`;
  }).join('');
  return `<div class="barra"><button data-act="cob-rapida">🎤 Nota rápida</button><button class="sec" data-act="cob-nuevo">＋ Nuevo</button></div>`
    + (abiertos.length ? `<p class="mute">Abiertos: <b>${abiertos.length}</b> · ${MXN(total)}</p>` : '')
    + (filas || '<div class="vacio">Nada por cobrar. Aquí van reembolsos, cosas que compraste para vender, etc.</div>');
}

// ---------- estados de cuenta: revisar 2 días después del corte (si cae en fin de semana, el viernes anterior) ----------
const ESTADOS_DESDE = '2026-11';   // primer mes de corte que se lleva en la app
const ajustaFinde = d => { const w = d.getDay(); return w === 6 ? new Date(d.getFullYear(), d.getMonth(), d.getDate() - 1) : w === 0 ? new Date(d.getFullYear(), d.getMonth(), d.getDate() - 2) : d; };
const revisionDe = (p, mk) => ajustaFinde(dueOf(mk, (Number(p.corte) || 1) + 2));
function estadosPendientes(pagos, hoy) {
  const out = [];
  for (const p of pagos.filter(p => p.activo !== false && p.corte)) {
    for (const k of [-2, -1, 0]) {
      const mk = addMonths(ymKey(hoy), k);
      if (mk < ESTADOS_DESDE || (p.estados || []).includes(mk)) continue;
      const rev = revisionDe(p, mk), dias = diffDays(hoy, rev);
      if (dias >= 0) out.push({ p, mk, rev, dias, corte: dueOf(mk, p.corte) });
    }
  }
  return out.sort((a, b) => b.dias - a.dias);
}

// ---------- calendario (pestaña Hoy) ----------
let calMes = null, calSel = null;
const MESES_L = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const DIAS_C = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
const PESO = { rojo: 3, amb: 2, base: 1, ok: 0 };
// Depósitos de nómina ISSSTE: fechas REALES que da Mario (YYYY-MM-DD). Agregar aquí las siguientes cuando las pase.
const QUINCENAS = ['2026-11-10', '2026-11-25', '2026-12-10', '2026-12-17'];
function ingresosMes(mk) {
  return QUINCENAS.filter(f => f.slice(0, 7) === mk).map(f => ({ date: parse(f), txt: 'Depósito de nómina ISSSTE' }));
}
function eventosMes(mk, hoy) {
  const ev = {}; // 'YYYY-MM-DD' -> [{ico, txt, n}]
  const add = (date, ico, txt, n) => { const k = ymd(date); (ev[k] = ev[k] || []).push({ ico, txt, n }); };
  const nivelDd = dd => dd <= 3 ? 'rojo' : dd <= 10 ? 'amb' : 'base';
  for (const p of S.pagos.filter(p => p.activo !== false)) {
    if (p.desde && mk < p.desde) continue;
    const due = dueOf(mk, p.dia), pagado = (p.pagados || []).includes(mk), dd = diffDays(due, hoy);
    const monto = p.monto ? ' · ' + MXN(p.monto) : '';
    if (p.diaInicio) {
      const ini = dueOf(mk, p.diaInicio);
      add(ini, '🎓', `${p.nombre}: ya puedes pagar (del ${p.diaInicio} al ${p.dia})${monto}${pagado ? ' — ✅ pagado' : ''}`, pagado ? 'ok' : 'amb');
      add(due, '🎓', `${p.nombre}: ÚLTIMO día para pagar${pagado ? ' — ✅ pagado' : ''}`, pagado ? 'ok' : nivelDd(dd));
    } else {
      add(due, '💳', `${p.nombre}: fecha de pago${monto}${pagado ? ' — ✅ pagado' : dd < 0 ? ' — VENCIDO' : ''}`, pagado ? 'ok' : nivelDd(dd));
    }
  }
  const ultimo = new Date(+mk.slice(0, 4), +mk.slice(5, 7), 0);
  for (const r of S.rend) {
    const tipo = r.tipoCond || 'ninguna'; if (tipo === 'ninguna') continue;
    const vigente = mk === ymKey(hoy), e = estadoRend(r, hoy), hecho = vigente && e.hecho;
    const prog = tipo === 'contador' && vigente ? ` (${e.progreso}/${r.meta || 1})` : '';
    add(dueOf(mk, Number(r.diaInicio) || 1), '🌱', `${r.nombre}: ${r.condicion || 'condición del mes'}${prog}${hecho ? ' — ✅ listo' : ''}`, hecho ? 'ok' : 'amb');
    if (!hecho && mk >= ymKey(hoy)) add(ultimo, '⏳', `${r.nombre}: último día del mes para cumplir`, ultimo < hoy ? 'rojo' : nivelDd(diffDays(ultimo, hoy)));
  }
  for (const c of S.cup) {
    if (c.usado || !c.vence || c.vence.slice(0, 7) !== mk) continue;
    add(parse(c.vence), '🎟', `Vence: ${nomCup(c)}`, nivelDd(diffDays(parse(c.vence), hoy)));
  }
  for (const x of S.cobrar) {
    if (x.estatus === 'cobrado' || !x.fechaEsperada || x.fechaEsperada.slice(0, 7) !== mk) continue;
    const dd = diffDays(parse(x.fechaEsperada), hoy);
    add(parse(x.fechaEsperada), '💵', `Cobro esperado: ${x.concepto}${x.monto ? ' · ' + MXN(x.monto) : ''}${dd < 0 ? ' — ya pasó la fecha' : ''}`, dd < 0 ? 'rojo' : 'amb');
  }
  for (const p of S.pagos.filter(p => p.activo !== false && p.corte)) {
    if (mk < ESTADOS_DESDE) continue;
    const rev = revisionDe(p, mk), ok = (p.estados || []).includes(mk);
    add(rev, '📄', `${p.nombre}: revisar estado de cuenta (corte día ${p.corte})${ok ? ' — ✅ revisado' : ''}`, ok ? 'ok' : rev < hoy ? 'amb' : nivelDd(diffDays(rev, hoy)));
  }
  for (const i of ingresosMes(mk)) add(i.date, '💰', i.txt, 'ok');
  return ev;
}
function vistaCal(hoy) {
  const mk = calMes || ymKey(hoy), [y, m] = mk.split('-').map(Number), hk = ymd(hoy);
  const ev = eventosMes(mk, hoy), nd = new Date(y, m, 0).getDate(), off = (new Date(y, m - 1, 1).getDay() + 6) % 7;
  const sel = calSel && calSel.slice(0, 7) === mk ? calSel : (mk === ymKey(hoy) ? hk : mk + '-01');
  let celdas = '<div class="cal-w">lun</div><div class="cal-w">mar</div><div class="cal-w">mié</div><div class="cal-w">jue</div><div class="cal-w">vie</div><div class="cal-w">sáb</div><div class="cal-w">dom</div>' + '<div class="dia dvac"></div>'.repeat(off);
  for (let d = 1; d <= nd; d++) {
    const k = `${mk}-${pad(d)}`, es = ev[k] || [];
    const peor = es.reduce((a, e) => PESO[e.n] > PESO[a] ? e.n : a, 'ok');
    const cls = es.length ? (peor === 'base' ? '' : peor) : '';
    const ems = [...new Set(es.map(e => e.ico))].slice(0, 3).join('');
    celdas += `<div class="dia ${cls} ${k === hk ? 'hoy' : ''} ${k === sel ? 'sel' : ''} ${k < hk ? 'pasado' : ''}" data-act="cal-dia" data-d="${k}"><b>${d}</b><span class="ems">${ems}</span></div>`;
  }
  const fs = parse(sel), lista = ev[sel] || [];
  const detalle = `<div class="t" style="margin:10px 0 2px">${DIAS_C[fs.getDay()]} ${fs.getDate()} de ${MESES_L[fs.getMonth()]}${sel === hk ? ' · <span class="tag amb">HOY</span>' : ''}</div>`
    + (lista.length ? lista.map(e => `<div class="cal-ev ${e.n}">${e.ico} ${esc(e.txt)}</div>`).join('') : '<small class="mute">Nada ese día.</small>');
  return `<div class="cal"><div class="cal-h"><button class="sec chico" data-act="cal-prev">◀</button>
    <div><span class="t" style="text-transform:capitalize">${MESES_L[m - 1]} ${y}</span> ${mk !== ymKey(hoy) ? '<button class="sec chico" data-act="cal-hoy">Hoy</button>' : ''}</div>
    <button class="sec chico" data-act="cal-next">▶</button></div>
    <div class="cal-g">${celdas}</div>${detalle}
    <div class="leyenda">💰 depósito de nómina · 📄 estado de cuenta · 💳 pago tarjeta · 🎓 colegiatura · 🌱 empezar rendimientos · ⏳ cierre del mes · 🎟 cupón · 💵 cobro esperado<br>Rojo: vence en 3 días o menos · Ámbar: próximos 10 días · Verde: listo / te depositan</div></div>`;
}

// ---------- modal / formularios ----------
function cerrar() { $('#modal').hidden = true; $('#hoja').innerHTML = ''; }
$('#modal').addEventListener('click', e => { if (e.target.id === 'modal') cerrar(); });

function formulario({ titulo, campos, valores = {}, extraHtml = '', onSave, onDelete, onExtra }) {
  const h = $('#hoja');
  h.innerHTML = `<h3>${esc(titulo)}</h3>` + campos.map(c => {
    const v = valores[c.k] ?? '';
    const id = 'f_' + c.k;
    let campo;
    if (c.type === 'textarea') campo = `<textarea id="${id}" placeholder="${esc(c.ph || '')}">${esc(v)}</textarea>`;
    else if (c.type === 'select') campo = `<select id="${id}">${c.opts.map(([val, lab]) => `<option value="${val}" ${String(v) === String(val) ? 'selected' : ''}>${lab}</option>`).join('')}</select>`;
    else campo = `<input id="${id}" type="${c.type || 'text'}" ${c.type === 'number' ? 'step="any" inputmode="decimal"' : ''} value="${esc(v)}" placeholder="${esc(c.ph || '')}">`;
    return `<label for="${id}">${esc(c.label)}</label>${campo}`;
  }).join('') + `<div id="extra">${extraHtml}</div>
    <div class="botones"><button class="sec" id="f-cancel">Cerrar</button><button id="f-ok">Guardar</button></div>
    ${onDelete ? '<div class="botones"><button class="peligro" id="f-del">Eliminar</button></div>' : ''}`;
  $('#modal').hidden = false;
  $('#f-cancel').onclick = cerrar;
  $('#f-ok').onclick = async () => {
    const d = {};
    for (const c of campos) {
      const raw = $('#f_' + c.k).value.trim();
      d[c.k] = c.type === 'number' ? (raw === '' ? null : Number(raw)) : raw;
    }
    if (!d[campos[0].k]) { toast('Falta ' + campos[0].label.toLowerCase()); return; }
    try { await onSave(d); } catch (e) { console.error(e); toast('No se pudo guardar: ' + (e.code || e.message)); }
  };
  if (onDelete) $('#f-del').onclick = async () => { if (confirm('¿Eliminar definitivamente?')) { await onDelete(); cerrar(); } };
  if (onExtra) onExtra();
}

const byId = (k, id) => S[k].find(x => x.id === id);

function formPago(p) {
  const nuevo = !p;
  formulario({
    titulo: nuevo ? 'Nuevo pago' : 'Editar pago',
    valores: p || { avisoDias: 3 },
    campos: [
      { k: 'nombre', label: 'Nombre', ph: 'Tarjeta, seguro, colegiatura…' },
      { k: 'dia', label: 'Día del mes en que vence', type: 'number' },
      { k: 'diaInicio', label: 'Avisar desde el día… (solo si es una ventana, ej. colegiatura 1)', type: 'number' },
      { k: 'avisoDias', label: 'Días de anticipación (si no hay ventana)', type: 'number' },
      { k: 'monto', label: 'Monto aproximado (opcional)', type: 'number' },
      { k: 'corte', label: 'Día de corte (tarjetas: te recuerda revisar el estado de cuenta 2 días después)', type: 'number' },
      { k: 'nota', label: 'Nota', type: 'textarea' },
    ],
    onSave: async d => {
      if (!d.dia || d.dia < 1 || d.dia > 31) { toast('Pon un día entre 1 y 31'); return; }
      if (nuevo) await addDoc(ref('pagos'), { ...d, activo: true, pagados: [], desde: ymKey(today()), orden: S.pagos.length + 1 });
      else await updateDoc(ref('pagos', p.id), d);
      cerrar();
    },
    onDelete: nuevo ? null : () => deleteDoc(ref('pagos', p.id)),
  });
}

function formRend(r) {
  const nuevo = !r;
  formulario({
    titulo: nuevo ? 'Nueva cuenta' : 'Editar cuenta',
    valores: r ? { ...r, ipab: r.ipab ? 'si' : 'no' } : { ipab: 'si', tipoCond: 'check', diaAviso: 20 },
    campos: [
      { k: 'nombre', label: 'Nombre', ph: 'Revolut, Nu, Mifel…' },
      { k: 'tasa', label: 'Tasa anual %', type: 'number' },
      { k: 'tope', label: 'Tope con tasa alta ($)', type: 'number' },
      { k: 'saldo', label: 'Lo que tienes ahí ($)', type: 'number' },
      { k: 'ipab', label: '¿Tiene IPAB?', type: 'select', opts: [['si', 'Sí'], ['no', 'No']] },
      { k: 'tipoCond', label: 'Condición mensual', type: 'select', opts: [['check', 'Una cosa que hacer (casilla)'], ['contador', 'Varias veces (contador)'], ['ninguna', 'Sin condición']] },
      { k: 'meta', label: 'Si es contador: cuántas veces', type: 'number' },
      { k: 'condicion', label: 'Qué hay que hacer (texto)', type: 'textarea' },
      { k: 'diaInicio', label: 'Día del mes para empezar/hacerlo (sale en el calendario; vacío = día 1)', type: 'number' },
      { k: 'diaAviso', label: 'Avisar por correo desde el día del mes…', type: 'number' },
    ],
    onSave: async d => {
      d.ipab = d.ipab === 'si';
      if (nuevo) await addDoc(ref('rend'), d); else await updateDoc(ref('rend', r.id), d);
      cerrar();
    },
    onDelete: nuevo ? null : () => deleteDoc(ref('rend', r.id)),
  });
}

function formCup(c) {
  const nuevo = !c;
  formulario({
    titulo: nuevo ? 'Nuevo cupón' : 'Editar cupón',
    valores: c || {},
    campos: [
      { k: 'nombre', label: 'Qué es', ph: 'Vuelo 20% Volaris, cupón Walmart…' },
      { k: 'codigo', label: 'Código', ph: 'ABC123' },
      { k: 'donde', label: 'Dónde se usa' },
      { k: 'vence', label: 'Vence', type: 'date' },
      { k: 'meta', label: 'Promo de gasto: meta por bonificación ($, opcional)', type: 'number' },
      { k: 'bonificacion', label: 'Monto de cada bonificación ($, opcional)', type: 'number' },
      { k: 'maxVeces', label: 'Máximo de bonificaciones (opcional)', type: 'number' },
      { k: 'gastado', label: 'Llevas gastado ($, opcional)', type: 'number' },
      { k: 'veces', label: 'Bonificaciones ya logradas (opcional)', type: 'number' },
      { k: 'nota', label: 'Nota', type: 'textarea' },
    ],
    onSave: async d => {
      d.gastado = d.gastado || 0; d.veces = d.veces || 0;
      if (nuevo) await addDoc(ref('cup'), { ...d, usado: false, porActivar: !!d.meta }); else await updateDoc(ref('cup', c.id), d);
      cerrar();
    },
    onDelete: nuevo ? null : () => deleteDoc(ref('cup', c.id)),
  });
}

function formRapida() {
  formulario({
    titulo: 'Nota rápida',
    valores: {},
    extraHtml: '<p class="mute"><small>Dicta o escribe lo que sea (usa el micrófono del teclado). Los datos los completas después.</small></p>',
    campos: [{ k: 'concepto', label: 'Qué quedó pendiente', type: 'textarea', ph: 'Vender la tableta, reembolso de la licuadora…' }],
    onSave: async d => {
      if (!String(d.concepto || '').trim()) return toast('Escribe algo');
      await addDoc(ref('cobrar'), { concepto: String(d.concepto).trim(), estatus: 'pendiente', porDefinir: true, desde: ymd(today()), archivos: [] });
      cerrar(); toast('Guardada: queda como "por definir"');
    },
  });
  setTimeout(() => { const el = $('#f_concepto'); if (el) el.focus(); }, 100);
}
function formCobrar(x, aviso) {
  const nuevo = !x;
  const listaArchivos = a => (a || []).map((f, i) => `<div class="archivo"><a href="${esc(f.link)}" target="_blank" rel="noopener">📎 ${esc(f.nombre)}</a>
      <button class="sec chico" data-quitar="${i}">✕</button></div>`).join('') || '<small>Sin archivos.</small>';
  const driveListo = () => driveToken && Date.now() < driveExp;
  const extra = nuevo ? '<p class="mute"><small>Guarda primero y luego podrás subir recibos, capturas o PDFs.</small></p>'
    : `<label>Archivos (se guardan en tu Google Drive)</label><div id="lista-arch">${listaArchivos(x.archivos)}</div>
       <div class="botones"><button class="sec" id="btn-drive">${driveListo() ? '＋ Subir archivo' : 'Conectar Drive'}</button></div>
       <input type="file" id="file-in" multiple accept="image/*,application/pdf" hidden><small id="arch-msg" class="mute"></small>`;
  formulario({
    titulo: nuevo ? 'Nuevo por cobrar' : 'Por cobrar',
    valores: x || { desde: ymd(today()) },
    extraHtml: (aviso ? `<p class="tag ok">${esc(aviso)}</p>` : '') + extra,
    campos: [
      { k: 'concepto', label: 'Qué es', ph: 'Reembolso Amazon, bocina para vender…' },
      { k: 'monto', label: 'Monto ($)', type: 'number' },
      { k: 'deQuien', label: 'De quién / dónde lo esperas' },
      { k: 'desde', label: 'Desde cuándo', type: 'date' },
      { k: 'fechaEsperada', label: 'Fecha esperada del reembolso/pago (opcional, sale en el calendario)', type: 'date' },
      { k: 'nota', label: 'Notas: # de caso, teléfono, a dónde marcar, qué decir…', type: 'textarea' },
    ],
    onSave: async d => {
      if (nuevo) {
        const r = await addDoc(ref('cobrar'), { ...d, estatus: 'pendiente', archivos: [] });
        formCobrar({ id: r.id, ...d, estatus: 'pendiente', archivos: [] }, 'Guardado ✔ Ahora puedes subir recibos o capturas.');
      } else { await updateDoc(ref('cobrar', x.id), { ...d, porDefinir: false }); cerrar(); }
    },
    onDelete: nuevo ? null : () => deleteDoc(ref('cobrar', x.id)),
    onExtra: nuevo ? null : () => {
      const msg = t => { $('#arch-msg').textContent = t; };
      $('#btn-drive').onclick = async () => {
        if (!driveListo()) {
          try { await tokenDrive(); $('#btn-drive').textContent = '＋ Subir archivo'; msg('Drive conectado.'); }
          catch (e) { msg('No se pudo conectar Drive: ' + (e.code || e.message)); }
          return;
        }
        $('#file-in').click();
      };
      $('#file-in').onchange = async ev => {
        const files = [...ev.target.files]; if (!files.length) return;
        for (const f of files) {
          try {
            msg('Subiendo ' + f.name + '…');
            const r = await subirDrive(f);
            const meta = { nombre: r.name, fileId: r.id, link: r.webViewLink, mime: r.mimeType };
            await updateDoc(ref('cobrar', x.id), { archivos: arrayUnion(meta) });
            x.archivos = [...(x.archivos || []), meta];
            $('#lista-arch').innerHTML = listaArchivos(x.archivos);
            msg('Listo ✔');
          } catch (e) { console.error(e); msg('Error al subir: ' + (e.message || e)); }
        }
        ev.target.value = '';
      };
      $('#lista-arch').onclick = async ev => {
        const i = ev.target.dataset.quitar; if (i == null) return;
        const f = x.archivos[Number(i)];
        if (!confirm('¿Quitar este archivo de la lista? (En Drive se queda)')) return;
        await updateDoc(ref('cobrar', x.id), { archivos: arrayRemove(f) });
        x.archivos = x.archivos.filter((_, j) => j !== Number(i));
        $('#lista-arch').innerHTML = listaArchivos(x.archivos);
      };
    },
  });
}

// ---------- Google Drive (archivos de "Por cobrar") ----------
// Scope drive.file: la app solo ve los archivos que ella misma sube. Gratis, sin Blaze.
let driveToken = null, driveExp = 0, carpetaId = null;
async function tokenDrive() {
  const p = new GoogleAuthProvider();
  p.addScope('https://www.googleapis.com/auth/drive.file');
  p.setCustomParameters({ login_hint: auth.currentUser.email });
  const r = await signInWithPopup(auth, p);
  const cred = GoogleAuthProvider.credentialFromResult(r);
  if (!cred?.accessToken) throw new Error('Google no devolvió permiso de Drive');
  driveToken = cred.accessToken; driveExp = Date.now() + 50 * 60 * 1000;
  return driveToken;
}
async function driveFetch(url, opts = {}) {
  const r = await fetch(url, { ...opts, headers: { ...(opts.headers || {}), Authorization: 'Bearer ' + driveToken } });
  if (r.status === 401) { driveToken = null; throw new Error('Se venció la conexión con Drive. Toca "Conectar Drive" otra vez.'); }
  if (!r.ok) { const t = await r.text(); throw new Error('Drive ' + r.status + ': ' + t.slice(0, 160)); }
  return r.json();
}
async function carpetaDrive() {
  if (carpetaId) return carpetaId;
  const nombre = 'Finanzas - Por cobrar';
  const q = encodeURIComponent(`name='${nombre}' and mimeType='application/vnd.google-apps.folder' and trashed=false`);
  const r = await driveFetch(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id)`);
  if (r.files?.length) return (carpetaId = r.files[0].id);
  const c = await driveFetch('https://www.googleapis.com/drive/v3/files?fields=id', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: nombre, mimeType: 'application/vnd.google-apps.folder' }),
  });
  return (carpetaId = c.id);
}
async function subirDrive(file) {
  const parent = await carpetaDrive();
  const fd = new FormData();
  fd.append('metadata', new Blob([JSON.stringify({ name: file.name, parents: [parent] })], { type: 'application/json' }));
  fd.append('file', file);
  return driveFetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink,mimeType', { method: 'POST', body: fd });
}

// ---------- promos con meta de gasto ----------
const PROMO_AMEX = {
  nombre: 'Amex Platinum: $500 por cada $3,500 en walmart.com.mx',
  donde: 'walmart.com.mx (no tienda física)',
  vence: '2027-04-07', meta: 3500, bonificacion: 500, maxVeces: 3, veces: 0, gastado: 0, porActivar: true, usado: false,
  nota: 'Antes de gastar: inscríbete en la Amex App o Servicios en Línea ("Redimir ahora"). Paga con la Platinum titular (adicionales no cuentan). No cuenta: tarjetas de regalo, apps o agregadores de pago, Walmart Pass, servicios. La bonificación llega al estado de cuenta en ~5 días hábiles (hasta 90 días tras terminar). Si devuelves la compra, se revierte. Vigencia: 8 oct 2026 al 7 abr 2027.',
};
function formGasto(c) {
  formulario({
    titulo: 'Sumar gasto',
    valores: {},
    extraHtml: `<p class="mute"><small>${esc(c.nombre)}<br>Llevas ${MXN(c.gastado || 0)} de ${MXN(c.meta)}. Para restar una devolución usa un monto negativo.</small></p>`,
    campos: [{ k: 'monto', label: 'Monto del gasto ($)', type: 'number' }],
    onSave: async d => {
      let g = Math.max(0, (c.gastado || 0) + d.monto), veces = c.veces || 0, porActivar = !!c.porActivar, usado = !!c.usado, msg = 'Gasto sumado';
      if (g >= c.meta) {
        veces += 1; g = 0;
        if (c.maxVeces && veces >= c.maxVeces) { usado = true; porActivar = false; msg = '¡Meta lograda! Era la última bonificación'; }
        else { porActivar = true; msg = '¡Meta lograda! Reactiva la promo en la app de Amex'; }
      }
      await updateDoc(ref('cup', c.id), { gastado: g, veces, porActivar, usado });
      toast(msg); cerrar();
    },
  });
}

// ---------- datos iniciales ----------
async function sembrar() {
  const b = writeBatch(db), mk = ymKey(today());
  const pagos = [
    { nombre: 'Santander LikeU', dia: 23, avisoDias: 5, nota: 'Prioridad #1: pagar bastante más que el mínimo.', orden: 1, desde: mk },
    { nombre: 'Santander Gold', dia: 29, avisoDias: 5, nota: 'Prioridad #2.', orden: 2, desde: mk },
    { nombre: 'Amex Platinum', dia: 11, avisoDias: 5, nota: 'Se paga completa cada ciclo.', orden: 3, desde: mk },
    { nombre: 'Colegiatura (hijo)', dia: 5, diaInicio: 1, monto: 4192.20, nota: 'Tienes del 1 al 5 de cada mes. Avisa diario hasta que la marques como pagada.', orden: 4, desde: addMonths(mk, 1) },
  ];
  pagos.forEach(p => b.set(doc(ref('pagos')), { ...p, activo: true, pagados: [] }));
  const rend = [
    { nombre: 'Revolut', tasa: 15, tope: 25000, saldo: 25000, ipab: true, tipoCond: 'contador', meta: 4, condicion: '4 compras de $50 o más con la tarjeta Revolut cada 30 días.', diaAviso: 20 },
    { nombre: 'Mercado Pago (Apartado)', tasa: 15, tope: 25000, saldo: 25000, ipab: false, tipoCond: 'check', condicion: 'Depositar $3,000 en el mes para mantener el rendimiento.', diaAviso: 20 },
    { nombre: 'Nu (Cajita Turbo)', tasa: 13, tope: 25000, saldo: 25000, ipab: true, tipoCond: 'check', condicion: '1 compra al mes con la tarjeta Nu.', diaAviso: 20 },
    { nombre: 'Mifel', tasa: 10, tope: 500000, saldo: 13000, ipab: true, tipoCond: 'ninguna', condicion: 'Sin condición. Aquí cae todo lo que siga entrando.' },
  ];
  rend.forEach(r => b.set(doc(ref('rend')), r));
  await b.commit();
  toast('Datos iniciales cargados');
}

// ---------- acciones ----------
document.addEventListener('click', async e => {
  if (e.target.id === 'btn-seed') { e.target.disabled = true; await sembrar(); return; }
  if (e.target.id === 'btn-dinero') { e.target.disabled = true; await sembrarDinero(); return; }
  const el = e.target.closest('[data-act]'); if (!el) return;
  const { act, id, mk, d } = el.dataset, hoy = today();
  try {
    if (act === 'cal-prev' || act === 'cal-next') { calMes = addMonths(calMes || ymKey(hoy), act === 'cal-next' ? 1 : -1); calSel = null; return render(); }
    if (act === 'cal-hoy') { calMes = null; calSel = null; return render(); }
    if (act === 'cal-dia') { calSel = d; return render(); }
    if (act === 'pago-nuevo') return formPago();
    if (act === 'pago-editar') return formPago(byId('pagos', id));
    if (act === 'pago-pagar') { await updateDoc(ref('pagos', id), { pagados: arrayUnion(mk) }); return toast('Marcado como pagado'); }
    if (act === 'pago-deshacer') { await updateDoc(ref('pagos', id), { pagados: arrayRemove(mk) }); return toast('Deshecho'); }
    if (act === 'rend-nuevo') return formRend();
    if (act === 'rend-editar') return formRend(byId('rend', id));
    if (act === 'rend-toggle' || act === 'rend-mas' || act === 'rend-menos') {
      const r = byId('rend', id), s = estadoRend(r, hoy);
      let progreso = s.progreso, cumplido = s.cumplido;
      if (act === 'rend-toggle') cumplido = !cumplido;
      if (act === 'rend-mas') progreso = progreso + 1;
      if (act === 'rend-menos') progreso = Math.max(0, progreso - 1);
      return await setDoc(ref('rend', id), { mes: s.mesAct, progreso, cumplido }, { merge: true });
    }
    if (act === 'cup-nuevo') return formCup();
    if (act === 'cup-editar') return formCup(byId('cup', id));
    if (act === 'cup-activado') { await updateDoc(ref('cup', id), { porActivar: false }); return toast('Promo activada: ya cuentan tus gastos'); }
    if (act === 'cup-gasto') return formGasto(byId('cup', id));
    if (act === 'cup-seed-amex') { await addDoc(ref('cup'), PROMO_AMEX); return toast('Promo agregada: actívala en la app de Amex'); }
    if (act === 'cup-usado') { await updateDoc(ref('cup', id), { usado: true }); return toast('Cupón marcado como usado'); }
    if (act === 'cob-nuevo') return formCobrar();
    if (act === 'cob-rapida') return formRapida();
    if (act === 'jar-mas') return formMonto(byId('jarras', id), 1);
    if (act === 'jar-menos') return formMonto(byId('jarras', id), -1);
    if (act === 'jar-editar') return formJarra(byId('jarras', id));
    if (act === 'jar-nueva') return formJarra();
    if (act === 'jar-mover') return formMover();
    if (act === 'meta-nueva') return formMeta();
    if (act === 'meta-editar') return formMeta(byId('metas', id));
    if (act === 'cuentas-saldos') return formSaldos();
    if (act === 'estado-ok') { await updateDoc(ref('pagos', id), { estados: arrayUnion(mk) }); return toast('Estado de cuenta revisado ✔'); }
    if (act === 'cob-editar') return formCobrar(byId('cobrar', id));
    if (act === 'cob-cobrado') { await updateDoc(ref('cobrar', id), { estatus: 'cobrado', cobradoFecha: ymd(hoy) }); return toast('¡Cobrado!'); }
  } catch (err) { console.error(err); toast('Error: ' + (err.code || err.message)); }
});

if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
