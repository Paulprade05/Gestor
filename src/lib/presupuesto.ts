/**
 * Cálculos en tiempo real sobre los movimientos: estado de cada límite, alertas al 80 % / 100 %,
 * ingresos del mes, huchas, cierre de mes, comparativas y métricas del dashboard.
 */
import type {
  AlertaLimite,
  CategoriaId,
  EstadoLimite,
  ISODate,
  Limite,
  Meta,
  Movimiento,
  MovimientoNuevo,
  NivelAlerta,
  Periodo,
  Recurrente,
  TipoMovimiento,
  Usuario,
} from '../types';
import { categoria } from './categorias';
import { aISO, deISO, diasDelMes, diasRestantesMes, finMes, finSemana, inicioMes, inicioSemana, mesesEntre, sumarDias } from './fechas';
import { centimos, euros } from './formato';
import { proximaFecha } from './recurrentes';

const ORDEN_NIVEL: Record<NivelAlerta, number> = { ok: 0, aviso: 1, excedido: 2 };

export function nivelDe(gastado: number, limite: number, umbralAviso = 0.8): NivelAlerta {
  if (limite <= 0) return gastado > 0 ? 'excedido' : 'ok';
  const r = gastado / limite;
  if (r >= 1) return 'excedido';
  if (r >= umbralAviso) return 'aviso';
  return 'ok';
}

export function rango(periodo: Periodo, ref: Date): [ISODate, ISODate] {
  return periodo === 'mensual' ? [aISO(inicioMes(ref)), aISO(finMes(ref))] : [aISO(inicioSemana(ref)), aISO(finSemana(ref))];
}

/** Rango del mes anterior al de `ref`. */
export const rangoMesAnterior = (ref: Date) => rango('mensual', new Date(ref.getFullYear(), ref.getMonth() - 1, 1));

/** Suma por categoría de los movimientos de un tipo entre dos fechas (inclusive). Las fechas ISO se comparan como texto. */
export function totalPorCategoria(movs: Movimiento[], desde: ISODate, hasta: ISODate, tipo: TipoMovimiento = 'gasto'): Record<CategoriaId, number> {
  const tot: Record<CategoriaId, number> = {};
  for (const m of movs) if (m.tipo === tipo && m.fecha >= desde && m.fecha <= hasta) tot[m.categoria] = (tot[m.categoria] ?? 0) + m.importe;
  for (const k of Object.keys(tot)) tot[k] = centimos(tot[k]);
  return tot;
}

export const sumar = (r: Record<string, number>) => centimos(Object.values(r).reduce((s, v) => s + v, 0));

export const totalEntre = (movs: Movimiento[], desde: ISODate, hasta: ISODate, tipo: TipoMovimiento) => sumar(totalPorCategoria(movs, desde, hasta, tipo));

function estado(cat: CategoriaId, periodo: Periodo, gastado: number, limite: number, umbral: number): EstadoLimite {
  return {
    categoria: cat,
    periodo,
    gastado,
    limite,
    ratio: limite > 0 ? gastado / limite : gastado > 0 ? Infinity : 0,
    restante: centimos(limite - gastado),
    nivel: nivelDe(gastado, limite, umbral),
  };
}

/**
 * Estado de cada límite para el periodo que contiene `ref`.
 * Los límites semanales a 0 se consideran desactivados y no se devuelven.
 */
export function estadoLimites(movs: Movimiento[], limites: Limite[], periodo: Periodo, ref: Date): EstadoLimite[] {
  const [desde, hasta] = rango(periodo, ref);
  const tot = totalPorCategoria(movs, desde, hasta);
  return limites
    .filter((l) => periodo === 'mensual' || l.semanal > 0)
    .map((l) => estado(l.categoria, periodo, tot[l.categoria] ?? 0, periodo === 'mensual' ? l.mensual : l.semanal, l.umbralAviso));
}

/**
 * Qué pasaría con los límites de la categoría si se guardase `nuevo` (o se editase uno existente).
 * Devuelve el estado mensual y semanal tras el gasto, con el nivel anterior para detectar cruces de umbral.
 * Se usa tanto para la previsualización en el formulario como para las alertas al guardar.
 */
export function impactoGasto(movs: Movimiento[], limites: Limite[], nuevo: MovimientoNuevo): AlertaLimite[] {
  if (nuevo.tipo !== 'gasto') return [];
  const limite = limites.find((l) => l.categoria === nuevo.categoria);
  if (!limite || !(nuevo.importe > 0)) return [];
  const resto = nuevo.id ? movs.filter((g) => g.id !== nuevo.id) : movs;
  const ref = deISO(nuevo.fecha);
  const periodos: Periodo[] = limite.semanal > 0 ? ['mensual', 'semanal'] : ['mensual'];

  return periodos.map((periodo) => {
    const [desde, hasta] = rango(periodo, ref);
    const antes = totalPorCategoria(resto, desde, hasta)[nuevo.categoria] ?? 0;
    const despues = centimos(antes + nuevo.importe);
    const tope = periodo === 'mensual' ? limite.mensual : limite.semanal;
    return { ...estado(nuevo.categoria, periodo, despues, tope, limite.umbralAviso), nivelAnterior: nivelDe(antes, tope, limite.umbralAviso) };
  });
}

/** Solo las alertas que merecen avisar: cruzan un umbral, o el límite ya estaba excedido. */
export function alertasRelevantes(impacto: AlertaLimite[]): AlertaLimite[] {
  return impacto
    .filter((a) => a.nivel !== 'ok' && (ORDEN_NIVEL[a.nivel] > ORDEN_NIVEL[a.nivelAnterior] || a.nivel === 'excedido'))
    .sort((a, b) => ORDEN_NIVEL[b.nivel] - ORDEN_NIVEL[a.nivel] || (a.periodo === 'semanal' ? -1 : 1));
}

export function textoAlerta(a: AlertaLimite): string {
  const c = categoria(a.categoria);
  const periodo = a.periodo === 'mensual' ? 'este mes' : 'esta semana';
  if (a.nivel === 'excedido') {
    return a.restante < 0 ? `${c.nombre}: te pasas ${euros(-a.restante)} del límite ${periodo}` : `${c.nombre}: has agotado el límite ${periodo}`;
  }
  return `${c.nombre}: llevas el ${Math.round(a.ratio * 100)} % del límite ${periodo}`;
}

// ─── Ingresos ────────────────────────────────────────────────────────────────

export interface IngresosMes {
  /** Ingresos habituales previstos (del perfil). */
  previstos: number;
  /** Ingresos habituales registrados este mes (nómina, pensión…). */
  habituales: number;
  /** Ingresos extra registrados este mes. */
  extra: number;
  /** Lo que cuenta para el mes: los habituales registrados (o los previstos si aún no hay) + extras. */
  efectivos: number;
  registradoHabitual: boolean;
}

export function ingresosDelMes(movs: Movimiento[], previstos: number, ref: Date): IngresosMes {
  const [desde, hasta] = rango('mensual', ref);
  let habituales = 0;
  let extra = 0;
  for (const m of movs) {
    if (m.tipo !== 'ingreso' || m.fecha < desde || m.fecha > hasta) continue;
    if (categoria(m.categoria).tipo === 'fija') habituales += m.importe;
    else extra += m.importe;
  }
  const registradoHabitual = habituales > 0;
  return {
    previstos,
    habituales: centimos(habituales),
    extra: centimos(extra),
    efectivos: centimos((registradoHabitual ? habituales : previstos) + extra),
    registradoHabitual,
  };
}

// ─── Historial y atajos ──────────────────────────────────────────────────────

export interface GastoDia {
  fecha: ISODate;
  total: number;
}

/**
 * Gasto de cada uno de los últimos `dias` días (el último es hoy).
 * Por defecto solo categorías variables: el alquiler del día 1 aplastaría el gráfico.
 */
export function gastoPorDia(movs: Movimiento[], ahora: Date, dias = 7, soloVariables = true): GastoDia[] {
  const res: GastoDia[] = Array.from({ length: dias }, (_, i) => ({ fecha: aISO(sumarDias(ahora, i - dias + 1)), total: 0 }));
  const indice = new Map(res.map((d, i) => [d.fecha, i]));
  for (const g of movs) {
    if (g.tipo !== 'gasto') continue;
    const i = indice.get(g.fecha);
    if (i !== undefined && (!soloVariables || categoria(g.categoria).tipo === 'variable')) res[i].total += g.importe;
  }
  return res.map((d) => ({ ...d, total: centimos(d.total) }));
}

export interface MovimientoFrecuente {
  tipo: TipoMovimiento;
  categoria: CategoriaId;
  nota: string;
  importe: number;
  veces: number;
}

/** Movimientos con nota que más se repiten (misma categoría y nota), con el último importe usado. */
export function movimientosFrecuentes(movs: Movimiento[], tipo: TipoMovimiento = 'gasto', max = 4): MovimientoFrecuente[] {
  const grupos = new Map<string, MovimientoFrecuente & { ultimo: string }>();
  for (const g of movs) {
    const nota = g.nota?.trim();
    if (g.tipo !== tipo || !nota) continue;
    const clave = `${g.categoria}|${nota.toLocaleLowerCase('es')}`;
    const orden = g.fecha + g.creadoEn;
    const x = grupos.get(clave);
    if (!x) grupos.set(clave, { tipo, categoria: g.categoria, nota, importe: g.importe, veces: 1, ultimo: orden });
    else {
      x.veces++;
      if (orden > x.ultimo) Object.assign(x, { ultimo: orden, importe: g.importe, nota });
    }
  }
  return [...grupos.values()]
    .sort((a, b) => b.veces - a.veces || b.ultimo.localeCompare(a.ultimo))
    .slice(0, max)
    .map(({ tipo: t, categoria: c, nota, importe, veces }) => ({ tipo: t, categoria: c, nota, importe, veces }));
}

/** Categorías ordenadas por uso en los últimos 90 días (para poner primero las habituales). */
export function ordenarPorUso(ids: CategoriaId[], movs: Movimiento[], ref = new Date()): CategoriaId[] {
  const desde = aISO(sumarDias(ref, -90));
  const usos = new Map<CategoriaId, number>();
  for (const m of movs) if (m.fecha >= desde) usos.set(m.categoria, (usos.get(m.categoria) ?? 0) + 1);
  return [...ids].sort((a, b) => (usos.get(b) ?? 0) - (usos.get(a) ?? 0));
}

// ─── Comparativa mensual ─────────────────────────────────────────────────────

export interface ComparativaCategoria {
  categoria: CategoriaId;
  actual: number;
  anterior: number;
  diferencia: number;
  /** Variación relativa respecto al mes anterior (null si el mes anterior fue 0). */
  variacion: number | null;
}

export function comparativaMensual(movs: Movimiento[], ref: Date, tipo: TipoMovimiento = 'gasto'): ComparativaCategoria[] {
  const [d, h] = rango('mensual', ref);
  const [dp, hp] = rangoMesAnterior(ref);
  const actual = totalPorCategoria(movs, d, h, tipo);
  const anterior = totalPorCategoria(movs, dp, hp, tipo);
  const ids = new Set([...Object.keys(actual), ...Object.keys(anterior)]);
  return [...ids]
    .map((id) => {
      const a = actual[id] ?? 0;
      const p = anterior[id] ?? 0;
      return { categoria: id, actual: a, anterior: p, diferencia: centimos(a - p), variacion: p > 0 ? (a - p) / p : null };
    })
    .sort((x, y) => y.actual - x.actual || y.anterior - x.anterior);
}

// ─── Huchas ──────────────────────────────────────────────────────────────────

export interface EstadoMeta {
  ahorrado: number;
  progreso: number; // 0..1
  pendiente: number;
  aportadoEsteMes: number;
  /** Lo que debería llevar ahorrado hoy siguiendo el plan. */
  esperadoHoy: number;
  diferencia: number; // ahorrado − esperado (negativo = va por detrás)
  enCamino: boolean;
  completada: boolean;
  /** Aportación mensual necesaria para llegar a la fecha límite desde hoy. */
  necesarioAlMes: number;
}

export function estadoMeta(meta: Meta, ref: Date): EstadoMeta {
  const aportado = meta.aportaciones.reduce((s, a) => s + a.importe, 0);
  const ahorrado = centimos(meta.importeInicial + aportado);
  const [desde, hasta] = rango('mensual', ref);
  const aportadoEsteMes = centimos(meta.aportaciones.filter((a) => a.fecha >= desde && a.fecha <= hasta).reduce((s, a) => s + a.importe, 0));
  // Solo cuentan como retraso los meses ya cumplidos desde el inicio; la aportación del mes en curso
  // aparece como pendiente (botón «Apartar»), no como deuda.
  const mesesPlan = Math.max(0, Math.floor(mesesEntre(deISO(meta.fechaInicio), ref)));
  const esperadoHoy = Math.min(meta.importeObjetivo, centimos(meta.importeInicial + meta.aporteMensualPlanificado * mesesPlan));
  const completada = ahorrado >= meta.importeObjetivo;
  const pendiente = Math.max(0, centimos(meta.importeObjetivo - ahorrado));
  const mesesRestantes = Math.max(1, Math.ceil(mesesEntre(ref, deISO(meta.fechaLimite))));
  return {
    ahorrado,
    progreso: meta.importeObjetivo > 0 ? Math.max(0, Math.min(1, ahorrado / meta.importeObjetivo)) : 1,
    pendiente,
    aportadoEsteMes,
    esperadoHoy,
    diferencia: centimos(ahorrado - esperadoHoy),
    enCamino: completada || ahorrado >= esperadoHoy - 0.005,
    completada,
    necesarioAlMes: centimos(pendiente / mesesRestantes),
  };
}

export const metasActivas = (metas: Meta[]) => metas.filter((m) => !m.archivada);

export function metaPrincipal(metas: Meta[]): Meta | null {
  const activas = metasActivas(metas);
  return activas.find((m) => m.principal) ?? activas[0] ?? null;
}

/** Suma de las aportaciones mensuales previstas de las huchas activas sin completar. */
export function ahorroPlanificado(metas: Meta[], ref: Date): number {
  return centimos(
    metasActivas(metas)
      .filter((m) => !estadoMeta(m, ref).completada)
      .reduce((s, m) => s + m.aporteMensualPlanificado, 0),
  );
}

/** Aportado (neto) en todas las huchas entre dos fechas. */
export function aportadoEntre(metas: Meta[], desde: ISODate, hasta: ISODate): number {
  return centimos(metas.flatMap((m) => m.aportaciones).reduce((s, a) => (a.fecha >= desde && a.fecha <= hasta ? s + a.importe : s), 0));
}

// ─── Cierre de mes ───────────────────────────────────────────────────────────

export interface CierreMes {
  mes: string; // 'YYYY-MM'
  ingresos: number;
  gastos: number;
  ahorrado: number;
  sobrante: number;
}

/**
 * Balance del mes anterior: ingresos − gastos − lo apartado a huchas.
 * Solo si hay datos suficientes para que tenga sentido (la app se usaba desde el principio de ese mes
 * y hay al menos 3 gastos apuntados); si no, el «sobrante» sería casi todo el sueldo.
 */
export function cierreMesAnterior(movs: Movimiento[], metas: Meta[], usuario: Usuario, ref: Date): CierreMes | null {
  const [desde, hasta] = rangoMesAnterior(ref);
  const gastosMes = movs.filter((m) => m.tipo === 'gasto' && m.fecha >= desde && m.fecha <= hasta);
  if (gastosMes.length < 3) return null;
  if (usuario.creadoEn.slice(0, 10) > aISO(sumarDias(deISO(desde), 7))) return null;

  const ingresos = ingresosDelMes(movs, usuario.ingresosNetosMensuales, deISO(desde)).efectivos;
  const gastos = centimos(gastosMes.reduce((s, m) => s + m.importe, 0));
  const ahorrado = aportadoEntre(metas, desde, hasta);
  return { mes: desde.slice(0, 7), ingresos, gastos, ahorrado, sobrante: centimos(ingresos - gastos - ahorrado) };
}

// ─── Próximos movimientos fijos ──────────────────────────────────────────────

export interface Proximo {
  recurrente: Recurrente;
  fecha: ISODate;
  dias: number;
}

export function proximosRecurrentes(recs: Recurrente[], ahora: Date, dias = 10): Proximo[] {
  const hoy = aISO(ahora);
  const limite = aISO(sumarDias(ahora, dias));
  return recs
    .filter((r) => r.activo)
    .map((r) => {
      const fecha = proximaFecha(r, ahora);
      return { recurrente: r, fecha, dias: Math.round((deISO(fecha).getTime() - deISO(hoy).getTime()) / 86_400_000) };
    })
    .filter((p) => p.fecha <= limite)
    .sort((a, b) => a.fecha.localeCompare(b.fecha));
}

// ─── Dashboard ───────────────────────────────────────────────────────────────

export interface ResumenDashboard {
  ingresos: IngresosMes;
  ahorroPlanificado: number;
  gastadoMes: number;
  /** Ingresos efectivos − ahorro planificado − gastado en el mes. */
  disponibleMes: number;
  /** Lo que se puede gastar hoy en el día a día sin salirse del presupuesto. */
  restanteDiario: number;
  /** Margen del día a día que queda en el mes (negativo = ya te has pasado). */
  restanteVariable: number;
  /** Suma de los límites mensuales de las categorías variables. */
  presupuestoVariable: number;
  /** Gastado este mes en categorías sin límite propio. */
  gastadoSinLimite: number;
  diasRestantes: number;
  /** Proporción del mes transcurrido (0..1) para comparar con lo gastado. */
  avanceMes: number;
  /** Gastado / suma de límites mensuales. */
  consumoPresupuesto: number;
  limitesMes: EstadoLimite[];
  limitesSemana: EstadoLimite[];
  meta: EstadoMeta | null;
}

export function resumenDashboard(usuario: Usuario, limites: Limite[], movs: Movimiento[], metas: Meta[], ahora = new Date()): ResumenDashboard {
  const limitesMes = estadoLimites(movs, limites, 'mensual', ahora);
  const limitesSemana = estadoLimites(movs, limites, 'semanal', ahora);
  const [desde, hasta] = rango('mensual', ahora);
  const gastosCat = totalPorCategoria(movs, desde, hasta);
  const gastadoMes = sumar(gastosCat);
  const totalLimites = limitesMes.reduce((s, e) => s + e.limite, 0);
  const ingresos = ingresosDelMes(movs, usuario.ingresosNetosMensuales, ahora);
  const planificado = ahorroPlanificado(metas, ahora);

  // Margen del día a día: lo que queda en categorías variables con límite, menos lo que te hayas pasado
  // en las fijas y menos lo gastado en categorías sin límite (no estaba presupuestado: sale de aquí).
  let restanteVariable = 0;
  let presupuestoVariable = 0;
  for (const e of limitesMes) {
    if (categoria(e.categoria).tipo === 'variable') {
      restanteVariable += e.limite - e.gastado;
      presupuestoVariable += e.limite;
    } else restanteVariable -= Math.max(0, e.gastado - e.limite);
  }
  const conLimite = new Set(limites.map((l) => l.categoria));
  let gastadoSinLimite = 0;
  for (const [cat, g] of Object.entries(gastosCat)) if (!conLimite.has(cat)) gastadoSinLimite += g;
  restanteVariable = centimos(restanteVariable - gastadoSinLimite);

  const diasRestantes = diasRestantesMes(ahora);
  const principal = metaPrincipal(metas);
  return {
    ingresos,
    ahorroPlanificado: planificado,
    gastadoMes,
    disponibleMes: centimos(ingresos.efectivos - planificado - gastadoMes),
    restanteDiario: centimos(Math.max(0, restanteVariable) / diasRestantes),
    restanteVariable,
    presupuestoVariable: centimos(presupuestoVariable),
    gastadoSinLimite: centimos(gastadoSinLimite),
    diasRestantes,
    avanceMes: (ahora.getDate() - 0.5) / diasDelMes(ahora),
    consumoPresupuesto: totalLimites > 0 ? gastadoMes / totalLimites : 0,
    limitesMes,
    limitesSemana,
    meta: principal ? estadoMeta(principal, ahora) : null,
  };
}
