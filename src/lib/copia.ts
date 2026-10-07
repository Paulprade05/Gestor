/**
 * Copia de seguridad: exportar todos los datos a JSON y restaurarlos.
 * Acepta también las copias de la primera versión (una sola `meta` y la lista `gastos`).
 */
import type { Ajustes, ConfigCategorias, Diagnostico, Limite, Meta, Movimiento, Recurrente, Usuario } from '../types';

export const VERSION_COPIA = 2;

export interface DatosCopia {
  usuario: Usuario;
  diagnostico: Diagnostico | null;
  metas: Meta[];
  limites: Limite[];
  recurrentes: Recurrente[];
  categorias: ConfigCategorias;
  ajustes: Ajustes;
  movimientos: Movimiento[];
}

/** Ajustes que viajan en la copia: los propios del dispositivo (código, sincronización) se quedan. */
const ajustesCopiables = (a: Ajustes): Ajustes => ({ redondeo: a.redondeo, cierres: a.cierres, privado: a.privado });

export function crearCopia(d: DatosCopia) {
  return { app: 'hucha', version: VERSION_COPIA, exportado: new Date().toISOString(), ...d, ajustes: ajustesCopiables(d.ajustes) };
}

const esFecha = (s: unknown): s is string => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
const esObjeto = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);
const lista = <T>(x: unknown): T[] => (Array.isArray(x) ? (x as T[]) : []);
const numero = (x: unknown, def: number) => (typeof x === 'number' && Number.isFinite(x) ? x : def);
const cadena = (x: unknown, def: string) => (typeof x === 'string' && x ? x : def);
const fecha = (x: unknown, def: string) => (esFecha(x) ? x : def);

const hoyISO = () => new Date().toISOString().slice(0, 10);
const dentroDeUnAno = () => {
  const d = new Date();
  d.setFullYear(d.getFullYear() + 1);
  return d.toISOString().slice(0, 10);
};

/** Una hucha con todos sus campos (las copias antiguas o editadas a mano pueden traer huecos). */
export function normalizarMeta(m: Record<string, unknown>, principal?: boolean): Meta {
  const ahora = new Date().toISOString();
  return {
    id: cadena(m.id, `meta-${Math.random().toString(36).slice(2)}`),
    nombre: cadena(m.nombre, 'Mi hucha'),
    emoji: cadena(m.emoji, '🐷'),
    importeObjetivo: numero(m.importeObjetivo, 0),
    importeInicial: numero(m.importeInicial, 0),
    fechaInicio: fecha(m.fechaInicio, hoyISO()),
    fechaLimite: fecha(m.fechaLimite, dentroDeUnAno()),
    aporteMensualPlanificado: numero(m.aporteMensualPlanificado, 0),
    aportaciones: lista<Record<string, unknown>>(m.aportaciones)
      .filter((a) => esObjeto(a) && esFecha(a.fecha) && typeof a.importe === 'number')
      .map((a) => ({ id: cadena(a.id, Math.random().toString(36).slice(2)), fecha: a.fecha as string, importe: a.importe as number, nota: typeof a.nota === 'string' ? a.nota : undefined })),
    principal: principal ?? m.principal === true,
    archivada: m.archivada === true,
    creadoEn: cadena(m.creadoEn, ahora),
    actualizadoEn: cadena(m.actualizadoEn, ahora),
  };
}

/** Valida y normaliza una copia. Lanza un Error con un mensaje para el usuario si no sirve. */
export function leerCopia(texto: string): DatosCopia {
  let j: unknown;
  try {
    j = JSON.parse(texto);
  } catch {
    throw new Error('El archivo no es una copia válida (no es JSON).');
  }
  if (!esObjeto(j)) throw new Error('El archivo no es una copia de Hucha.');
  const u = j.usuario;
  if (!esObjeto(u) || typeof u.nombre !== 'string' || typeof u.ingresosNetosMensuales !== 'number') {
    throw new Error('A la copia le faltan los datos del usuario.');
  }

  const ahora = new Date().toISOString();

  // v1: «gastos» en lugar de «movimientos»
  const movimientos: Movimiento[] = lista<Record<string, unknown>>(j.movimientos ?? j.gastos)
    .filter((m) => esObjeto(m) && typeof m.id === 'string' && esFecha(m.fecha) && typeof m.importe === 'number' && m.importe > 0 && typeof m.categoria === 'string')
    .map((m) => ({
      ...(m as unknown as Movimiento),
      tipo: m.tipo === 'ingreso' ? 'ingreso' : 'gasto',
      creadoEn: cadena(m.creadoEn, `${m.fecha}T12:00:00.000Z`),
      actualizadoEn: cadena(m.actualizadoEn, ahora),
    }));

  // v1: una sola «meta»
  const metasBrutas = Array.isArray(j.metas) ? lista<Record<string, unknown>>(j.metas) : esObjeto(j.meta) ? [j.meta] : [];
  const metas = metasBrutas
    .filter((m) => esObjeto(m) && typeof m.importeObjetivo === 'number' && m.importeObjetivo > 0)
    .map((m) => normalizarMeta(m, Array.isArray(j.metas) ? undefined : true));

  const recurrentes: Recurrente[] = lista<Record<string, unknown>>(j.recurrentes)
    .filter((r) => esObjeto(r) && typeof r.id === 'string' && typeof r.importe === 'number' && r.importe > 0 && typeof r.categoria === 'string')
    .map((r) => ({
      ...(r as unknown as Recurrente),
      tipo: r.tipo === 'ingreso' ? 'ingreso' : 'gasto',
      dia: Math.min(31, Math.max(1, Math.round(numero(r.dia, 1)))),
      desde: fecha(r.desde, hoyISO()),
      ultima: esFecha(r.ultima) ? r.ultima : undefined,
      activo: r.activo !== false,
      creadoEn: cadena(r.creadoEn, ahora),
    }));

  const limites: Limite[] = lista<Record<string, unknown>>(j.limites)
    .filter((l) => esObjeto(l) && typeof l.categoria === 'string' && typeof l.mensual === 'number')
    .map((l) => ({ categoria: l.categoria as string, mensual: l.mensual as number, semanal: numero(l.semanal, 0), umbralAviso: numero(l.umbralAviso, 0.8) }));

  const cat = esObjeto(j.categorias) ? j.categorias : {};
  const usuario: Usuario = {
    ...(u as unknown as Usuario),
    id: cadena(u.id, 'usuario'),
    moneda: 'EUR',
    perfilGasto: u.perfilGasto === 'ahorrador' || u.perfilGasto === 'disfrutador' ? u.perfilGasto : 'equilibrado',
    onboardingCompletado: true,
    creadoEn: cadena(u.creadoEn, ahora),
    actualizadoEn: cadena(u.actualizadoEn, ahora),
  };
  return {
    usuario,
    diagnostico: esObjeto(j.diagnostico) && esObjeto(j.diagnostico.presupuestoMensual) ? (j.diagnostico as unknown as Diagnostico) : null,
    metas,
    limites,
    recurrentes,
    categorias: {
      personalizadas: lista<Record<string, unknown>>(cat.personalizadas).filter((c) => esObjeto(c) && typeof c.id === 'string' && typeof c.nombre === 'string') as unknown as ConfigCategorias['personalizadas'],
      ocultas: lista<unknown>(cat.ocultas).filter((x): x is string => typeof x === 'string'),
    },
    ajustes: esObjeto(j.ajustes) ? ajustesCopiables(j.ajustes as Ajustes) : {},
    movimientos,
  };
}
