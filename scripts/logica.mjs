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
export const slotDe = hora => (hora >= 7 && hora <= 9) ? 'am' : (hora >= 21 && hora <= 23) ? 'pm' : null;

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
export function estadoCup(c, hoy) {
  if (c.usado || !c.vence) return { dd: null, pronto: false };
  const dd = diffDays(parse(c.vence), hoy);
  return { dd, pronto: dd >= 0 && dd <= (c.meta ? 30 : 7) };
}

// Arma el correo. Devuelve null si no hay nada que avisar.
export function armarAviso({ pagos = [], rend = [], cup = [], cobrar = [] }, { hoy, dow, slot }) {
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
        ag.push({ d, t: `${et} · 🌱 ${esc(r.nombre)}: empezar ${esc(r.condicion || 'condición del mes')}` });
      }
      for (const c of cup) if (!c.usado && c.vence === fk) ag.push({ d, t: `${et} · 🎟 vence ${esc(c.nombre)}` });
      for (const x of cobrar) if (x.estatus !== 'cobrado' && x.fechaEsperada === fk) ag.push({ d, t: `${et} · 💵 cobro esperado: ${esc(x.concepto)}` });
    }
    for (const g of ag) items.push({ n: 2, orden: 100 + g.d, sec: '📅 Próximos 7 días', t: g.t });
  }
  const icono = slot === 'am' ? '☀️' : '🌙';
  if (!items.length) {
    if (slot === 'am' && dow === 1) return { asunto: `${icono} Finanzas: todo en orden esta semana ✅`, html: '<p>No hay pendientes urgentes. El sistema de avisos sigue funcionando.</p>', total: 0 };
    return null;
  }
  items.sort((a, b) => a.n - b.n || a.orden - b.orden);
  const rojos = items.filter(i => i.n === 0 && i.pago);
  const hoyV = items.filter(i => i.pago && i.dd === 0);
  const asunto = rojos.length
    ? `${icono} 🔴 Finanzas: ${rojos[0].dd < 0 ? 'VENCIDO' : 'vence HOY'} — ${rojos[0].nombre}${rojos.length > 1 ? ` (+${rojos.length - 1})` : ''}`
    : hoyV.length ? `${icono} Finanzas: hoy ${hoyV[0].nombre}`
    : `${icono} Finanzas: ${items.length} pendiente${items.length > 1 ? 's' : ''}`;
  const color = { 0: '#b91c1c', 1: '#b45309', 2: '#555' };
  const secs = [...new Set(items.map(i => i.sec))];
  const aviso = diasAlLunes ? `<p style="background:#fef3c7;padding:8px;border-radius:6px">Fin de semana: no revisas el correo, por eso aquí va también lo que vence hasta el lunes.</p>` : '';
  const html = `<div style="font-family:system-ui,Arial,sans-serif;max-width:560px">${aviso}` + secs.map(s =>
    `<h3 style="margin:16px 0 6px">${s}</h3><ul style="padding-left:18px;margin:0">` +
    items.filter(i => i.sec === s).map(i => `<li style="margin:6px 0;color:${color[i.n]}">${i.t}</li>`).join('') + '</ul>').join('')
    + `<p style="color:#888;font-size:12px;margin-top:20px">Márcalo como pagado/hecho en la app Finanzas para que deje de avisar.</p></div>`;
  return { asunto, html, total: items.length };
}
