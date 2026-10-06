/**
 * Catálogo de categorías: las predefinidas más las que crea el usuario.
 *
 * Es un registro a nivel de módulo para que los cálculos (presupuesto, gráficos) sepan si una categoría
 * es fija o variable sin pasar la lista por todas partes. El estado de la app lo actualiza con
 * `establecerCategorias()` cada vez que cambia la configuración.
 */
import type { Categoria, CategoriaId, ConfigCategorias, TipoMovimiento } from '../types';

export const PREDEFINIDAS: readonly Categoria[] = [
  // ── Gastos ──
  { id: 'vivienda', nombre: 'Vivienda', emoji: '🏠', color: '#9b7bf0', clase: 'gasto', tipo: 'fija' },
  { id: 'comida', nombre: 'Comida', emoji: '🛒', color: '#2bb5a0', clase: 'gasto', tipo: 'variable' },
  { id: 'transporte', nombre: 'Transporte', emoji: '🚗', color: '#5aa9e6', clase: 'gasto', tipo: 'variable' },
  { id: 'suscripciones', nombre: 'Suscripciones', emoji: '📺', color: '#f06aa6', clase: 'gasto', tipo: 'fija' },
  { id: 'ocio', nombre: 'Ocio', emoji: '🎉', color: '#f7a072', clase: 'gasto', tipo: 'variable' },
  { id: 'restaurantes', nombre: 'Comer fuera', emoji: '🍽️', color: '#e9b949', clase: 'gasto', tipo: 'variable' },
  { id: 'salud', nombre: 'Salud', emoji: '💊', color: '#6cc68b', clase: 'gasto', tipo: 'variable' },
  { id: 'ropa', nombre: 'Ropa', emoji: '👗', color: '#c77dff', clase: 'gasto', tipo: 'variable' },
  { id: 'cuidado', nombre: 'Cuidado personal', emoji: '💅', color: '#ff8fab', clase: 'gasto', tipo: 'variable' },
  { id: 'hogar', nombre: 'Hogar', emoji: '🛋️', color: '#b08968', clase: 'gasto', tipo: 'variable' },
  { id: 'regalos', nombre: 'Regalos', emoji: '🎁', color: '#ff99c8', clase: 'gasto', tipo: 'variable' },
  { id: 'mascotas', nombre: 'Mascotas', emoji: '🐾', color: '#a3b18a', clase: 'gasto', tipo: 'variable' },
  { id: 'educacion', nombre: 'Formación', emoji: '📚', color: '#4895ef', clase: 'gasto', tipo: 'variable' },
  { id: 'imprevistos', nombre: 'Imprevistos', emoji: '🧰', color: '#7d8fb3', clase: 'gasto', tipo: 'variable' },
  { id: 'otros', nombre: 'Otros gastos', emoji: '📦', color: '#a5a5b5', clase: 'gasto', tipo: 'variable' },
  // ── Ingresos ──
  { id: 'nomina', nombre: 'Nómina', emoji: '💼', color: '#2a9d8f', clase: 'ingreso', tipo: 'fija' },
  { id: 'paga_extra', nombre: 'Paga extra', emoji: '⭐', color: '#f4a261', clase: 'ingreso', tipo: 'variable' },
  { id: 'freelance', nombre: 'Trabajos extra', emoji: '💻', color: '#577590', clase: 'ingreso', tipo: 'variable' },
  { id: 'ventas', nombre: 'Ventas', emoji: '🏷️', color: '#f28482', clase: 'ingreso', tipo: 'variable' },
  { id: 'regalo_recibido', nombre: 'Regalos recibidos', emoji: '🎀', color: '#ff70a6', clase: 'ingreso', tipo: 'variable' },
  { id: 'devoluciones', nombre: 'Devoluciones', emoji: '↩️', color: '#90be6d', clase: 'ingreso', tipo: 'variable' },
  { id: 'otros_ingresos', nombre: 'Otros ingresos', emoji: '💰', color: '#84a59d', clase: 'ingreso', tipo: 'variable' },
];

const ID_PREDEFINIDAS = new Set(PREDEFINIDAS.map((c) => c.id));
export const esPredefinida = (id: CategoriaId) => ID_PREDEFINIDAS.has(id);

/** Colores y emojis que se ofrecen al crear una categoría. */
export const COLORES_CATEGORIA = ['#ff5c9a', '#f7a072', '#e9b949', '#6cc68b', '#2bb5a0', '#5aa9e6', '#4895ef', '#9b7bf0', '#c77dff', '#b08968', '#7d8fb3', '#a5a5b5'];
export const EMOJIS_CATEGORIA = ['☕', '🍕', '🍺', '🎮', '🎬', '✈️', '🏋️', '👶', '🌿', '💡', '📱', '🚬', '🎨', '⛽', '🏦', '💳', '🧾', '🛍️', '🎵', '🧸'];

const SIN_CATEGORIA: Omit<Categoria, 'id'> = { nombre: 'Sin categoría', emoji: '📦', color: '#a5a5b5', clase: 'gasto', tipo: 'variable' };

let catalogo: Categoria[] = [...PREDEFINIDAS];
let porId = new Map(catalogo.map((c) => [c.id, c]));

export function establecerCategorias(cfg?: ConfigCategorias | null): void {
  const ocultas = new Set(cfg?.ocultas ?? []);
  catalogo = [...PREDEFINIDAS, ...(cfg?.personalizadas ?? [])].map((c) => ({ ...c, oculta: ocultas.has(c.id) }));
  porId = new Map(catalogo.map((c) => [c.id, c]));
}

/** Categorías de un tipo, sin las ocultas salvo que se pidan. */
export const categoriasDe = (clase: TipoMovimiento, incluirOcultas = false) => catalogo.filter((c) => c.clase === clase && (incluirOcultas || !c.oculta));

/** Siempre devuelve algo: una categoría borrada se muestra como «Sin categoría». */
export function categoria(id: CategoriaId): Categoria {
  return porId.get(id) ?? { ...SIN_CATEGORIA, id };
}
