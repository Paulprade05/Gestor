/**
 * Análisis sobre el historial: previsión de fin de mes, racha dentro del presupuesto,
 * evolución mensual, calendario de gasto y consejos automáticos.
 */
import type { ISODate, Limite, Meta, Movimiento, Recurrente, Usuario } from '../types';
import { categoria } from './categorias';
import { aISO, deISO, diasDelMes, inicioMes, mesAnio, sumarDias } from './fechas';
import { centimos, euros, porcentaje } from './formato';
import { aportadoEntre, estadoMeta, ingresosDelMes, metasActivas, rango, rangoMesAnterior, resumenDashboard, totalEntre } from './presupuesto';
import { proximaFecha } from './recurrentes';

/** Presupuesto diario del día a día: suma de límites mensuales de categorías variables / días del mes. */
export function presupuestoDiario(limites: Limite[], ref: Date): number {
  const mensual = limites.filter((l) => categoria(l.categoria).tipo === 'variable').reduce((s, l) => s + l.mensual, 0);
  return mensual / diasDelMes(ref);
}

/**
 * Gasto del día a día por fecha: categorías variables, sin contar lo que apuntan los fijos automáticos.
 * Con `maximo`, se ignoran los gastos sueltos por encima (compras extraordinarias).
 */
function gastoVariablePorDia(movs: Movimiento[], maximo = Infinity): Map<ISODate, number> {
  const porDia = new Map<ISODate, number>();
  for (const m of movs) {
    if (m.tipo !== 'gasto' || m.recurrenteId || m.importe > maximo || categoria(m.categoria).tipo !== 'variable') continue;
    porDia.set(m.fecha, (porDia.get(m.fecha) ?? 0) + m.importe);
  }
  return porDia;
}

/** Un gasto suelto por encima de esto es extraordinario (un sofá, un viaje): no marca el ritmo diario. */
export const umbralExtraordinario = (limites: Limite[], ref: Date) => Math.max(100, 5 * presupuestoDiario(limites, ref));

// ─── Previsión de fin de mes ─────────────────────────────────────────────────

export interface Prevision {
  /** Ingresos del mes (efectivos) + ingresos fijos que aún faltan por llegar. */
  ingresos: number;
  gastado: number;
  /** Gastos fijos (recurrentes) que aún se apuntarán este mes. */
  fijosPendientes: number;
  /** Lo que se estima que se gastará en el día a día hasta fin de mes. */
  variableProyectado: number;
  gastosPrevistos: number;
  /** Lo apartado a huchas este mes + lo que falta por apartar según el plan. */
  ahorroPrevisto: number;
  saldoFinal: number;
  /** Gasto diario estimado que se ha usado para proyectar. */
  ritmoDiario: number;
  diasQuedan: number;
  /** Si el saldo final sale negativo: gasto diario máximo para acabar en 0. */
  ritmoParaCuadrar: number | null;
}

export function prevision(usuario: Usuario, limites: Limite[], movs: Movimiento[], metas: Meta[], recs: Recurrente[], ahora = new Date()): Prevision {
  const [desde, hasta] = rango('mensual', ahora);
  const ing = ingresosDelMes(movs, usuario.ingresosNetosMensuales, ahora);

  // Fijos que faltan este mes. Una nómina pendiente no se suma si aún se usan los ingresos previstos
  // (ya la incluyen).
  let ingresosPendientes = 0;
  let fijosPendientes = 0;
  for (const r of recs) {
    if (!r.activo || proximaFecha(r, ahora) > hasta) continue;
    if (r.tipo === 'gasto') fijosPendientes += r.importe;
    else if (categoria(r.categoria).tipo !== 'fija' || ing.registradoHabitual) ingresosPendientes += r.importe;
  }

  const gastado = totalEntre(movs, desde, hasta, 'gasto');
  const dia = ahora.getDate();
  const diasQuedan = diasDelMes(ahora) - dia;

  // Ritmo: al principio de mes hay pocos datos, así que se mezcla con el presupuesto diario
  // (peso del ritmo real: 10 % por día transcurrido, hasta el 100 % el día 10). Los gastos
  // extraordinarios ya están en «gastado», pero no se proyectan al resto del mes.
  let variableMes = 0;
  for (const [f, v] of gastoVariablePorDia(movs, umbralExtraordinario(limites, ahora))) if (f >= desde && f <= hasta) variableMes += v;
  const ritmoReal = variableMes / dia;
  const peso = Math.min(1, dia / 10);
  const ritmoDiario = peso * ritmoReal + (1 - peso) * presupuestoDiario(limites, ahora);
  const variableProyectado = ritmoDiario * diasQuedan;

  const aportadoMes = aportadoEntre(metas, desde, hasta);
  const pendienteHuchas = metasActivas(metas).reduce((s, m) => {
    const e = estadoMeta(m, ahora);
    return e.completada ? s : s + Math.max(0, m.aporteMensualPlanificado - e.aportadoEsteMes);
  }, 0);

  const ingresos = ing.efectivos + ingresosPendientes;
  const gastosPrevistos = gastado + fijosPendientes + variableProyectado;
  const ahorroPrevisto = aportadoMes + pendienteHuchas;
  const saldoFinal = ingresos - gastosPrevistos - ahorroPrevisto;
  const margenVariable = ingresos - gastado - fijosPendientes - ahorroPrevisto;

  return {
    ingresos: centimos(ingresos),
    gastado,
    fijosPendientes: centimos(fijosPendientes),
    variableProyectado: centimos(variableProyectado),
    gastosPrevistos: centimos(gastosPrevistos),
    ahorroPrevisto: centimos(ahorroPrevisto),
    saldoFinal: centimos(saldoFinal),
    ritmoDiario: centimos(ritmoDiario),
    diasQuedan,
    ritmoParaCuadrar: saldoFinal < 0 && diasQuedan > 0 ? centimos(Math.max(0, margenVariable) / diasQuedan) : null,
  };
}

// ─── Racha ───────────────────────────────────────────────────────────────────

/** Días seguidos (hasta hoy) en los que el gasto del día a día no ha pasado del presupuesto diario. */
export function racha(movs: Movimiento[], limites: Limite[], usuario: Usuario, ahora = new Date()): number {
  const inicio = usuario.creadoEn.slice(0, 10);
  const porDia = gastoVariablePorDia(movs);
  let n = 0;
  let d = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate());
  for (let i = 0; i < 366; i++) {
    const f = aISO(d);
    if (f < inicio) break;
    const tope = presupuestoDiario(limites, d);
    if (tope <= 0 || (porDia.get(f) ?? 0) > tope) break;
    n++;
    d = sumarDias(d, -1);
  }
  return n;
}

// ─── Evolución mensual ───────────────────────────────────────────────────────

export interface MesResumen {
  mes: string; // 'YYYY-MM'
  etiqueta: string; // 'oct'
  ingresos: number;
  gastos: number;
  ahorrado: number;
}

/** Últimos `meses` meses (el último es el actual), desde el mes en que se empezó a usar la app. */
export function evolucionMensual(movs: Movimiento[], metas: Meta[], usuario: Usuario, ahora = new Date(), meses = 6): MesResumen[] {
  const primerMes = usuario.creadoEn.slice(0, 7);
  const res: MesResumen[] = [];
  for (let i = meses - 1; i >= 0; i--) {
    const ref = new Date(ahora.getFullYear(), ahora.getMonth() - i, 1);
    const mes = aISO(ref).slice(0, 7);
    if (mes < primerMes) continue;
    const [desde, hasta] = rango('mensual', ref);
    res.push({
      mes,
      etiqueta: ref.toLocaleDateString('es-ES', { month: 'short' }).replace('.', ''),
      ingresos: ingresosDelMes(movs, usuario.ingresosNetosMensuales, ref).efectivos,
      gastos: totalEntre(movs, desde, hasta, 'gasto'),
      ahorrado: aportadoEntre(metas, desde, hasta),
    });
  }
  return res;
}

// ─── Calendario ──────────────────────────────────────────────────────────────

export interface DiaCalendario {
  fecha: ISODate;
  dia: number;
  /** Gasto del día a día. */
  variable: number;
  /** Todo lo gastado ese día (incluidos fijos). */
  total: number;
  movimientos: number;
  /** 0 sin gasto · 1 ≤ 50 % del presupuesto diario · 2 ≤ 100 % · 3 ≤ 150 % · 4 más. */
  nivel: 0 | 1 | 2 | 3 | 4;
  futuro: boolean;
}

/** Semanas (lunes a domingo) del mes de `ref`; los huecos antes del día 1 y tras el último son null. */
export function calendarioMes(movs: Movimiento[], limites: Limite[], ref: Date, ahora = new Date()): (DiaCalendario | null)[][] {
  const inicio = inicioMes(ref);
  const dias = diasDelMes(ref);
  const tope = presupuestoDiario(limites, ref);
  const hoy = aISO(ahora);
  const variable = gastoVariablePorDia(movs);
  const totales = new Map<ISODate, { total: number; n: number }>();
  for (const m of movs) {
    if (m.tipo !== 'gasto') continue;
    const t = totales.get(m.fecha) ?? { total: 0, n: 0 };
    totales.set(m.fecha, { total: t.total + m.importe, n: t.n + 1 });
  }

  const celdas: (DiaCalendario | null)[] = Array.from({ length: (inicio.getDay() + 6) % 7 }, () => null);
  for (let d = 1; d <= dias; d++) {
    const fecha = aISO(new Date(ref.getFullYear(), ref.getMonth(), d));
    const v = centimos(variable.get(fecha) ?? 0);
    const t = totales.get(fecha);
    const r = tope > 0 ? v / tope : v > 0 ? 2 : 0;
    celdas.push({
      fecha,
      dia: d,
      variable: v,
      total: centimos(t?.total ?? 0),
      movimientos: t?.n ?? 0,
      nivel: v <= 0 ? 0 : r <= 0.5 ? 1 : r <= 1 ? 2 : r <= 1.5 ? 3 : 4,
      futuro: fecha > hoy,
    });
  }
  while (celdas.length % 7) celdas.push(null);
  return Array.from({ length: celdas.length / 7 }, (_, i) => celdas.slice(i * 7, i * 7 + 7));
}

// ─── Consejos ────────────────────────────────────────────────────────────────

export interface Consejo {
  id: string;
  icono: string;
  texto: string;
  tono: 'aviso' | 'bien' | 'info';
}

interface Contexto {
  usuario: Usuario;
  limites: Limite[];
  movs: Movimiento[];
  metas: Meta[];
  recs: Recurrente[];
  ahora?: Date;
}

/** Hasta 3 consejos ordenados por importancia (avisos, logros, información). */
export function consejos({ usuario, limites, movs, metas, recs, ahora = new Date() }: Contexto): Consejo[] {
  const out: Consejo[] = [];
  const [desde, hasta] = rango('mensual', ahora);
  const hoy = aISO(ahora);
  const dia = ahora.getDate();
  const nombreMes = mesAnio(ahora).split(' ')[0];

  // 1. Previsión negativa
  const p = prevision(usuario, limites, movs, metas, recs, ahora);
  if (p.saldoFinal < -5 && p.ritmoParaCuadrar !== null) {
    out.push({
      id: 'prevision',
      icono: '📉',
      tono: 'aviso',
      texto: `A este ritmo acabarás ${nombreMes} con ${euros(Math.round(p.saldoFinal))}. Para cuadrar, gasta como mucho ${euros(Math.floor(p.ritmoParaCuadrar))} al día.`,
    });
  }

  // 2. Categoría que se dispara respecto a los mismos días del mes anterior
  const [desdeAnt] = rangoMesAnterior(ahora);
  const anterior = deISO(desdeAnt);
  const hastaAnt = aISO(new Date(anterior.getFullYear(), anterior.getMonth(), Math.min(dia, diasDelMes(anterior))));
  const acumula = (d: ISODate, h: ISODate) => {
    const r: Record<string, number> = {};
    for (const m of movs) if (m.tipo === 'gasto' && !m.recurrenteId && m.fecha >= d && m.fecha <= h && categoria(m.categoria).tipo === 'variable') r[m.categoria] = (r[m.categoria] ?? 0) + m.importe;
    return r;
  };
  const actual = acumula(desde, hoy);
  const previo = acumula(desdeAnt, hastaAnt);
  const disparada = Object.entries(actual)
    .map(([id, v]) => ({ id, v, ant: previo[id] ?? 0 }))
    .filter((x) => x.ant > 0 && x.v >= 20 && x.v > x.ant * 1.4 && x.v - x.ant >= 15)
    .sort((a, b) => b.v - b.ant - (a.v - a.ant))[0];
  if (disparada) {
    out.push({
      id: 'categoria',
      icono: categoria(disparada.id).emoji,
      tono: 'aviso',
      texto: `Llevas ${euros(Math.round(disparada.v))} en ${categoria(disparada.id).nombre}, un ${porcentaje((disparada.v - disparada.ant) / disparada.ant)} más que a estas alturas de ${mesAnio(anterior).split(' ')[0]}.`,
    });
  }

  // 3. Gastos sin límite que se comen el margen
  const r = resumenDashboard(usuario, limites, movs, metas, ahora);
  if (r.gastadoSinLimite > Math.max(50, r.ingresos.efectivos * 0.1)) {
    out.push({
      id: 'sin-limite',
      icono: '📐',
      tono: 'info',
      texto: `Llevas ${euros(Math.round(r.gastadoSinLimite))} en categorías sin límite. Ponles uno en Más → Presupuesto para controlarlas.`,
    });
  }

  // 4. Racha
  const n = racha(movs, limites, usuario, ahora);
  if (n >= 3) out.push({ id: 'racha', icono: '🔥', tono: 'bien', texto: `Llevas ${n} días seguidos dentro de tu presupuesto diario. ¡Sigue así!` });

  // 5. Gastos hormiga
  const pequenos = movs.filter((m) => m.tipo === 'gasto' && !m.recurrenteId && m.importe <= 6 && m.fecha >= desde && m.fecha <= hasta);
  if (pequenos.length >= 8) {
    const suma = pequenos.reduce((s, m) => s + m.importe, 0);
    out.push({
      id: 'hormiga',
      icono: '🐜',
      tono: 'info',
      texto: `${pequenos.length} gastos pequeños (6 € o menos) suman ${euros(Math.round(suma))} este mes. Al año serían unos ${euros(Math.round(((suma / dia) * 365) / 10) * 10)}.`,
    });
  }

  // 6. Ingresos extra con huchas por completar este mes
  const ing = ingresosDelMes(movs, usuario.ingresosNetosMensuales, ahora);
  const faltaHuchas = metasActivas(metas).some((m) => {
    const e = estadoMeta(m, ahora);
    return !e.completada && e.aportadoEsteMes < m.aporteMensualPlanificado;
  });
  if (ing.extra >= 50 && faltaHuchas) {
    out.push({ id: 'extra', icono: '✨', tono: 'info', texto: `Este mes has tenido ${euros(Math.round(ing.extra))} de ingresos extra: buen momento para completar lo de tus huchas.` });
  }

  // 7. Días sin apuntar nada
  const ultimo = movs.reduce<ISODate | null>((u, m) => (m.tipo === 'gasto' && !m.recurrenteId && (!u || m.fecha > u) ? m.fecha : u), null);
  const desdeUso = usuario.creadoEn.slice(0, 10);
  const sinApuntar = ultimo ? Math.round((deISO(hoy).getTime() - deISO(ultimo).getTime()) / 86_400_000) : 0;
  if (ultimo && sinApuntar >= 3 && desdeUso <= aISO(sumarDias(ahora, -3))) {
    out.push({ id: 'sin-apuntar', icono: '✍️', tono: 'info', texto: `Hace ${sinApuntar} días que no apuntas ningún gasto. ¿Se te ha pasado alguno?` });
  }

  const orden = { aviso: 0, bien: 1, info: 2 };
  return out.sort((a, b) => orden[a.tono] - orden[b.tono]).slice(0, 3);
}
