import type { ISODate } from '../types';

const pad = (n: number) => String(n).padStart(2, '0');

/** Fecha local (no UTC) en formato YYYY-MM-DD. */
export function aISO(d: Date): ISODate {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function deISO(s: ISODate): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export const hoyISO = (ahora = new Date()) => aISO(ahora);

export function sumarDias(d: Date, dias: number): Date {
  const r = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  r.setDate(r.getDate() + dias);
  return r;
}

/** Suma meses sin desbordar (31 ene + 1 mes = 28/29 feb). */
export function sumarMeses(d: Date, meses: number): Date {
  const r = new Date(d.getFullYear(), d.getMonth() + meses, 1);
  const ultimo = new Date(r.getFullYear(), r.getMonth() + 1, 0).getDate();
  r.setDate(Math.min(d.getDate(), ultimo));
  return r;
}

export const inicioMes = (d: Date) => new Date(d.getFullYear(), d.getMonth(), 1);
export const finMes = (d: Date) => new Date(d.getFullYear(), d.getMonth() + 1, 0);
export const diasDelMes = (d: Date) => finMes(d).getDate();

/** Lunes de la semana de `d` (semana ISO, lunes–domingo). */
export function inicioSemana(d: Date): Date {
  const dia = (d.getDay() + 6) % 7; // 0 = lunes
  return sumarDias(d, -dia);
}

export const finSemana = (d: Date) => sumarDias(inicioSemana(d), 6);

/** Días que quedan en el mes contando hoy. */
export function diasRestantesMes(d: Date): number {
  return diasDelMes(d) - d.getDate() + 1;
}

/** Meses (con decimales) entre dos fechas. */
export function mesesEntre(desde: Date, hasta: Date): number {
  const enteros = (hasta.getFullYear() - desde.getFullYear()) * 12 + (hasta.getMonth() - desde.getMonth());
  const fraccion = (hasta.getDate() - desde.getDate()) / diasDelMes(hasta);
  return enteros + fraccion;
}

const fmtLargo = new Intl.DateTimeFormat('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
const fmtCorto = new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short' });
const fmtMesAnio = new Intl.DateTimeFormat('es-ES', { month: 'long', year: 'numeric' });

export function etiquetaDia(iso: ISODate, ahora = new Date()): string {
  const hoy = hoyISO(ahora);
  if (iso === hoy) return 'Hoy';
  if (iso === aISO(sumarDias(ahora, -1))) return 'Ayer';
  const s = fmtLargo.format(deISO(iso));
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export const fechaCorta = (iso: ISODate) => fmtCorto.format(deISO(iso));
export const mesAnio = (d: Date | ISODate) => fmtMesAnio.format(typeof d === 'string' ? deISO(d) : d);
