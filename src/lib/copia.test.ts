import { describe, expect, it } from 'vitest';
import type { Usuario } from '../types';
import { crearCopia, leerCopia, type DatosCopia } from './copia';

const usuario: Usuario = {
  id: 'u',
  nombre: 'Ana',
  moneda: 'EUR',
  ingresosNetosMensuales: 2000,
  perfilGasto: 'equilibrado',
  onboardingCompletado: true,
  creadoEn: '2026-09-01T09:00:00Z',
  actualizadoEn: '2026-09-01T09:00:00Z',
};

const datos: DatosCopia = {
  usuario,
  diagnostico: null,
  metas: [
    {
      id: 'm',
      nombre: 'Viaje',
      emoji: '✈️',
      importeObjetivo: 3000,
      importeInicial: 100,
      fechaInicio: '2026-09-01',
      fechaLimite: '2027-09-01',
      aporteMensualPlanificado: 200,
      aportaciones: [{ id: 'a', fecha: '2026-09-02', importe: 50 }],
      principal: true,
      archivada: false,
      creadoEn: '2026-09-01T09:00:00Z',
      actualizadoEn: '2026-09-02T09:00:00Z',
    },
  ],
  limites: [{ categoria: 'comida', mensual: 250, semanal: 58, umbralAviso: 0.8 }],
  recurrentes: [{ id: 'r', tipo: 'gasto', importe: 12.99, categoria: 'suscripciones', dia: 15, desde: '2026-09-01', activo: true, creadoEn: '2026-09-01T09:00:00Z' }],
  categorias: { personalizadas: [{ id: 'cat-x', nombre: 'Café', emoji: '☕', color: '#000', clase: 'gasto', tipo: 'variable', personalizada: true }], ocultas: ['mascotas'] },
  ajustes: { redondeo: true, cierres: ['2026-09'], privado: false, urlSincronizacion: 'https://x', bloqueo: { hash: 'h', sal: 's', minutos: 1 } },
  movimientos: [
    { id: '1', tipo: 'gasto', importe: 2.2, categoria: 'comida', fecha: '2026-10-01', creadoEn: '2026-10-01T08:00:00Z', actualizadoEn: '2026-10-01T08:00:00Z' },
    { id: '2', tipo: 'ingreso', importe: 2000, categoria: 'nomina', fecha: '2026-10-01', creadoEn: '2026-10-01T08:00:00Z', actualizadoEn: '2026-10-01T08:00:00Z' },
  ],
};

describe('copia de seguridad', () => {
  it('ida y vuelta sin perder datos; el código y la sincronización no viajan', () => {
    const copia = crearCopia(datos);
    expect(copia).toMatchObject({ app: 'hucha', version: 2 });
    const leida = leerCopia(JSON.stringify(copia));
    expect(leida).toEqual({ ...datos, ajustes: { redondeo: true, cierres: ['2026-09'], privado: false } });
  });

  it('acepta copias de la primera versión (meta única y «gastos»)', () => {
    const v1 = {
      usuario,
      meta: { id: 'm', nombre: 'Viaje', importeObjetivo: 3000, aportaciones: [] },
      gastos: [{ id: 'g', importe: 5, categoria: 'ocio', fecha: '2026-08-01' }],
    };
    const d = leerCopia(JSON.stringify(v1));
    expect(d.movimientos).toEqual([
      { id: 'g', importe: 5, categoria: 'ocio', fecha: '2026-08-01', tipo: 'gasto', creadoEn: '2026-08-01T12:00:00.000Z', actualizadoEn: expect.any(String) },
    ]);
    // A la meta le faltaban campos: se completan para que la app no falle al calcularla.
    expect(d.metas[0]).toMatchObject({ id: 'm', principal: true, emoji: '🐷', importeInicial: 0, aporteMensualPlanificado: 0, aportaciones: [] });
    expect(d.metas[0].fechaInicio).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(d.metas[0].fechaLimite > d.metas[0].fechaInicio).toBe(true);
    expect(d.limites).toEqual([]);
    expect(d.categorias).toEqual({ personalizadas: [], ocultas: [] });
  });

  it('descarta movimientos mal formados y rechaza archivos que no son copias', () => {
    const d = leerCopia(JSON.stringify({ usuario, movimientos: [{ id: 'ok', importe: 3, categoria: 'ocio', fecha: '2026-10-01' }, { id: 'mal', importe: -3, categoria: 'ocio', fecha: '2026-10-01' }, { importe: 3 }] }));
    expect(d.movimientos.map((m) => m.id)).toEqual(['ok']);
    const r = leerCopia(
      JSON.stringify({
        usuario,
        recurrentes: [{ id: 'r', importe: 10, categoria: 'ocio', dia: 40 }, { id: 'malo', importe: 0, categoria: 'ocio' }],
        limites: [{ categoria: 'ocio', mensual: 100 }],
        metas: [{ id: 'sin-objetivo', nombre: 'X' }],
      }),
    );
    expect(r.recurrentes).toEqual([expect.objectContaining({ id: 'r', tipo: 'gasto', dia: 31, activo: true })]);
    expect(r.limites).toEqual([{ categoria: 'ocio', mensual: 100, semanal: 0, umbralAviso: 0.8 }]);
    expect(r.metas).toEqual([]);
    expect(() => leerCopia('no es json')).toThrow('no es JSON');
    expect(() => leerCopia('{"hola":1}')).toThrow('usuario');
  });
});
