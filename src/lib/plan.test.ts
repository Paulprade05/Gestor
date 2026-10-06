import { describe, expect, it } from 'vitest';
import type { RespuestasOnboarding } from '../types';
import { generarDiagnostico, limitesDesdeDiagnostico, nombrarReparto } from './plan';

const base: RespuestasOnboarding = {
  ingresosNetos: 2000,
  gastosFijos: { vivienda: 700, comida: 250, suscripciones: 30 },
  perfilGasto: 'equilibrado',
  capacidadAhorroEstimada: 300,
  objetivo: { nombre: 'Viaje', importe: 3000, plazoMeses: 12, ahorroActual: 600 },
};
const HOY = new Date(2026, 9, 6);

describe('generarDiagnostico', () => {
  it('fijos ≤ 50 % → regla 50/30/20 y ahorro del 20 %', () => {
    const d = generarDiagnostico(base, HOY);
    expect(d.reglaBase.nombre).toBe('50/30/20');
    expect(d.margenMensual).toBe(1020);
    expect(d.ahorroNecesarioObjetivo).toBe(200); // 2400 / 12
    expect(d.ahorroMensualRecomendado).toBe(400); // 20 % de 2000
    expect(d.viabilidad).toBe('holgada');
    expect(d.mesesEstimados).toBe(6);
    expect(d.fechaObjetivoEstimada).toBe('2027-04-06');
  });

  it('el presupuesto + ahorro nunca supera los ingresos', () => {
    for (const perfil of ['ahorrador', 'equilibrado', 'disfrutador'] as const) {
      const d = generarDiagnostico({ ...base, perfilGasto: perfil }, HOY);
      const total = Object.values(d.presupuestoMensual).reduce((s, v) => s + v, 0) + d.ahorroMensualRecomendado;
      expect(total).toBeLessThanOrEqual(base.ingresosNetos + 1);
      expect(d.presupuestoMensual.ocio).toBeGreaterThan(0);
      expect(d.presupuestoMensual.imprevistos).toBeGreaterThanOrEqual(100); // colchón del 5 %
    }
  });

  it('el perfil ahorrador ahorra más que el disfrutón', () => {
    const a = generarDiagnostico({ ...base, perfilGasto: 'ahorrador' }, HOY);
    const d = generarDiagnostico({ ...base, perfilGasto: 'disfrutador' }, HOY);
    expect(a.ahorroMensualRecomendado).toBeGreaterThan(d.ahorroMensualRecomendado);
  });

  it('sube el ahorro para cumplir el plazo si cabe en el margen', () => {
    const d = generarDiagnostico({ ...base, objetivo: { ...base.objetivo, importe: 8000, ahorroActual: 0 } }, HOY);
    expect(d.ahorroNecesarioObjetivo).toBeCloseTo(666.67, 2);
    expect(d.ahorroMensualRecomendado).toBe(670);
    expect(d.viabilidad).toBe('viable');
  });

  it('limita el ahorro al techo sostenible y propone alternativas si no llega', () => {
    const d = generarDiagnostico({ ...base, objetivo: { ...base.objetivo, importe: 20000, ahorroActual: 0 } }, HOY);
    // margen 1020 − 100 imprevistos − 100 ocio mínimo = 820
    expect(d.ahorroMaximoSostenible).toBe(820);
    expect(d.ahorroMensualRecomendado).toBe(820);
    expect(d.viabilidad).toBe('inviable');
    expect(d.avisos.some((a) => a.tipo === 'alerta' && a.texto.includes('ampliar el plazo a 25 meses'))).toBe(true);
  });

  it('fijos altos → regla 70/20/10 o 80/10/10 y aviso', () => {
    const d = generarDiagnostico({ ...base, ingresosNetos: 1400, gastosFijos: { vivienda: 800, comida: 200, suscripciones: 20 } }, HOY);
    expect(d.ratioFijos).toBeCloseTo(0.729, 2);
    expect(d.reglaBase.nombre).toBe('80/10/10');
    expect(d.avisos.some((a) => a.texto.includes('lo recomendable es no pasar del 50 %'))).toBe(true);
  });

  it('sin margen: ahorro 0 y alerta', () => {
    const d = generarDiagnostico({ ...base, ingresosNetos: 900 }, HOY);
    expect(d.viabilidad).toBe('sin-margen');
    expect(d.ahorroMensualRecomendado).toBe(0);
    expect(d.mesesEstimados).toBeNull();
    expect(d.presupuestoMensual.ocio).toBe(0);
  });

  it('respeta una capacidad declarada mayor que la regla si es sostenible', () => {
    const d = generarDiagnostico({ ...base, capacidadAhorroEstimada: 600 }, HOY);
    expect(d.ahorroMensualRecomendado).toBe(600);
  });

  it('meta ya cubierta', () => {
    const d = generarDiagnostico({ ...base, objetivo: { ...base.objetivo, ahorroActual: 3000 } }, HOY);
    expect(d.mesesEstimados).toBe(0);
    expect(d.viabilidad).toBe('holgada');
  });
});

describe('nombrarReparto', () => {
  it('reconoce reglas con tolerancia de 3 puntos', () => {
    expect(nombrarReparto({ necesidades: 0.52, deseos: 0.28, ahorro: 0.2 })).toBe('50/30/20');
    expect(nombrarReparto({ necesidades: 0.62, deseos: 0.23, ahorro: 0.15 })).toBe('personalizada');
  });
});

describe('limitesDesdeDiagnostico', () => {
  it('semanal solo en categorías variables', () => {
    const ls = limitesDesdeDiagnostico(generarDiagnostico(base, HOY));
    const vivienda = ls.find((l) => l.categoria === 'vivienda')!;
    const comida = ls.find((l) => l.categoria === 'comida')!;
    expect(vivienda.semanal).toBe(0);
    expect(comida.semanal).toBe(Math.round(250 / (52 / 12)));
    expect(ls.every((l) => l.umbralAviso === 0.8)).toBe(true);
  });
});
