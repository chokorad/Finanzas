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
  return { dd, pronto: dd >= 0 && dd <= 7, vencido: dd < 0 };
}

// ---------- estado ----------
const S = { pagos: [], rend: [], cup: [], cobrar: [] };
const cargado = { pagos: false, rend: false };
let uid = null, unsubs = [];
const COL = { pagos: 'finanzas_pagos', rend: 'finanzas_rend', cup: 'finanzas_cupones', cobrar: 'finanzas_cobrar' };
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
  for (const c of S.cup) { const e = estadoCup(c, hoy); if (e.pronto) out.push({ nivel: e.dd <= 1 ? 0 : 1, orden: e.dd, tipo: 'cup', c, e }); }
  for (const x of S.cobrar.filter(x => x.estatus !== 'cobrado')) {
    const dias = diffDays(hoy, parse(x.desde || ymd(hoy)));
    if (dias >= 7) out.push({ nivel: 1, orden: 80, tipo: 'cobrar', x, dias });
  }
  return out.sort((a, b) => a.nivel - b.nivel || a.orden - b.orden);
}

function vistaHoy(lista, hoy) {
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
    if (u.tipo === 'cup') return `<div class="card ${claseNivel(u.nivel)}"><div class="fila"><div><div class="t">🎟 ${esc(u.c.nombre)}</div>
      <span class="tag ${u.nivel === 0 ? 'rojo' : 'amb'}">${u.e.dd === 0 ? 'vence HOY' : 'vence en ' + u.e.dd + ' d'}</span> <small>${esc(u.c.codigo || '')}</small></div>
      <div class="acciones"><button data-act="cup-usado" data-id="${u.c.id}">Usado</button></div></div></div>`;
    return `<div class="card amb"><div class="fila"><div><div class="t">💵 ${esc(u.x.concepto)}</div>
      <small>${esc(u.x.deQuien || '')} ${u.x.monto ? '· ' + MXN(u.x.monto) : ''}</small><br><span class="tag amb">${u.dias} días abierto</span></div>
      <div class="acciones"><button class="sec" data-act="cob-editar" data-id="${u.x.id}">Abrir</button><button data-act="cob-cobrado" data-id="${u.x.id}">Cobrado</button></div></div></div>`;
  }).join('');
}

function vistaPagos(hoy) {
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

function vistaRend(hoy) {
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
      ${estado}<span class="tag ${r.ipab ? 'ok' : 'rojo'}">${r.ipab ? 'IPAB' : 'sin IPAB'}</span>
      <small>${r.tope ? 'tope ' + MXN(r.tope) : ''} ${r.saldo ? '· tienes ' + MXN(r.saldo) : ''}</small>
      <div class="nota">${esc(r.condicion || '')}</div></div>
      <div class="acciones">${accion}<button class="sec chico" data-act="rend-editar" data-id="${r.id}">✎</button></div></div></div>`;
  }).join('');
  return `<div class="barra"><button class="sec" data-act="rend-nuevo">＋ Nueva cuenta</button></div>` + (filas || '<div class="vacio">Sin cuentas.</div>')
    + `<p class="mute"><small>El avance se reinicia solo cada mes y te avisan por correo desde el día indicado en cada cuenta.</small></p>`;
}

function vistaCup(hoy) {
  const items = S.cup.slice().sort((a, b) => (!!a.usado - !!b.usado) || String(a.vence || '9999').localeCompare(String(b.vence || '9999')));
  const filas = items.map(c => {
    const e = estadoCup(c, hoy);
    const tag = c.usado ? '<span class="tag">usado</span>' : e.vencido ? '<span class="tag rojo">vencido</span>'
      : e.pronto ? `<span class="tag amb">${e.dd === 0 ? 'vence HOY' : 'en ' + e.dd + ' d'}</span>` : c.vence ? `<span class="tag">vence ${fmtFecha(parse(c.vence))}</span>` : '';
    return `<div class="card ${c.usado || e.vencido ? 'gris' : e.pronto ? 'amb' : ''}"><div class="fila"><div>
      <div class="t">🎟 ${esc(c.nombre)}</div>${tag}<small>${esc(c.donde || '')}</small>
      ${c.codigo ? `<div class="t" style="font-family:monospace;margin-top:4px">${esc(c.codigo)}</div>` : ''}
      ${c.nota ? `<div class="nota">${esc(c.nota)}</div>` : ''}</div>
      <div class="acciones">${c.usado ? '' : `<button data-act="cup-usado" data-id="${c.id}">Usado</button>`}<button class="sec chico" data-act="cup-editar" data-id="${c.id}">✎</button></div></div></div>`;
  }).join('');
  return `<div class="barra"><button class="sec" data-act="cup-nuevo">＋ Nuevo cupón</button></div>` + (filas || '<div class="vacio">Sin cupones.</div>');
}

function vistaCobrar(hoy) {
  const ord = S.cobrar.slice().sort((a, b) => ((a.estatus === 'cobrado') - (b.estatus === 'cobrado')) || String(a.desde).localeCompare(String(b.desde)));
  const abiertos = ord.filter(x => x.estatus !== 'cobrado');
  const total = abiertos.reduce((s, x) => s + (Number(x.monto) || 0), 0);
  const filas = ord.map(x => {
    const cob = x.estatus === 'cobrado', dias = diffDays(hoy, parse(x.desde || ymd(hoy)));
    return `<div class="card ${cob ? 'gris' : dias >= 7 ? 'amb' : ''}"><div class="fila"><div>
      <div class="t">💵 ${esc(x.concepto)}</div>
      <small>${esc(x.deQuien || '')} ${x.monto ? '· ' + MXN(x.monto) : ''}</small><br>
      ${cob ? '<span class="tag ok">cobrado</span>' : `<span class="tag ${dias >= 7 ? 'amb' : ''}">${dias} d abierto</span>`}
      ${(x.archivos || []).length ? `<span class="tag">📎 ${x.archivos.length}</span>` : ''}
      ${x.nota ? `<div class="nota">${esc(x.nota)}</div>` : ''}</div>
      <div class="acciones">${cob ? '' : `<button data-act="cob-cobrado" data-id="${x.id}">Cobrado</button>`}<button class="sec chico" data-act="cob-editar" data-id="${x.id}">✎</button></div></div></div>`;
  }).join('');
  return `<div class="barra"><button class="sec" data-act="cob-nuevo">＋ Nuevo</button></div>`
    + (abiertos.length ? `<p class="mute">Abiertos: <b>${abiertos.length}</b> · ${MXN(total)}</p>` : '')
    + (filas || '<div class="vacio">Nada por cobrar. Aquí van reembolsos, cosas que compraste para vender, etc.</div>');
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
      { k: 'nota', label: 'Nota', type: 'textarea' },
    ],
    onSave: async d => {
      if (nuevo) await addDoc(ref('cup'), { ...d, usado: false }); else await updateDoc(ref('cup', c.id), d);
      cerrar();
    },
    onDelete: nuevo ? null : () => deleteDoc(ref('cup', c.id)),
  });
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
      { k: 'nota', label: 'Notas: # de caso, teléfono, a dónde marcar, qué decir…', type: 'textarea' },
    ],
    onSave: async d => {
      if (nuevo) {
        const r = await addDoc(ref('cobrar'), { ...d, estatus: 'pendiente', archivos: [] });
        formCobrar({ id: r.id, ...d, estatus: 'pendiente', archivos: [] }, 'Guardado ✔ Ahora puedes subir recibos o capturas.');
      } else { await updateDoc(ref('cobrar', x.id), d); cerrar(); }
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
  const el = e.target.closest('[data-act]'); if (!el) return;
  const { act, id, mk } = el.dataset, hoy = today();
  try {
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
    if (act === 'cup-usado') { await updateDoc(ref('cup', id), { usado: true }); return toast('Cupón marcado como usado'); }
    if (act === 'cob-nuevo') return formCobrar();
    if (act === 'cob-editar') return formCobrar(byId('cobrar', id));
    if (act === 'cob-cobrado') { await updateDoc(ref('cobrar', id), { estatus: 'cobrado', cobradoFecha: ymd(hoy) }); return toast('¡Cobrado!'); }
  } catch (err) { console.error(err); toast('Error: ' + (err.code || err.message)); }
});

if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
