/**
 * Algoritmo de recomendación financiera.
 *
 * Parte de las respuestas del onboarding y genera un plan de ahorro con presupuesto por categoría:
 *
 *  1. Regla base según el peso de los gastos fijos sobre los ingresos:
 *       ≤ 50 % → 50/30/20 · ≤ 60 % → 60/20/20 · ≤ 70 % → 70/20/10 · > 70 % → 80/10/10
 *  2. Tasa de ahorro = la de la regla ± ajuste por perfil de gasto (mínimo 5 %).
 *  3. Ahorro que exige el objetivo = (importe − ya ahorrado) / plazo.
 *  4. Techo sostenible = margen − colchón de imprevistos (5 % de ingresos) − ocio mínimo del perfil.
 *     Un plan que deja el ocio a cero se abandona; por eso se limita.
 *  5. Ahorro recomendado = máx(regla, capacidad declarada, lo que pide el objetivo), con el techo sostenible.
 *  6. Viabilidad = ahorro recomendado / ahorro necesario.
 *  7. Lo que queda tras fijos y ahorro se reparte entre imprevistos y ocio según el perfil.
 *  8. Se nombra el reparto resultante (si coincide con una regla conocida ±3 puntos) y se generan avisos.
 */
import type {
  Aviso,
  Diagnostico,
  Limite,
  NombreRegla,
  PerfilGasto,
  Reparto,
  RespuestasOnboarding,
  Viabilidad,
} from '../types';
import { aISO, sumarMeses } from './fechas';
import { categoria } from './categorias';
import { centimos, euros, nuevoId, porcentaje } from './formato';

type ReglaConocida = Exclude<NombreRegla, 'personalizada'>;

export const REGLAS: Record<ReglaConocida, Reparto> = {
  '50/30/20': { necesidades: 0.5, deseos: 0.3, ahorro: 0.2 },
  '60/20/20': { necesidades: 0.6, deseos: 0.2, ahorro: 0.2 },
  '70/20/10': { necesidades: 0.7, deseos: 0.2, ahorro: 0.1 },
  '80/10/10': { necesidades: 0.8, deseos: 0.1, ahorro: 0.1 },
};

export const PERFILES: Record<
  PerfilGasto,
  { titulo: string; descripcion: string; emoji: string; ajusteAhorro: number; ocioMinimo: number; pesoImprevistos: number }
> = {
  ahorrador: {
    titulo: 'Ahorrador',
    descripcion: 'Me cuesta poco no gastar y prefiero tener colchón.',
    emoji: '🐢',
    ajusteAhorro: 0.05,
    ocioMinimo: 0.03,
    pesoImprevistos: 0.35,
  },
  equilibrado: {
    titulo: 'Equilibrado',
    descripcion: 'Ahorro algo, pero también me doy caprichos.',
    emoji: '⚖️',
    ajusteAhorro: 0,
    ocioMinimo: 0.05,
    pesoImprevistos: 0.25,
  },
  disfrutador: {
    titulo: 'Disfrutón',
    descripcion: 'Gasto con facilidad en planes, compras y salir.',
    emoji: '🎈',
    ajusteAhorro: -0.05,
    ocioMinimo: 0.08,
    pesoImprevistos: 0.2,
  },
};

/** Mínimo para imprevistos, en proporción de los ingresos. */
export const COLCHON_IMPREVISTOS = 0.05;
export const TASA_AHORRO_MINIMA = 0.05;
/** Margen de tolerancia para reconocer una regla conocida en el reparto final. */
const TOLERANCIA_REGLA = 0.03;

export function elegirReglaBase(ratioFijos: number): ReglaConocida {
  if (ratioFijos <= 0.5) return '50/30/20';
  if (ratioFijos <= 0.6) return '60/20/20';
  if (ratioFijos <= 0.7) return '70/20/10';
  return '80/10/10';
}

export function nombrarReparto(r: Reparto): NombreRegla {
  for (const [nombre, ref] of Object.entries(REGLAS) as [ReglaConocida, Reparto][]) {
    if (
      Math.abs(r.necesidades - ref.necesidades) <= TOLERANCIA_REGLA &&
      Math.abs(r.deseos - ref.deseos) <= TOLERANCIA_REGLA &&
      Math.abs(r.ahorro - ref.ahorro) <= TOLERANCIA_REGLA
    ) {
      return nombre;
    }
  }
  return 'personalizada';
}

const multiploDe5Abajo = (n: number) => Math.max(0, Math.floor(n / 5) * 5);
const multiploDe5Arriba = (n: number) => Math.max(0, Math.ceil(n / 5) * 5);

export function calcularViabilidad(ahorro: number, necesario: number, pendiente: number, margen: number): Viabilidad {
  if (margen <= 0) return 'sin-margen';
  if (pendiente <= 0) return 'holgada';
  if (ahorro <= 0) return 'inviable';
  const r = ahorro / necesario;
  if (r >= 1.15) return 'holgada';
  if (r >= 0.995) return 'viable';
  if (r >= 0.8) return 'ajustada';
  return 'inviable';
}

export function generarDiagnostico(r: RespuestasOnboarding, ahora = new Date()): Diagnostico {
  const ingresos = Math.max(0, r.ingresosNetos);
  const { vivienda, comida, suscripciones } = r.gastosFijos;
  const transporte = r.gastosFijos.transporte ?? 0;
  const fijos = centimos(vivienda + comida + suscripciones + transporte);
  const margen = centimos(ingresos - fijos);
  const ratioFijos = ingresos > 0 ? fijos / ingresos : 1;
  const perfil = PERFILES[r.perfilGasto];
  const avisos: Aviso[] = [];

  // 1. Regla base
  const nombreBase = elegirReglaBase(ratioFijos);
  const repartoBase = REGLAS[nombreBase];

  // 2. Ahorro según regla y perfil
  const tasa = Math.max(TASA_AHORRO_MINIMA, repartoBase.ahorro + perfil.ajusteAhorro);
  const ahorroRegla = ingresos * tasa;

  // 3. Ahorro que exige el objetivo
  const { importe, ahorroActual, nombre: nombreMeta } = r.objetivo;
  const plazo = Math.max(1, Math.round(r.objetivo.plazoMeses));
  const pendiente = Math.max(0, centimos(importe - ahorroActual));
  const ahorroNecesario = centimos(pendiente / plazo);

  // 4. Techo sostenible
  const colchonImprevistos = ingresos * COLCHON_IMPREVISTOS;
  const ocioMinimo = ingresos * perfil.ocioMinimo;
  const maxSostenible = multiploDe5Abajo(margen - colchonImprevistos - ocioMinimo);

  // 5. Ahorro recomendado
  const capacidad = Math.max(0, r.capacidadAhorroEstimada);
  let ahorro = Math.max(ahorroRegla, capacidad, pendiente > 0 ? ahorroNecesario : 0);
  ahorro = Math.min(multiploDe5Arriba(ahorro), maxSostenible);
  if (margen <= 0) ahorro = 0;

  // 6. Viabilidad y fecha estimada
  const viabilidad = calcularViabilidad(ahorro, ahorroNecesario, pendiente, margen);
  const mesesEstimados = pendiente <= 0 ? 0 : ahorro > 0 ? Math.ceil(pendiente / ahorro) : null;
  const fechaObjetivoEstimada = mesesEstimados === null ? null : aISO(sumarMeses(ahora, mesesEstimados));

  // 7. Reparto del resto entre imprevistos y ocio
  const libre = Math.max(0, margen - ahorro);
  const imprevistos = Math.round(Math.min(libre, Math.max(colchonImprevistos, libre * perfil.pesoImprevistos)));
  const ocio = Math.max(0, Math.round(libre - imprevistos));

  const presupuestoMensual: Record<string, number> = {
    vivienda: centimos(vivienda),
    comida: centimos(comida),
    ...(transporte > 0 ? { transporte: centimos(transporte) } : {}),
    suscripciones: centimos(suscripciones),
    ocio,
    imprevistos,
  };

  // 8. Reparto resultante
  const repartoFinal: Reparto =
    ingresos > 0
      ? { necesidades: (fijos + imprevistos) / ingresos, deseos: ocio / ingresos, ahorro: ahorro / ingresos }
      : { necesidades: 1, deseos: 0, ahorro: 0 };

  // ── Avisos y recomendaciones ──
  if (margen <= 0) {
    avisos.push({
      tipo: 'alerta',
      texto: `Tus gastos fijos (${euros(fijos)}) igualan o superan tus ingresos (${euros(ingresos)}). Antes de ahorrar hay que recortar fijos: el plan empieza sin ahorro.`,
    });
  } else if (ratioFijos > 0.5) {
    avisos.push({
      tipo: 'consejo',
      texto: `Tus gastos fijos son el ${porcentaje(ratioFijos)} de tus ingresos (lo recomendable es no pasar del 50 %). Partimos de la regla ${nombreBase} en lugar de la 50/30/20.`,
    });
  }

  if (ingresos > 0 && suscripciones > ingresos * 0.05) {
    avisos.push({
      tipo: 'consejo',
      texto: `Las suscripciones suman ${euros(suscripciones)} al mes (${porcentaje(suscripciones / ingresos)} de tus ingresos). Cada 10 € que quites son 120 € al año para tu meta.`,
    });
  }

  if (margen > 0 && capacidad > maxSostenible) {
    avisos.push({
      tipo: 'consejo',
      texto: `Ahorrar ${euros(capacidad)} te dejaría sin margen para ocio e imprevistos. El plan lo limita a ${euros(maxSostenible)} para que sea sostenible.`,
    });
  } else if (capacidad > 0 && ahorro > capacidad + 5) {
    avisos.push({
      tipo: 'info',
      texto: `El plan te propone ahorrar ${euros(ahorro)} al mes, ${euros(ahorro - capacidad)} más de lo que estimabas. Programa una transferencia automática el día que cobres.`,
    });
  }

  if (pendiente > 0 && margen > 0) {
    if (viabilidad === 'inviable' || viabilidad === 'ajustada') {
      const mesesNecesarios = ahorro > 0 ? Math.ceil(pendiente / ahorro) : null;
      const metaAlcanzable = centimos(ahorroActual + ahorro * plazo);
      const opciones = [
        mesesNecesarios ? `ampliar el plazo a ${mesesNecesarios} meses` : null,
        ahorro > 0 ? `reducir la meta a ${euros(metaAlcanzable)}` : null,
        'recortar gastos fijos',
      ].filter(Boolean);
      avisos.push({
        tipo: viabilidad === 'inviable' ? 'alerta' : 'consejo',
        texto: `Para «${nombreMeta}» en ${plazo} meses harían falta ${euros(ahorroNecesario)} al mes y tu ahorro sostenible es ${euros(ahorro)}. Opciones: ${opciones.join(', ')}.`,
      });
    } else if (mesesEstimados !== null && mesesEstimados < plazo) {
      avisos.push({
        tipo: 'info',
        texto: `A este ritmo alcanzarás «${nombreMeta}» en ${mesesEstimados} ${mesesEstimados === 1 ? 'mes' : 'meses'}, antes del plazo de ${plazo}.`,
      });
    }
  }

  if (imprevistos > 0) {
    avisos.push({
      tipo: 'info',
      texto: `Reservas ${euros(imprevistos)} al mes para imprevistos. Si a fin de mes no los has usado, pásalos a tu meta.`,
    });
  }

  return {
    id: nuevoId(),
    creadoEn: ahora.toISOString(),
    respuestas: r,
    gastosFijosTotales: fijos,
    margenMensual: margen,
    ratioFijos,
    reglaBase: { nombre: nombreBase, reparto: repartoBase },
    reglaResultante: { nombre: nombrarReparto(repartoFinal), reparto: repartoFinal },
    ahorroMensualRecomendado: ahorro,
    ahorroNecesarioObjetivo: ahorroNecesario,
    ahorroMaximoSostenible: maxSostenible,
    mesesEstimados,
    fechaObjetivoEstimada,
    viabilidad,
    presupuestoMensual,
    avisos,
  };
}

/** Semanas medias por mes: 52 / 12. */
export const SEMANAS_POR_MES = 52 / 12;

/**
 * Techos mensuales y semanales a partir del presupuesto del diagnóstico.
 * El resto de categorías (ropa, salud…) no tienen techo propio: lo que se gaste en ellas
 * sale del margen del día a día.
 */
export function limitesDesdeDiagnostico(d: Diagnostico): Limite[] {
  return Object.entries(d.presupuestoMensual).map(([id, mensual]) => ({
    categoria: id,
    mensual,
    semanal: categoria(id).tipo === 'variable' ? Math.round(mensual / SEMANAS_POR_MES) : 0,
    umbralAviso: 0.8,
  }));
}
