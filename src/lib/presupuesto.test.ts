import { describe, expect, it } from 'vitest';
import type { Limite, Meta, Movimiento, Recurrente, TipoMovimiento, Usuario } from '../types';
import {
  ahorroPlanificado,
  alertasRelevantes,
  cierreMesAnterior,
  comparativaMensual,
  estadoMeta,
  gastoPorDia,
  impactoGasto,
  ingresosDelMes,
  metaPrincipal,
  movimientosFrecuentes,
  nivelDe,
  proximosRecurrentes,
  resumenDashboard,
} from './presupuesto';

const mov = (importe: number, categoria: string, fecha: string, id = `${categoria}-${fecha}-${importe}`, tipo: TipoMovimiento = 'gasto'): Movimiento => ({
  id,
  tipo,
  importe,
  categoria,
  fecha,
  creadoEn: '2026-10-01T10:00:00Z',
  actualizadoEn: '2026-10-01T10:00:00Z',
});
const ingreso = (importe: number, categoria: string, fecha: string) => mov(importe, categoria, fecha, `i-${categoria}-${fecha}`, 'ingreso');

const limites: Limite[] = [
  { categoria: 'vivienda', mensual: 700, semanal: 0, umbralAviso: 0.8 },
  { categoria: 'comida', mensual: 250, semanal: 58, umbralAviso: 0.8 },
  { categoria: 'ocio', mensual: 200, semanal: 46, umbralAviso: 0.8 },
  { categoria: 'suscripciones', mensual: 30, semanal: 0, umbralAviso: 0.8 },
  { categoria: 'imprevistos', mensual: 100, semanal: 23, umbralAviso: 0.8 },
];

// martes 6 de octubre de 2026 → semana del lunes 5 al domingo 11
const HOY = new Date(2026, 9, 6, 12);

const usuario: Usuario = {
  id: 'u',
  nombre: 'Ana',
  moneda: 'EUR',
  ingresosNetosMensuales: 2000,
  perfilGasto: 'equilibrado',
  onboardingCompletado: true,
  creadoEn: '2026-08-20T10:00:00Z',
  actualizadoEn: '',
};
const meta: Meta = {
  id: 'm',
  nombre: 'Viaje',
  emoji: '✈️',
  importeObjetivo: 3000,
  importeInicial: 600,
  fechaInicio: '2026-10-01',
  fechaLimite: '2027-10-01',
  aporteMensualPlanificado: 400,
  aportaciones: [{ id: 'a', fecha: '2026-10-02', importe: 400 }],
  principal: true,
  creadoEn: '',
  actualizadoEn: '',
};

describe('nivelDe', () => {
  it('umbrales 80 % y 100 %', () => {
    expect(nivelDe(79, 100)).toBe('ok');
    expect(nivelDe(80, 100)).toBe('aviso');
    expect(nivelDe(100, 100)).toBe('excedido');
    expect(nivelDe(1, 0)).toBe('excedido');
    expect(nivelDe(0, 0)).toBe('ok');
  });
});

describe('impactoGasto / alertasRelevantes', () => {
  const movs = [mov(30, 'ocio', '2026-10-05'), mov(100, 'ocio', '2026-10-02'), ingreso(500, 'ventas', '2026-10-05')];

  it('avisa al cruzar el 80 % semanal', () => {
    const imp = impactoGasto(movs, limites, { tipo: 'gasto', importe: 8, categoria: 'ocio', fecha: '2026-10-06' });
    const semanal = imp.find((a) => a.periodo === 'semanal')!;
    expect(semanal.gastado).toBe(38); // el gasto del día 2 es de la semana anterior
    expect(semanal.nivel).toBe('aviso');
    expect(alertasRelevantes(imp).map((a) => a.periodo)).toEqual(['semanal']);
  });

  it('marca excedido y el exceso al pasar del 100 %', () => {
    const imp = impactoGasto(movs, limites, { tipo: 'gasto', importe: 80, categoria: 'ocio', fecha: '2026-10-06' });
    const [primera] = alertasRelevantes(imp);
    expect(primera.nivel).toBe('excedido');
    expect(primera.periodo).toBe('semanal');
    expect(primera.restante).toBe(-64);
  });

  it('al editar no cuenta el movimiento dos veces', () => {
    const imp = impactoGasto(movs, limites, { id: 'ocio-2026-10-05-30', tipo: 'gasto', importe: 30, categoria: 'ocio', fecha: '2026-10-05' });
    expect(imp.find((a) => a.periodo === 'semanal')!.gastado).toBe(30);
  });

  it('los ingresos y las categorías sin límite no generan alertas', () => {
    expect(impactoGasto(movs, limites, { tipo: 'ingreso', importe: 900, categoria: 'ocio', fecha: '2026-10-06' })).toEqual([]);
    expect(impactoGasto(movs, limites, { tipo: 'gasto', importe: 900, categoria: 'ropa', fecha: '2026-10-06' })).toEqual([]);
  });
});

describe('ingresosDelMes', () => {
  it('usa los previstos mientras no se registre la nómina, y suma los extras', () => {
    const r = ingresosDelMes([ingreso(150, 'ventas', '2026-10-03')], 2000, HOY);
    expect(r).toMatchObject({ registradoHabitual: false, extra: 150, efectivos: 2150 });
  });

  it('la nómina registrada sustituye a los previstos', () => {
    const r = ingresosDelMes([ingreso(1950, 'nomina', '2026-10-01'), ingreso(100, 'freelance', '2026-10-04'), ingreso(999, 'nomina', '2026-09-28')], 2000, HOY);
    expect(r).toMatchObject({ registradoHabitual: true, habituales: 1950, extra: 100, efectivos: 2050 });
  });
});

describe('gastoPorDia', () => {
  it('7 días terminando hoy, solo gastos variables', () => {
    const movs = [mov(700, 'vivienda', '2026-10-06'), mov(12, 'comida', '2026-10-06'), mov(8, 'comida', '2026-10-06', 'otro'), mov(5, 'ocio', '2026-09-30'), ingreso(80, 'ventas', '2026-10-06')];
    const dias = gastoPorDia(movs, HOY);
    expect(dias[0].fecha).toBe('2026-09-30');
    expect(dias[6]).toEqual({ fecha: '2026-10-06', total: 20 });
    expect(gastoPorDia(movs, HOY, 7, false)[6].total).toBe(720);
  });
});

describe('movimientosFrecuentes', () => {
  it('agrupa por categoría y nota, por tipo, con el último importe', () => {
    const movs = [
      { ...mov(1.8, 'comida', '2026-10-01', 'a'), nota: 'Café' },
      { ...mov(2, 'comida', '2026-10-05', 'b'), nota: 'café ' },
      { ...mov(1.9, 'comida', '2026-10-03', 'c'), nota: 'Café' },
      { ...mov(12, 'ocio', '2026-10-06', 'd'), nota: 'Cine' },
      { ...ingreso(300, 'freelance', '2026-10-02'), nota: 'Web cliente' },
    ];
    const f = movimientosFrecuentes(movs);
    expect(f).toHaveLength(2);
    expect(f[0]).toMatchObject({ categoria: 'comida', veces: 3, importe: 2 });
    expect(movimientosFrecuentes(movs, 'ingreso')).toEqual([expect.objectContaining({ nota: 'Web cliente', importe: 300 })]);
  });
});

describe('comparativaMensual', () => {
  it('compara cada categoría con el mes anterior', () => {
    const movs = [mov(100, 'comida', '2026-10-02'), mov(80, 'comida', '2026-09-10'), mov(40, 'ropa', '2026-10-03'), mov(50, 'ocio', '2026-09-20')];
    const c = comparativaMensual(movs, HOY);
    expect(c.map((x) => x.categoria)).toEqual(['comida', 'ropa', 'ocio']);
    expect(c[0]).toMatchObject({ actual: 100, anterior: 80, diferencia: 20 });
    expect(c[0].variacion).toBeCloseTo(0.25);
    expect(c[1].variacion).toBeNull(); // nueva este mes
    expect(c[2]).toMatchObject({ actual: 0, anterior: 50, variacion: -1 });
  });
});

describe('huchas', () => {
  it('meta principal, ahorro planificado y retiradas', () => {
    const otra: Meta = { ...meta, id: 'n', principal: false, aporteMensualPlanificado: 50, aportaciones: [{ id: 'x', fecha: '2026-10-03', importe: -100 }] };
    const conseguida: Meta = { ...meta, id: 'c', principal: false, importeObjetivo: 500 };
    expect(metaPrincipal([otra, meta])?.id).toBe('m');
    expect(metaPrincipal([{ ...meta, archivada: true }, otra])?.id).toBe('n');
    expect(ahorroPlanificado([meta, otra, conseguida], HOY)).toBe(450); // la conseguida no cuenta
    expect(estadoMeta(otra, HOY).ahorrado).toBe(500);
  });

  it('va por detrás del plan y calcula lo necesario al mes', () => {
    const e = estadoMeta({ ...meta, aportaciones: [] }, new Date(2026, 11, 15));
    // 2 meses cumplidos (1 oct → 15 dic): 600 + 2 × 400
    expect(e.esperadoHoy).toBe(1400);
    expect(e.diferencia).toBe(-800);
    expect(e.enCamino).toBe(false);
    expect(e.necesarioAlMes).toBeCloseTo(2400 / 10, 0);
  });
});

describe('cierreMesAnterior', () => {
  const movs = [
    mov(700, 'vivienda', '2026-09-01'),
    mov(300, 'comida', '2026-09-10'),
    mov(100, 'ocio', '2026-09-20'),
    ingreso(150, 'ventas', '2026-09-15'),
  ];
  const conAportacion: Meta = { ...meta, aportaciones: [{ id: 's', fecha: '2026-09-28', importe: 400 }] };

  it('ingresos − gastos − apartado del mes anterior', () => {
    expect(cierreMesAnterior(movs, [conAportacion], usuario, HOY)).toEqual({ mes: '2026-09', ingresos: 2150, gastos: 1100, ahorrado: 400, sobrante: 650 });
  });

  it('no aparece si la app se empezó a usar con el mes avanzado o hay pocos datos', () => {
    expect(cierreMesAnterior(movs, [], { ...usuario, creadoEn: '2026-09-20T10:00:00Z' }, HOY)).toBeNull();
    expect(cierreMesAnterior(movs.slice(0, 2), [], usuario, HOY)).toBeNull();
  });
});

describe('proximosRecurrentes', () => {
  const rec = (id: string, dia: number, ultima?: string): Recurrente => ({
    id,
    tipo: 'gasto',
    importe: 10,
    categoria: 'suscripciones',
    dia,
    desde: '2026-01-01',
    ultima,
    activo: true,
    creadoEn: '',
  });
  it('lista los de los próximos días ordenados', () => {
    const p = proximosRecurrentes([rec('a', 15, '2026-09-15'), rec('b', 7, '2026-09-07'), rec('c', 1, '2026-10-01'), { ...rec('d', 8), activo: false }], HOY, 10);
    expect(p.map((x) => [x.recurrente.id, x.fecha, x.dias])).toEqual([
      ['b', '2026-10-07', 1],
      ['a', '2026-10-15', 9],
    ]);
  });
});

describe('resumenDashboard', () => {
  it('disponible, restante diario y meta', () => {
    const movs = [mov(700, 'vivienda', '2026-10-01'), mov(50, 'comida', '2026-10-03'), mov(20, 'ocio', '2026-10-06')];
    const r = resumenDashboard(usuario, limites, movs, [meta], HOY);
    expect(r.gastadoMes).toBe(770);
    expect(r.ingresos.efectivos).toBe(2000);
    expect(r.disponibleMes).toBe(2000 - 400 - 770);
    // variables: (250−50) + (200−20) + 100 = 480; quedan 26 días (6..31)
    expect(r.diasRestantes).toBe(26);
    expect(r.restanteVariable).toBe(480);
    expect(r.presupuestoVariable).toBe(550);
    expect(r.restanteDiario).toBeCloseTo(480 / 26, 2);
    expect(r.meta!.ahorrado).toBe(1000);
    expect(r.meta!.enCamino).toBe(true);
  });

  it('pasarse en una fija o gastar en categorías sin límite resta del día a día', () => {
    const r = resumenDashboard(usuario, limites, [mov(760, 'vivienda', '2026-10-01'), mov(45, 'ropa', '2026-10-02')], [meta], HOY);
    expect(r.gastadoSinLimite).toBe(45);
    expect(r.restanteVariable).toBe(550 - 60 - 45);
  });

  it('los ingresos extra aumentan el disponible', () => {
    const r = resumenDashboard(usuario, limites, [ingreso(300, 'paga_extra', '2026-10-02')], [], HOY);
    expect(r.ahorroPlanificado).toBe(0);
    expect(r.disponibleMes).toBe(2300);
  });
});
