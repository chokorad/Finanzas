// Lógica pura de los avisos (sin red). Espejo de las funciones de ../app.js:
// ciclos(), estadoRend(), estadoCup(). Si cambias una, cambia la otra.
export const pad = n => String(n).padStart(2, '0');
export const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const ymKey = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
const parse = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const diffDays = (a, b) => Math.round((a - b) / 86400000);
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const fmtFecha = d => `${d.getDate()} ${MESES[d.getMonth()]}`;
const MXN = n => Number(n).toLocaleString('es-MX', { style: 'currency', currency: 'MXN' });
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
function dueOf(key, dia) { const [y, m] = key.split('-').map(Number); const last = new Date(y, m, 0).getDate(); return new Date(y, m - 1, Math.min(dia, last)); }
function addMonths(key, k) { const [y, m] = key.split('-').map(Number); return ymKey(new Date(y, m - 1 + k, 1)); }

// Fecha/hora en la zona del usuario (Tijuana/Mexicali sigue horario del Pacífico, con horario de verano).
export function ahoraLocal(date = new Date(), tz = 'America/Tijuana') {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hour12: false, weekday: 'short' }).formatToParts(date);
  const g = t => parts.find(p => p.type === t).value;
  return {
    hoy: new Date(Number(g('year')), Number(g('month')) - 1, Number(g('day'))),
    hora: Number(g('hour')) % 24,
    dow: { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }[g('weekday')],
  };
}
// Turnos: mañana 7–9 h, noche 21–23 h (ventana por si GitHub retrasa la ejecución).
// Ventanas amplias a propósito: GitHub retrasa o salta los horarios programados (a veces horas), así que
// el primer run que caiga dentro de la ventana manda el aviso (finanzas_envios evita duplicados).
export const slotDe = hora => (hora >= 7 && hora <= 14) ? 'am' : (hora >= 21 && hora <= 23) ? 'pm' : null;

export function ciclos(p, hoy) {
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
export function estadoRend(r, hoy) {
  const vigente = r.mes === ymKey(hoy);
  const progreso = vigente ? (r.progreso || 0) : 0, cumplido = vigente ? !!r.cumplido : false;
  const tipo = r.tipoCond || 'ninguna';
  const hecho = tipo === 'ninguna' ? true : tipo === 'check' ? cumplido : progreso >= (r.meta || 1);
  return { progreso, hecho, tipo, avisar: !hecho && hoy.getDate() >= (r.diaAviso ?? 20) };
}
// Beneficios: cupones (tipo vacío o 'cupon') y además seguros, pases, beneficios de tarjeta (su 'vence' es la renovación).
export const esBeneficio = c => !!c.tipo && c.tipo !== 'cupon';
export const AVISOS_BENEFICIO = [30, 14, 7, 3, 1, 0];   // días antes de que venza/renueve en que se manda correo
export function estadoCup(c, hoy) {
  if (c.usado || !c.vence) return { dd: null, pronto: false };
  const dd = diffDays(parse(c.vence), hoy);
  return { dd, pronto: dd >= 0 && dd <= (c.meta || esBeneficio(c) ? 30 : 7) };
}

// ---------- estados de cuenta (espejo de app.js): revisar 2 días después del corte; fin de semana -> viernes ----------
export const ESTADOS_DESDE = '2026-11';
const ajustaFinde = d => { const w = d.getDay(); return w === 6 ? new Date(d.getFullYear(), d.getMonth(), d.getDate() - 1) : w === 0 ? new Date(d.getFullYear(), d.getMonth(), d.getDate() - 2) : d; };
export const revisionDe = (p, mk) => ajustaFinde(dueOf(mk, (Number(p.corte) || 1) + 2));
export function estadosPendientes(pagos, hoy) {
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

// ---------- calendario para el correo (espejo de eventosMes()/vistaCal() de ../app.js) ----------
const MESES_L = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const PESO = { rojo: 3, amb: 2, base: 1, ok: 0 };
// Depósitos de nómina ISSSTE: fechas REALES que da Mario (YYYY-MM-DD). Agregar aquí las siguientes cuando las pase.
const QUINCENAS = ['2026-11-10', '2026-11-25', '2026-12-10', '2026-12-17'];
function ingresosMes(mk) {
  return QUINCENAS.filter(f => f.slice(0, 7) === mk).map(f => ({ date: parse(f), txt: 'Depósito de nómina ISSSTE' }));
}
export function eventosMes(mk, hoy, { pagos = [], rend = [], cup = [], cobrar = [] }) {
  const ev = {};
  const add = (date, ico, n) => { const k = ymd(date); (ev[k] = ev[k] || []).push({ ico, n }); };
  const nivelDd = dd => dd <= 3 ? 'rojo' : dd <= 10 ? 'amb' : 'base';
  for (const p of pagos.filter(p => p.activo !== false)) {
    if (p.desde && mk < p.desde) continue;
    const due = dueOf(mk, p.dia), pagado = (p.pagados || []).includes(mk), dd = diffDays(due, hoy);
    if (p.diaInicio) { add(dueOf(mk, p.diaInicio), '🎓', pagado ? 'ok' : 'amb'); add(due, '🎓', pagado ? 'ok' : nivelDd(dd)); }
    else add(due, '💳', pagado ? 'ok' : nivelDd(dd));
  }
  const ultimo = new Date(+mk.slice(0, 4), +mk.slice(5, 7), 0);
  for (const r of rend) {
    const tipo = r.tipoCond || 'ninguna'; if (tipo === 'ninguna') continue;
    const hecho = mk === ymKey(hoy) && estadoRend(r, hoy).hecho;
    add(dueOf(mk, Number(r.diaInicio) || 1), '🌱', hecho ? 'ok' : 'amb');
    if (!hecho && mk >= ymKey(hoy)) add(ultimo, '⏳', ultimo < hoy ? 'rojo' : nivelDd(diffDays(ultimo, hoy)));
  }
  for (const c of cup) if (!c.usado && c.vence && c.vence.slice(0, 7) === mk) add(parse(c.vence), esBeneficio(c) ? '🛡' : '🎟', nivelDd(diffDays(parse(c.vence), hoy)));
  for (const x of cobrar) {
    if (x.estatus === 'cobrado' || !x.fechaEsperada || x.fechaEsperada.slice(0, 7) !== mk) continue;
    add(parse(x.fechaEsperada), '💵', diffDays(parse(x.fechaEsperada), hoy) < 0 ? 'rojo' : 'amb');
  }
  for (const p of pagos.filter(p => p.activo !== false && p.corte)) {
    if (mk < ESTADOS_DESDE) continue;
    const rev = revisionDe(p, mk), ok = (p.estados || []).includes(mk);
    add(rev, '📄', ok ? 'ok' : rev < hoy ? 'amb' : nivelDd(diffDays(rev, hoy)));
  }
  for (const i of ingresosMes(mk)) add(i.date, '💰', 'ok');
  return ev;
}
export function calendarioHtml(datos, hoy, mk = ymKey(hoy)) {
  const [y, m] = mk.split('-').map(Number), hk = ymd(hoy);
  const ev = eventosMes(mk, hoy, datos), nd = new Date(y, m, 0).getDate(), off = (new Date(y, m - 1, 1).getDay() + 6) % 7;
  const bg = { rojo: '#fecaca', amb: '#fde68a', ok: '#bbf7d0', '': '#f1f5f9' };
  const td = (inner, st = '') => `<td style="width:14.28%;height:46px;vertical-align:top;text-align:center;font-size:12px;border:1px solid #e2e8f0;padding:2px 0;${st}">${inner}</td>`;
  let filas = '<tr>' + ['lun', 'mar', 'mié', 'jue', 'vie', 'sáb', 'dom'].map(d => `<td style="text-align:center;font-size:11px;color:#64748b;padding:2px 0">${d}</td>`).join('') + '</tr><tr>';
  let col = 0;
  for (let i = 0; i < off; i++, col++) filas += '<td></td>';
  for (let d = 1; d <= nd; d++, col++) {
    if (col === 7) { filas += '</tr><tr>'; col = 0; }
    const k = `${mk}-${pad(d)}`, es = ev[k] || [];
    const peor = es.reduce((a, e) => PESO[e.n] > PESO[a] ? e.n : a, 'ok');
    const color = es.length ? (peor === 'base' ? '' : peor) : '';
    const ems = [...new Set(es.map(e => e.ico))].slice(0, 3).join('');
    const num = k === hk ? `<span style="background:#0ea5e9;color:#fff;border-radius:10px;padding:0 6px;font-weight:700">${d}</span>` : `<b>${d}</b>`;
    filas += td(`${num}<br><span style="font-size:13px">${ems}</span>`, `background:${bg[color]};${k === hk ? 'border:2px solid #0ea5e9;' : ''}${k < hk ? 'opacity:.7;' : ''}`);
  }
  filas += '</tr>';
  return `<div style="margin-bottom:16px"><div style="font-weight:700;text-transform:capitalize;margin:0 0 6px">${MESES_L[m - 1]} ${y}</div>`
    + `<table style="width:100%;border-collapse:collapse;table-layout:fixed">${filas}</table>`
    + `<div style="color:#64748b;font-size:11px;margin-top:6px">💰 nómina · 📄 estado de cuenta · 💳 pago tarjeta · 🎓 colegiatura · 🌱 empezar rendimientos · ⏳ cierre de mes · 🎟 cupón · 💵 cobro esperado<br>Rojo: ≤3 días o vencido · Ámbar: ≤10 días · Verde: listo / te depositan · Azul: hoy</div></div>`;
}

// Arma el correo. Devuelve null si no hay nada que avisar.
export function armarAviso({ pagos = [], rend = [], cup = [], cobrar = [] }, { hoy, dow, slot }) {
  const calHtml = slot === 'am' ? calendarioHtml({ pagos, rend, cup, cobrar }, hoy) + (hoy.getDate() >= 25 ? calendarioHtml({ pagos, rend, cup, cobrar }, hoy, addMonths(ymKey(hoy), 1)) : '') : '';
  const diasAlLunes = dow === 4 ? 4 : dow === 5 ? 3 : 0;   // jueves/viernes: adelantar fin de semana y lunes
  const items = []; // {n: 0 rojo | 1 ámbar | 2 gris, t: texto, orden}
  const cuandoPago = (c, p) => {
    const dia = fmtFecha(c.due);
    const txt = c.dd < 0 ? `VENCIDO hace ${-c.dd} día(s) (${dia})` : c.dd === 0 ? `vence HOY (${dia})`
      : c.dd === 1 ? `vence mañana (${dia})` : `vence ${dia}, en ${c.dd} días`;
    return `${esc(p.nombre)} — ${txt}${p.monto ? ' · ' + MXN(p.monto) : ''}`;
  };
  for (const p of pagos.filter(p => p.activo !== false)) {
    for (const c of ciclos(p, hoy)) {
      const adelanto = diasAlLunes > 0 && c.dd >= 0 && c.dd <= diasAlLunes;
      const entra = slot === 'pm' ? (c.dd <= 1 || adelanto) : (c.estado !== 'futuro' || adelanto);
      if (!entra) continue;
      items.push({ n: c.dd <= 0 ? 0 : 1, orden: c.dd, sec: 'Pagos', t: cuandoPago(c, p), pago: true, dd: c.dd, nombre: p.nombre });
    }
  }
  if (slot === 'am') {
    for (const r of rend) {
      const e = estadoRend(r, hoy);
      if (!e.avisar) continue;
      const falta = e.tipo === 'contador' ? `llevas ${e.progreso} de ${r.meta || 1}` : 'pendiente este mes';
      items.push({ n: 1, orden: 50, sec: 'Rendimientos (condiciones del mes)', t: `${esc(r.nombre)} — ${falta}. ${esc(r.condicion || '')}` });
    }
  }
  for (const c of cup) {
    const e = estadoCup(c, hoy);
    if (esBeneficio(c)) {   // seguros, pases, beneficios: aviso solo a 30/14/7/3/1/0 días de la renovación
      if (e.dd !== null && AVISOS_BENEFICIO.includes(e.dd) && (slot === 'am' || e.dd <= 1))
        items.push({ n: e.dd <= 3 ? 0 : 1, orden: 40 + e.dd, sec: 'Seguros y beneficios por renovar', t: `${esc(c.nombre)}${c.donde ? ' (' + esc(c.donde) + ')' : ''} — ${e.dd === 0 ? 'vence/renueva HOY' : 'vence/renueva en ' + e.dd + ' día(s)'}${c.link ? ' · <a href="' + esc(c.link) + '">términos</a>' : ''}` });
      continue;
    }
    if (c.meta) {   // promos con meta de gasto: solo en la mañana
      if (slot !== 'am' || c.usado || e.dd < 0) continue;
      const avance = `llevas ${MXN(c.gastado || 0)} de ${MXN(c.meta)} · bonificaciones ${c.veces || 0}/${c.maxVeces || '∞'}`;
      const vence = e.dd === null ? '' : ` Vence en ${e.dd} día(s).`;
      if (c.porActivar) items.push({ n: 1, orden: 55, sec: 'Promociones', t: `${esc(c.nombre)} — ACTÍVALA antes de gastar (${avance}).${vence}${c.donde ? ' Aplica en: ' + esc(c.donde) : ''}` });
      else if (e.pronto || (dow === 1 && (c.gastado || 0) > 0)) items.push({ n: 1, orden: 56, sec: 'Promociones', t: `${esc(c.nombre)} — ${avance}.${vence}` });
      continue;
    }
    if (!e.pronto) continue;
    if (slot === 'pm' && e.dd > 1) continue;
    items.push({ n: e.dd <= 1 ? 0 : 1, orden: e.dd, sec: 'Cupones por vencer', t: `${esc(c.nombre)}${c.codigo ? ' · <b>' + esc(c.codigo) + '</b>' : ''}${c.donde ? ' (' + esc(c.donde) + ')' : ''} — ${e.dd === 0 ? 'vence HOY' : 'vence en ' + e.dd + ' día(s)'}` });
  }
  if (slot === 'am') {
    for (const x of cobrar.filter(x => x.estatus !== 'cobrado' && x.porDefinir)) {
      items.push({ n: 1, orden: 79, sec: 'Por definir (nota rápida)', t: `${esc(x.concepto)} — falta definir cómo cobrarlo/venderlo` });
    }
    const ab = cobrar.filter(x => x.estatus !== 'cobrado' && !x.porDefinir)
      .map(x => ({ x, dias: diffDays(hoy, parse(x.desde || ymd(hoy))) })).filter(o => o.dias >= 7)
      .sort((a, b) => b.dias - a.dias).slice(0, 10);
    for (const { x, dias } of ab) {
      items.push({ n: 1, orden: 90 - dias, sec: 'Por cobrar (más de 7 días abierto)', t: `${esc(x.concepto)}${x.deQuien ? ' — ' + esc(x.deQuien) : ''}${x.monto ? ' · ' + MXN(x.monto) : ''} · ${dias} días${x.nota ? '<br><i style="color:#666">' + esc(String(x.nota).slice(0, 160)) + '</i>' : ''}` });
    }
  }
  if (slot === 'am') {
    // Calendario en el correo: día de empezar rendimientos, cobros esperados y agenda de 7 días.
    const ventana = Math.max(diasAlLunes, 0);
    for (const r of rend) {
      const e = estadoRend(r, hoy);
      if (e.tipo === 'ninguna' || e.hecho) continue;
      const dd = diffDays(dueOf(ymKey(hoy), Number(r.diaInicio) || 1), hoy);
      if (dd >= 0 && dd <= ventana) items.push({ n: 1, orden: 45 + dd, sec: 'Rendimientos: hoy toca empezar', t: `${esc(r.nombre)} — ${dd === 0 ? 'hoy' : 'en ' + dd + ' día(s)'}: ${esc(r.condicion || 'condición del mes')}` });
    }
    for (const e of estadosPendientes(pagos, hoy)) {
      items.push({ n: 1, orden: 40 - Math.min(e.dias, 30) / 100, sec: 'Estados de cuenta por revisar', t: `${esc(e.p.nombre)} — corte del ${fmtFecha(e.corte)}, pendiente desde el ${fmtFecha(e.rev)} (${e.dias} día(s)). Mándaselo a Claude y márcalo como revisado.` });
    }
    for (const x of cobrar.filter(x => x.estatus !== 'cobrado' && x.fechaEsperada)) {
      const dd = diffDays(parse(x.fechaEsperada), hoy);
      if (dd > ventana) continue;
      items.push({ n: dd <= 0 ? 0 : 1, orden: 60 + dd, sec: 'Cobros esperados', t: `${esc(x.concepto)}${x.monto ? ' · ' + MXN(x.monto) : ''} — ${dd < 0 ? 'ya pasó la fecha esperada hace ' + (-dd) + ' día(s)' : dd === 0 ? 'se esperaba HOY' : 'se espera en ' + dd + ' día(s)'}` });
    }
    const ag = [];
    for (let d = 1; d <= 7; d++) {
      const f = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() + d), fk = ymd(f), et = fmtFecha(f);
      for (const p of pagos.filter(p => p.activo !== false)) {
        if (ciclos(p, hoy).some(c => c.dd === d) && !items.some(i => i.pago && i.nombre === p.nombre)) ag.push({ d, t: `${et} · 💳 ${esc(p.nombre)}: fecha de pago` });
      }
      for (const r of rend) {
        if ((r.tipoCond || 'ninguna') === 'ninguna' || f.getDate() !== (Number(r.diaInicio) || 1)) continue;
        if (ymKey(f) === ymKey(hoy) && estadoRend(r, hoy).hecho) continue;
        ag.push({ d, t: `${et} · 🌱 ${esc(r.nombre)}: ${esc(r.condicion || "condición del mes")}` });
      }
      for (const p of pagos.filter(p => p.activo !== false && p.corte)) {
        for (const k of [-1, 0]) { const mk = addMonths(ymKey(f), k); if (mk >= ESTADOS_DESDE && !(p.estados || []).includes(mk) && ymd(revisionDe(p, mk)) === fk) ag.push({ d, t: `${et} · 📄 ${esc(p.nombre)}: revisar estado de cuenta` }); }
      }
      for (const c of cup) if (!c.usado && c.vence === fk) ag.push({ d, t: `${et} · ${esBeneficio(c) ? '🛡 vence/renueva' : '🎟 vence'} ${esc(c.nombre)}` });
      for (const x of cobrar) if (x.estatus !== 'cobrado' && x.fechaEsperada === fk) ag.push({ d, t: `${et} · 💵 cobro esperado: ${esc(x.concepto)}` });
    }
    for (let d = 1; d <= 7; d++) {
      const f = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() + d), et = fmtFecha(f);
      for (const i of ingresosMes(ymKey(f))) if (ymd(i.date) === ymd(f)) ag.push({ d, t: `${et} · 💰 ${esc(i.txt)}`, suave: true });
    }
    ag.sort((a, b) => a.d - b.d);
    for (const g of ag) items.push({ n: 2, orden: 100 + g.d, sec: '📅 Próximos 7 días', t: g.t, suave: g.suave });
  }
  const icono = slot === 'am' ? '☀️' : '🌙';
  const reales = items.filter(i => !i.suave);
  if (!reales.length) {
    if (slot === 'am' && dow === 1) return { asunto: `${icono} Finanzas: todo en orden esta semana ✅`, html: `<div style="font-family:system-ui,Arial,sans-serif;max-width:560px">${calHtml}<p>No hay pendientes urgentes. El sistema de avisos sigue funcionando.</p></div>`, total: 0 };
    return null;
  }
  items.sort((a, b) => a.n - b.n || a.orden - b.orden);
  const rojos = items.filter(i => i.n === 0 && i.pago);
  const hoyV = items.filter(i => i.pago && i.dd === 0);
  const asunto = rojos.length
    ? `${icono} 🔴 Finanzas: ${rojos[0].dd < 0 ? 'VENCIDO' : 'vence HOY'} — ${rojos[0].nombre}${rojos.length > 1 ? ` (+${rojos.length - 1})` : ''}`
    : hoyV.length ? `${icono} Finanzas: hoy ${hoyV[0].nombre}`
    : `${icono} Finanzas: ${reales.length} pendiente${reales.length > 1 ? 's' : ''}`;
  const color = { 0: '#b91c1c', 1: '#b45309', 2: '#555' };
  const secs = [...new Set(items.map(i => i.sec))];
  const aviso = diasAlLunes ? `<p style="background:#fef3c7;padding:8px;border-radius:6px">Fin de semana: no revisas el correo, por eso aquí va también lo que vence hasta el lunes.</p>` : '';
  const html = `<div style="font-family:system-ui,Arial,sans-serif;max-width:560px">${aviso}${calHtml}` + secs.map(s =>
    `<h3 style="margin:16px 0 6px">${s}</h3><ul style="padding-left:18px;margin:0">` +
    items.filter(i => i.sec === s).map(i => `<li style="margin:6px 0;color:${color[i.n]}">${i.t}</li>`).join('') + '</ul>').join('')
    + `<p style="color:#888;font-size:12px;margin-top:20px">Márcalo como pagado/hecho en la app Finanzas para que deje de avisar.</p></div>`;
  return { asunto, html, total: reales.length };
}
