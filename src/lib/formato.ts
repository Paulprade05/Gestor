// useGrouping 'always': en es-ES los números de 4 cifras no se agrupan por defecto («1220 €» → «1.220 €»).
const AGRUPAR = { useGrouping: 'always' } as unknown as Intl.NumberFormatOptions;
const eur0 = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0, ...AGRUPAR });
const eur2 = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2, maximumFractionDigits: 2, ...AGRUPAR });
const pct0 = new Intl.NumberFormat('es-ES', { style: 'percent', maximumFractionDigits: 0 });

/** 1234 → «1234 €»; 12,5 → «12,50 €». Con `decimales` fuerza 2 decimales. */
export function euros(n: number, decimales?: boolean): string {
  const entero = Math.abs(n % 1) < 0.005;
  return (decimales || !entero ? eur2 : eur0).format(n);
}

export const porcentaje = (r: number) => pct0.format(r);

/** Redondea a céntimos evitando errores de coma flotante. */
export const centimos = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/**
 * Convierte texto introducido por el usuario a número.
 * Acepta «1.234,56», «1234,56», «1234.56», «12 €».
 */
export function parseImporte(texto: string): number {
  let s = texto.replace(/[^\d.,-]/g, '');
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  const n = Number.parseFloat(s);
  return Number.isFinite(n) ? centimos(n) : 0;
}

export function nuevoId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
