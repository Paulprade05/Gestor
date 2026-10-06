import { describe, expect, it } from 'vitest';
import type { Recurrente } from '../types';
import { fechaEnMes, generarPendientes, proximaFecha, totalMensual } from './recurrentes';

const base: Recurrente = {
  id: 'alquiler',
  tipo: 'gasto',
  importe: 700,
  categoria: 'vivienda',
  nota: 'Alquiler',
  dia: 1,
  desde: '2026-08-15',
  activo: true,
  creadoEn: '',
};

describe('fechaEnMes', () => {
  it('ajusta al último día en meses cortos', () => {
    expect(fechaEnMes(2027, 1, 31)).toBe('2027-02-28');
    expect(fechaEnMes(2028, 1, 30)).toBe('2028-02-29');
    expect(fechaEnMes(2026, 3, 31)).toBe('2026-04-30');
  });
});

describe('generarPendientes', () => {
  it('genera todas las ocurrencias desde «desde» hasta hoy, sin la anterior a «desde»', () => {
    const { nuevos, actualizados } = generarPendientes([base], new Date(2026, 9, 6));
    expect(nuevos.map((m) => m.fecha)).toEqual(['2026-09-01', '2026-10-01']);
    expect(nuevos[0]).toMatchObject({ id: 'alquiler-2026-09-01', tipo: 'gasto', importe: 700, nota: 'Alquiler', recurrenteId: 'alquiler' });
    expect(actualizados[0].ultima).toBe('2026-10-01');
  });

  it('no repite lo ya generado ni lo futuro', () => {
    expect(generarPendientes([{ ...base, ultima: '2026-10-01' }], new Date(2026, 9, 6)).actualizados).toEqual([]);
    const nomina = { ...base, id: 'n', tipo: 'ingreso' as const, dia: 28, desde: '2026-10-06' };
    expect(generarPendientes([nomina], new Date(2026, 9, 6)).nuevos).toEqual([]);
    expect(generarPendientes([nomina], new Date(2026, 9, 28)).nuevos.map((m) => m.fecha)).toEqual(['2026-10-28']);
  });

  it('ignora los pausados', () => {
    expect(generarPendientes([{ ...base, activo: false }], new Date(2026, 9, 6)).nuevos).toEqual([]);
  });

  it('cruza el cambio de año', () => {
    const r = { ...base, dia: 31, desde: '2026-11-01', ultima: undefined };
    expect(generarPendientes([r], new Date(2027, 1, 28)).nuevos.map((m) => m.fecha)).toEqual(['2026-11-30', '2026-12-31', '2027-01-31', '2027-02-28']);
  });
});

describe('proximaFecha y totalMensual', () => {
  it('próxima ocurrencia pendiente', () => {
    expect(proximaFecha({ ...base, ultima: '2026-10-01' }, new Date(2026, 9, 6))).toBe('2026-11-01');
    expect(proximaFecha({ ...base, dia: 6, ultima: '2026-09-06' }, new Date(2026, 9, 6))).toBe('2026-10-06');
  });
  it('suma solo los activos del tipo', () => {
    expect(totalMensual([base, { ...base, id: 'b', importe: 12.99 }, { ...base, id: 'c', activo: false }], 'gasto')).toBe(712.99);
  });
});
