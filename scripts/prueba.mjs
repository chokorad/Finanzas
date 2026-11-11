// Pruebas de la lógica de avisos: node prueba.mjs
import assert from 'node:assert/strict';
import { armarAviso, ciclos, ahoraLocal, slotDe, revisionDe, estadosPendientes } from './logica.mjs';
const D = (y, m, d) => new Date(y, m - 1, d);
const pagos = [
  { nombre: 'LikeU', dia: 23, avisoDias: 5, desde: '2026-11', pagados: [] },
  { nombre: 'Gold', dia: 29, avisoDias: 5, desde: '2026-11', pagados: [] },
  { nombre: 'Amex', dia: 11, avisoDias: 5, desde: '2026-11', pagados: [] },
  { nombre: 'Colegiatura', dia: 5, diaInicio: 1, monto: 4192.2, desde: '2026-12', pagados: [] },
];
const ok = (n, f) => { f(); console.log('ok -', n); };

ok('lunes 9-nov: Amex (11) ya entra (5 días antes)', () => {
  const r = armarAviso({ pagos }, { hoy: D(2026, 11, 9), dow: 1, slot: 'am' });
  assert.match(r.html, /Amex/); assert.doesNotMatch(r.html, /LikeU/);
});
ok('colegiatura: 1-dic entra, 6-dic sigue como vencida hasta marcarla', () => {
  assert.match(armarAviso({ pagos }, { hoy: D(2026, 12, 1), dow: 2, slot: 'am' }).html, /Colegiatura/);
  const r = armarAviso({ pagos }, { hoy: D(2026, 12, 6), dow: 0, slot: 'am' });
  assert.match(r.html, /VENCIDO/);
});
ok('colegiatura pagada en dic no avisa', () => {
  const p = pagos.map(x => x.nombre === 'Colegiatura' ? { ...x, pagados: ['2026-12'] } : x);
  const r = armarAviso({ pagos: p }, { hoy: D(2026, 12, 3), dow: 4, slot: 'am' });
  assert.ok(!r || !/Colegiatura/.test(r.html));
});
ok('LikeU 23-nov sin pagar: asunto rojo "vence HOY"', () => {
  const p = pagos.map(x => x.nombre === 'Amex' ? { ...x, pagados: ['2026-11'] } : x);
  const r = armarAviso({ pagos: p }, { hoy: D(2026, 11, 23), dow: 1, slot: 'am' });
  assert.match(r.asunto, /vence HOY — LikeU/);
});
ok('viernes adelanta fin de semana y lunes (vence sáb/lun, aviso corto)', () => {
  const p = [{ nombre: 'Seguro', dia: 16, avisoDias: 0, desde: '2026-11', pagados: [] },   // lunes 16-nov
             { nombre: 'Lejano', dia: 20, avisoDias: 0, desde: '2026-11', pagados: [] }];
  const r = armarAviso({ pagos: p }, { hoy: D(2026, 11, 13), dow: 5, slot: 'am' });   // viernes
  assert.match(r.html, /Seguro/); assert.doesNotMatch(r.html.split('Próximos 7 días')[0], /Lejano/); assert.match(r.html, /Fin de semana/);
  assert.match(armarAviso({ pagos: p }, { hoy: D(2026, 11, 12), dow: 4, slot: 'am' }).html, /Seguro/);   // jueves también
});
ok('rendimientos: no avisa antes del día 20, sí después; pm no los incluye', () => {
  const rend = [{ nombre: 'Revolut', tipoCond: 'contador', meta: 4, condicion: '4 compras', mes: '2026-11', progreso: 1, diaAviso: 20 },
                { nombre: 'Mifel', tipoCond: 'ninguna' }];
  assert.equal(armarAviso({ rend }, { hoy: D(2026, 11, 19), dow: 4, slot: 'am' }), null);
  assert.match(armarAviso({ rend }, { hoy: D(2026, 11, 20), dow: 5, slot: 'am' }).html, /llevas 1 de 4/);
  assert.equal(armarAviso({ rend }, { hoy: D(2026, 11, 20), dow: 5, slot: 'pm' }), null);
  // el mes siguiente el progreso se reinicia solo
  assert.match(armarAviso({ rend }, { hoy: D(2026, 12, 21), dow: 1, slot: 'am' }).html, /llevas 0 de 4/);
  rend[0].progreso = 4;
  assert.equal(armarAviso({ rend }, { hoy: D(2026, 11, 23), dow: 3, slot: 'am' }), null);
});
ok('cupones: avisa a 7 días y no si está usado', () => {
  const cup = [{ nombre: 'Vuelo', codigo: 'XYZ', vence: '2026-11-16' }, { nombre: 'Usado', vence: '2026-11-16', usado: true }];
  const r = armarAviso({ cup }, { hoy: D(2026, 11, 9), dow: 1, slot: 'am' });
  assert.match(r.html, /XYZ/); assert.doesNotMatch(r.html, /Usado/);
  assert.equal(armarAviso({ cup }, { hoy: D(2026, 11, 8), dow: 0, slot: 'am' }), null);
});
ok('por cobrar: solo >=7 días y solo en la mañana', () => {
  const cobrar = [{ concepto: 'Reembolso', desde: '2026-11-01', estatus: 'pendiente', nota: 'caso 123' }, { concepto: 'Nuevo', desde: '2026-11-08', estatus: 'pendiente' }];
  const r = armarAviso({ cobrar }, { hoy: D(2026, 11, 9), dow: 1, slot: 'am' });
  assert.match(r.html, /Reembolso/); assert.match(r.html, /caso 123/); assert.doesNotMatch(r.html, /Nuevo/);
  assert.equal(armarAviso({ cobrar }, { hoy: D(2026, 11, 9), dow: 1, slot: 'pm' }), null);
});
ok('lunes sin pendientes manda latido; martes no', () => {
  assert.match(armarAviso({}, { hoy: D(2026, 11, 9), dow: 1, slot: 'am' }).asunto, /todo en orden/);
  assert.equal(armarAviso({}, { hoy: D(2026, 11, 10), dow: 2, slot: 'am' }), null);
});
ok('cuota a fin de mes corto (día 31 en febrero) cae el 28', () => {
  const c = ciclos({ dia: 31, avisoDias: 3, desde: '2027-02', pagados: [] }, D(2027, 2, 27));
  assert.equal(c[0].due.getDate(), 28);
});
ok('zona horaria: 15:00 UTC en invierno = 7am Tijuana; 14:00 UTC en verano = 7am', () => {
  assert.equal(ahoraLocal(new Date('2026-11-10T15:07:00Z')).hora, 7);
  assert.equal(ahoraLocal(new Date('2026-07-10T14:07:00Z')).hora, 7);
  assert.equal(ahoraLocal(new Date('2026-11-10T05:07:00Z')).hora, 21);   // 9pm lunes 9-nov
  assert.equal(ahoraLocal(new Date('2026-11-10T05:07:00Z')).dow, 1);
  assert.equal(slotDe(7), 'am'); assert.equal(slotDe(21), 'pm'); assert.equal(slotDe(13), 'am'); assert.equal(slotDe(15), null); assert.equal(slotDe(20), null);
});
ok('promo con meta: pide activarla; ya activa solo avisa el lunes o cerca del fin', () => {
  const promo = { nombre: 'Amex Walmart', meta: 3500, maxVeces: 3, veces: 1, gastado: 1200, vence: '2027-04-07', porActivar: true, donde: 'walmart.com.mx' };
  const r1 = armarAviso({ cup: [promo] }, { hoy: D(2026, 11, 10), dow: 2, slot: 'am' });
  assert.match(r1.html, /ACTÍVALA/); assert.match(r1.html, /1 de 3|1\/3/);
  assert.equal(armarAviso({ cup: [promo] }, { hoy: D(2026, 11, 10), dow: 2, slot: 'pm' }), null);
  const activa = { ...promo, porActivar: false };
  assert.equal(armarAviso({ cup: [activa] }, { hoy: D(2026, 11, 10), dow: 2, slot: 'am' }), null);          // martes lejos del fin: nada
  assert.match(armarAviso({ cup: [activa] }, { hoy: D(2026, 11, 9), dow: 1, slot: 'am' }).html, /1,200/);     // lunes: avance
  assert.match(armarAviso({ cup: [activa] }, { hoy: D(2027, 3, 10), dow: 3, slot: 'am' }).html, /Vence en 28/); // a 30 días del fin
  assert.equal(armarAviso({ cup: [{ ...activa, usado: true }] }, { hoy: D(2027, 3, 10), dow: 3, slot: 'am' }), null);
  assert.equal(armarAviso({ cup: [promo] }, { hoy: D(2027, 4, 8), dow: 4, slot: 'am' }), null);              // ya venció
});
ok('calendario en el correo: rendimientos, cobros esperados y agenda', () => {
  const rend = [{ nombre: 'MercadoPago', tipoCond: 'check', condicion: 'Depositar $3,000', diaInicio: 12 }];
  const cobrar = [{ concepto: 'Batidora', estatus: 'pendiente', desde: '2026-08-07', fechaEsperada: '2026-11-09', monto: 640.55 }];
  const r = armarAviso({ rend, cobrar }, { hoy: D(2026, 11, 9), dow: 1, slot: 'am' });
  assert.match(r.html, /Cobros esperados/); assert.match(r.html, /se esperaba HOY/);
  assert.match(r.html, /Próximos 7 días/); assert.match(r.html, /12 nov/);       // MercadoPago el 12 (en 3 días)
  const r2 = armarAviso({ rend }, { hoy: D(2026, 11, 12), dow: 4, slot: 'am' });
  assert.match(r2.html, /hoy toca empezar/);
  assert.equal(armarAviso({ rend }, { hoy: D(2026, 11, 9), dow: 1, slot: 'pm' }), null);
});
ok('el correo AM trae el calendario del mes (y el PM no)', () => {
  const cobrar = [{ concepto: 'Batidora', estatus: 'pendiente', desde: '2026-08-07', fechaEsperada: '2026-11-20' }];
  const am = armarAviso({ pagos, cobrar }, { hoy: D(2026, 11, 9), dow: 1, slot: 'am' });
  assert.match(am.html, /noviembre 2026/); assert.match(am.html, /<table/); assert.match(am.html, /💳/); assert.match(am.html, /💵/);
  assert.doesNotMatch(armarAviso({ pagos }, { hoy: D(2026, 11, 11), dow: 3, slot: 'pm' }).html, /<table/);
  assert.match(armarAviso({ pagos }, { hoy: D(2026, 11, 26), dow: 4, slot: 'am' }).html, /diciembre 2026/); // fin de mes: muestra el siguiente
});
ok('nómina: sale en el calendario del correo y no dispara correo por sí sola', () => {
  const am = armarAviso({ pagos }, { hoy: D(2026, 11, 9), dow: 1, slot: 'am' });
  assert.match(am.html, /💰/);                                       // quincena 15 y fin de mes en la cuadrícula
  assert.match(am.html, /Depósito de nómina/);                        // 10-nov entra en "Próximos 7 días"
  assert.equal(armarAviso({}, { hoy: D(2026, 11, 10), dow: 2, slot: 'am' }), null);   // solo quincena cerca: no manda correo
  assert.match(armarAviso({}, { hoy: D(2026, 11, 9), dow: 1, slot: 'am' }).asunto, /todo en orden/);
});
ok('estados de cuenta: revisión 2 días tras el corte, fin de semana -> viernes', () => {
  const tj = [{ nombre: 'LikeU', dia: 23, corte: 4 }, { nombre: 'Gold', dia: 29, corte: 11 }, { nombre: 'Amex', dia: 11, corte: 22 }, { nombre: 'Mercado Pago', dia: 17, corte: 7 }];
  const f = (p, mk) => { const d = revisionDe(p, mk); return `${d.getMonth() + 1}-${d.getDate()}`; };
  assert.equal(f(tj[0], '2026-11'), '11-6'); assert.equal(f(tj[1], '2026-11'), '11-13');
  assert.equal(f(tj[2], '2026-11'), '11-24'); assert.equal(f(tj[3], '2026-11'), '11-9');   // corte 7-nov sábado -> revisión lun 9
  assert.equal(f(tj[3], '2027-01'), '1-8');                                                  // 9-ene-2027 sábado -> viernes 8
  assert.equal(f(tj[0], '2026-12'), '12-4');                         // 6-dic domingo -> viernes 4
  const p = estadosPendientes(tj, D(2026, 11, 12));
  assert.deepEqual(p.map(x => x.p.nombre).sort(), ['LikeU', 'Mercado Pago']);
  tj[0].estados = ['2026-11'];
  assert.deepEqual(estadosPendientes(tj, D(2026, 11, 12)).map(x => x.p.nombre), ['Mercado Pago']);
  const r = armarAviso({ pagos: tj }, { hoy: D(2026, 11, 12), dow: 4, slot: 'am' });
  assert.match(r.html, /Estados de cuenta por revisar/); assert.match(r.html, /Mercado Pago/); assert.match(r.html, /📄/);
  assert.doesNotMatch(armarAviso({ pagos: tj }, { hoy: D(2026, 11, 12), dow: 4, slot: 'pm' })?.html || '', /Estados de cuenta/);
});
console.log('TODAS LAS PRUEBAS PASARON');
