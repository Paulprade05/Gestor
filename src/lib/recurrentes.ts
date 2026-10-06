/**
 * Movimientos fijos que se repiten cada mes (alquiler, nómina, suscripciones…).
 *
 * Al abrir la app se generan los que tocaban desde la última vez (aunque la app llevase días cerrada).
 * El identificador de cada movimiento generado es `${recurrente}-${fecha}`: aunque la generación se
 * ejecutase dos veces, el segundo guardado sobrescribe al primero y no hay duplicados.
 */
import type { ISODate, Movimiento, Recurrente } from '../types';
import { aISO, deISO, diasDelMes } from './fechas';

/** Fecha del día `dia` en ese mes; si el mes es más corto, su último día (31 → 30 de abril). */
export function fechaEnMes(anio: number, mes0: number, dia: number): ISODate {
  return aISO(new Date(anio, mes0, Math.min(dia, diasDelMes(new Date(anio, mes0, 1)))));
}

export function generarPendientes(recs: Recurrente[], hoy: Date): { nuevos: Movimiento[]; actualizados: Recurrente[] } {
  const hoyISO = aISO(hoy);
  const ahora = new Date().toISOString();
  const nuevos: Movimiento[] = [];
  const actualizados: Recurrente[] = [];

  for (const r of recs) {
    if (!r.activo || r.desde > hoyISO) continue;
    const inicio = deISO(r.desde);
    let anio = inicio.getFullYear();
    let mes = inicio.getMonth();
    let ultima = r.ultima;
    while (anio < hoy.getFullYear() || (anio === hoy.getFullYear() && mes <= hoy.getMonth())) {
      const fecha = fechaEnMes(anio, mes, r.dia);
      if (fecha >= r.desde && fecha <= hoyISO && (!ultima || fecha > ultima)) {
        nuevos.push({
          id: `${r.id}-${fecha}`,
          tipo: r.tipo,
          importe: r.importe,
          categoria: r.categoria,
          fecha,
          nota: r.nota,
          recurrenteId: r.id,
          creadoEn: ahora,
          actualizadoEn: ahora,
        });
        ultima = fecha;
      }
      if (++mes > 11) {
        mes = 0;
        anio++;
      }
    }
    if (ultima !== r.ultima) actualizados.push({ ...r, ultima });
  }
  return { nuevos, actualizados };
}

/** Próxima fecha en la que se apuntará (hoy incluido si aún no se ha generado). */
export function proximaFecha(r: Recurrente, hoy: Date): ISODate {
  const hoyISO = aISO(hoy);
  let anio = hoy.getFullYear();
  let mes = hoy.getMonth();
  for (let i = 0; i < 24; i++) {
    const f = fechaEnMes(anio, mes, r.dia);
    if (f >= hoyISO && f >= r.desde && (!r.ultima || f > r.ultima)) return f;
    if (++mes > 11) {
      mes = 0;
      anio++;
    }
  }
  return fechaEnMes(anio, mes, r.dia);
}

/** Importe mensual total de los recurrentes activos de un tipo. */
export const totalMensual = (recs: Recurrente[], tipo: Recurrente['tipo']) =>
  Math.round(recs.filter((r) => r.activo && r.tipo === tipo).reduce((s, r) => s + r.importe, 0) * 100) / 100;
