import { describe, expect, it } from 'vitest';
import type { Limite, Meta, Movimiento, Recurrente, Usuario } from '../types';
import { calendarioMes, consejos, evolucionMensual, presupuestoDiario, prevision, racha } from './analisis';

let n = 0;
const gasto = (importe: number, categoria: string, fecha: string, extra: Partial<Movimiento> = {}): Movimiento => ({
  id: `g${n++}`,
  tipo: 'gasto',
  importe,
  categoria,
  fecha,
  creadoEn: `${fecha}T10:00:00Z`,
  actualizadoEn: '',
  ...extra,
});

// jueves 15 de octubre de 2026 (octubre: 31 días → quedan 16 tras hoy)
const HOY = new Date(2026, 9, 15, 12);
const limites: Limite[] = [
  { categoria: 'comida', mensual: 310, semanal: 0, umbralAviso: 0.8 },
  { categoria: 'ocio', mensual: 155, semanal: 0, umbralAviso: 0.8 },
  { categoria: 'vivienda', mensual: 700, semanal: 0, umbralAviso: 0.8 },
];
const usuario: Usuario = {
  id: 'u',
  nombre: 'Ana',
  moneda: 'EUR',
  ingresosNetosMensuales: 2000,
  perfilGasto: 'equilibrado',
  onboardingCompletado: true,
  creadoEn: '2026-09-01T09:00:00Z',
  actualizadoEn: '',
};
const meta: Meta = {
  id: 'm',
  nombre: 'Viaje',
  emoji: '✈️',
  importeObjetivo: 5000,
  importeInicial: 0,
  fechaInicio: '2026-09-01',
  fechaLimite: '2027-09-01',
  aporteMensualPlanificado: 400,
  aportaciones: [{ id: 'a', fecha: '2026-10-02', importe: 100 }],
  principal: true,
  creadoEn: '',
  actualizadoEn: '',
};
const recs: Recurrente[] = [
  { id: 'netflix', tipo: 'gasto', importe: 15, categoria: 'suscripciones', dia: 20, desde: '2026-09-01', ultima: '2026-09-20', activo: true, creadoEn: '' },
  { id: 'nomina', tipo: 'ingreso', importe: 2000, categoria: 'nomina', dia: 28, desde: '2026-09-01', ultima: '2026-09-28', activo: true, creadoEn: '' },
];
const base = [gasto(700, 'vivienda', '2026-10-01', { recurrenteId: 'alq' }), gasto(100, 'comida', '2026-10-05'), gasto(50, 'comida', '2026-10-12')];

describe('presupuestoDiario', () => {
  it('suma solo las categorías variables', () => {
    expect(presupuestoDiario(limites, HOY)).toBe(15); // 465 / 31
  });
});

describe('prevision', () => {
  it('proyecta el día a día, suma fijos pendientes y huchas, sin contar dos veces la nómina prevista', () => {
    const p = prevision(usuario, limites, base, [meta], recs, HOY);
    expect(p).toMatchObject({
      ingresos: 2000, // la nómina pendiente ya está en los previstos
      gastado: 850,
      fijosPendientes: 15,
      ritmoDiario: 10, // 150 € variables / 15 días
      diasQuedan: 16,
      variableProyectado: 160,
      ahorroPrevisto: 400, // 100 apartados + 300 pendientes
      saldoFinal: 575,
      ritmoParaCuadrar: null,
    });
  });

  it('si sale negativo, calcula el gasto diario para cuadrar', () => {
    const cuatro = [11, 12, 13, 14].map((d) => gasto(100, 'ocio', `2026-10-${d}`));
    const p = prevision(usuario, limites, [...base, ...cuatro], [meta], recs, HOY);
    expect(p.saldoFinal).toBeCloseTo(-251.67, 1);
    expect(p.ritmoParaCuadrar).toBeCloseTo(335 / 16, 2);
  });

  it('un gasto extraordinario cuenta como gastado pero no marca el ritmo', () => {
    const p = prevision(usuario, limites, [...base, gasto(1234.56, 'hogar', '2026-10-14')], [meta], recs, HOY);
    expect(p.gastado).toBeCloseTo(2084.56, 2);
    expect(p.ritmoDiario).toBe(10); // igual que sin el sofá
  });

  it('a principio de mes mezcla el ritmo real con el presupuesto diario', () => {
    const p = prevision(usuario, limites, [gasto(30, 'comida', '2026-10-02')], [], [], new Date(2026, 9, 3, 12));
    expect(p.ritmoDiario).toBeCloseTo(0.3 * 10 + 0.7 * 15, 2);
  });
});

describe('racha', () => {
  it('cuenta los días seguidos dentro del presupuesto diario, ignorando los fijos automáticos', () => {
    const movs = [
      gasto(10, 'comida', '2026-10-15'),
      gasto(14, 'ocio', '2026-10-13'),
      gasto(300, 'comida', '2026-10-14', { recurrenteId: 'x' }),
      gasto(20, 'comida', '2026-10-12'),
    ];
    expect(racha(movs, limites, usuario, HOY)).toBe(3);
    expect(racha([...movs, gasto(6, 'ocio', '2026-10-15')], limites, usuario, HOY)).toBe(0); // hoy ya 16 > 15
  });
  it('no cuenta días anteriores al alta', () => {
    expect(racha([], limites, { ...usuario, creadoEn: '2026-10-14T08:00:00Z' }, HOY)).toBe(2);
  });
});

describe('evolucionMensual', () => {
  it('meses desde el alta con ingresos, gastos y ahorro', () => {
    const movs = [...base, gasto(500, 'comida', '2026-09-10')];
    const ev = evolucionMensual(movs, [{ ...meta, aportaciones: [...meta.aportaciones, { id: 'b', fecha: '2026-09-30', importe: 250 }] }], usuario, HOY);
    expect(ev.map((m) => [m.mes, m.ingresos, m.gastos, m.ahorrado])).toEqual([
      ['2026-09', 2000, 500, 250],
      ['2026-10', 2000, 850, 100],
    ]);
  });
});

describe('calendarioMes', () => {
  it('semanas de lunes a domingo con nivel según el presupuesto diario', () => {
    const movs = [gasto(5, 'comida', '2026-10-01'), gasto(15, 'comida', '2026-10-02'), gasto(20, 'ocio', '2026-10-05'), gasto(40, 'ocio', '2026-10-06'), gasto(700, 'vivienda', '2026-10-07')];
    const semanas = calendarioMes(movs, limites, HOY, HOY);
    expect(semanas).toHaveLength(5);
    expect(semanas[0].slice(0, 3)).toEqual([null, null, null]); // el 1 de octubre de 2026 es jueves
    const dia = (d: number) => semanas.flat().find((c) => c?.dia === d)!;
    expect([1, 2, 5, 6, 7, 8].map((d) => dia(d).nivel)).toEqual([1, 2, 3, 4, 0, 0]);
    expect(dia(7)).toMatchObject({ variable: 0, total: 700, movimientos: 1 });
    expect(dia(15).futuro).toBe(false);
    expect(dia(16).futuro).toBe(true);
  });
});

describe('consejos', () => {
  it('detecta una categoría disparada y los gastos hormiga, como mucho 3 y los avisos primero', () => {
    const hormiga = Array.from({ length: 8 }, (_, i) => gasto(2.5, 'comida', `2026-10-${String(i + 3).padStart(2, '0')}`));
    const movs = [...base, ...hormiga, gasto(90, 'restaurantes', '2026-10-10'), gasto(40, 'restaurantes', '2026-09-08')];
    const c = consejos({ usuario, limites, movs, metas: [meta], recs, ahora: HOY });
    expect(c.length).toBeLessThanOrEqual(3);
    expect(c[0]).toMatchObject({ id: 'categoria', tono: 'aviso' });
    expect(c[0].texto).toContain('Comer fuera');
    expect(c.map((x) => x.id)).toContain('hormiga');
  });

  it('avisa si hace días que no se apunta nada', () => {
    const c = consejos({ usuario, limites, movs: [gasto(10, 'comida', '2026-10-10')], metas: [], recs: [], ahora: HOY });
    expect(c.find((x) => x.id === 'sin-apuntar')?.texto).toContain('5 días');
  });
});
