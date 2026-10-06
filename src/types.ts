/**
 * Modelos de datos de la app.
 *
 * Convenciones:
 *  - Importes en euros como `number` con 2 decimales como máximo (se redondean al guardar).
 *    En los movimientos el importe es siempre positivo; el `tipo` dice si entra o sale.
 *  - Fechas de calendario como cadena local `YYYY-MM-DD` (sin zona horaria, para que un gasto
 *    de las 23:30 no salte de día). Marcas de tiempo como ISO 8601 completo.
 */

export type ISODate = string; // 'YYYY-MM-DD'
export type ISODateTime = string; // new Date().toISOString()

export type TipoMovimiento = 'gasto' | 'ingreso';

// ─── Categorías ──────────────────────────────────────────────────────────────

/** Predefinidas ('comida', 'nomina'…) o personalizadas (identificador generado). */
export type CategoriaId = string;

export interface Categoria {
  id: CategoriaId;
  nombre: string;
  emoji: string;
  color: string;
  clase: TipoMovimiento;
  /**
   * Gastos — `fija`: se paga una o pocas veces al mes (alquiler, suscripciones);
   *          `variable`: día a día (comida, ocio…). Solo las variables cuentan para el «restante diario».
   * Ingresos — `fija`: ingreso habitual (nómina, pensión): si se registra, sustituye a los ingresos previstos;
   *            `variable`: ingreso extra, que se suma.
   */
  tipo: 'fija' | 'variable';
  personalizada?: boolean;
  oculta?: boolean;
}

export interface ConfigCategorias {
  personalizadas: Categoria[];
  ocultas: CategoriaId[];
}

// ─── Usuario ─────────────────────────────────────────────────────────────────

export type PerfilGasto = 'ahorrador' | 'equilibrado' | 'disfrutador';

export interface Usuario {
  id: string;
  nombre: string;
  moneda: 'EUR';
  /** Ingresos netos habituales previstos al mes (se usan mientras no se registre la nómina del mes). */
  ingresosNetosMensuales: number;
  perfilGasto: PerfilGasto;
  onboardingCompletado: boolean;
  creadoEn: ISODateTime;
  actualizadoEn: ISODateTime;
}

// ─── Diagnóstico (onboarding) ────────────────────────────────────────────────

export interface RespuestasOnboarding {
  ingresosNetos: number;
  gastosFijos: {
    vivienda: number; // alquiler/hipoteca, suministros, seguros
    comida: number; // compra básica del mes
    suscripciones: number; // streaming, gimnasio, apps...
    transporte?: number; // abono, gasolina… (opcional: no existía en la primera versión)
  };
  perfilGasto: PerfilGasto;
  /** Lo que el usuario cree que puede ahorrar al mes. */
  capacidadAhorroEstimada: number;
  objetivo: {
    nombre: string;
    importe: number;
    plazoMeses: number;
    ahorroActual: number;
  };
}

export type NombreRegla = '50/30/20' | '60/20/20' | '70/20/10' | '80/10/10' | 'personalizada';

/** Reparto en proporciones de 0 a 1 sobre los ingresos netos. */
export interface Reparto {
  necesidades: number;
  deseos: number;
  ahorro: number;
}

export type Viabilidad = 'holgada' | 'viable' | 'ajustada' | 'inviable' | 'sin-margen';

export interface Aviso {
  tipo: 'info' | 'consejo' | 'alerta';
  texto: string;
}

export interface Diagnostico {
  id: string;
  creadoEn: ISODateTime;
  respuestas: RespuestasOnboarding;
  gastosFijosTotales: number;
  /** Ingresos − gastos fijos. Lo que queda para ahorro, ocio e imprevistos. */
  margenMensual: number;
  /** Gastos fijos / ingresos. */
  ratioFijos: number;
  /** Regla de referencia que se eligió como punto de partida. */
  reglaBase: { nombre: NombreRegla; reparto: Reparto };
  /** Reparto real resultante tras ajustar al usuario. */
  reglaResultante: { nombre: NombreRegla; reparto: Reparto };
  ahorroMensualRecomendado: number;
  /** Ahorro mensual que haría falta para cumplir el objetivo en plazo. */
  ahorroNecesarioObjetivo: number;
  /** Máximo que se puede ahorrar dejando un colchón mínimo de ocio e imprevistos. */
  ahorroMaximoSostenible: number;
  mesesEstimados: number | null;
  fechaObjetivoEstimada: ISODate | null;
  viabilidad: Viabilidad;
  /** Presupuesto mensual por categoría de gasto (solo las categorías presupuestadas). */
  presupuestoMensual: Record<CategoriaId, number>;
  avisos: Aviso[];
}

// ─── Metas de ahorro (huchas) ────────────────────────────────────────────────

export interface Aportacion {
  id: string;
  fecha: ISODate;
  /** Positivo = aportación, negativo = retirada. */
  importe: number;
  nota?: string;
}

export interface Meta {
  id: string;
  nombre: string;
  emoji: string;
  importeObjetivo: number;
  /** Lo que ya estaba ahorrado al crear la meta. */
  importeInicial: number;
  fechaInicio: ISODate;
  fechaLimite: ISODate;
  aporteMensualPlanificado: number;
  aportaciones: Aportacion[];
  /** La meta principal aparece en el inicio y recibe el redondeo y las sugerencias. */
  principal?: boolean;
  archivada?: boolean;
  creadoEn: ISODateTime;
  actualizadoEn: ISODateTime;
}

export type MetaNueva = Pick<Meta, 'nombre' | 'emoji' | 'importeObjetivo' | 'importeInicial' | 'fechaLimite' | 'aporteMensualPlanificado'> & {
  id?: string;
  principal?: boolean;
};

// ─── Movimientos (gastos e ingresos) ─────────────────────────────────────────

export interface Movimiento {
  id: string;
  tipo: TipoMovimiento;
  importe: number;
  categoria: CategoriaId;
  fecha: ISODate;
  nota?: string;
  /** Si lo generó un movimiento recurrente. */
  recurrenteId?: string;
  creadoEn: ISODateTime;
  actualizadoEn: ISODateTime;
}

export type MovimientoNuevo = Pick<Movimiento, 'tipo' | 'importe' | 'categoria' | 'fecha' | 'nota'> & { id?: string };

/** Movimiento que se repite cada mes el mismo día (alquiler, nómina, Netflix…) y se apunta solo. */
export interface Recurrente {
  id: string;
  tipo: TipoMovimiento;
  importe: number;
  categoria: CategoriaId;
  nota?: string;
  /** Día del mes (1–31; en meses más cortos, el último día). */
  dia: number;
  /** Primera fecha a partir de la cual se generan movimientos. */
  desde: ISODate;
  /** Última fecha ya generada. */
  ultima?: ISODate;
  activo: boolean;
  creadoEn: ISODateTime;
}

export type RecurrenteNuevo = Pick<Recurrente, 'tipo' | 'importe' | 'categoria' | 'nota' | 'dia' | 'activo'> & { id?: string };

// ─── Límites ─────────────────────────────────────────────────────────────────

export type Periodo = 'mensual' | 'semanal';

/** Techo de gasto de una categoría. Las categorías sin `Limite` no tienen techo propio. */
export interface Limite {
  categoria: CategoriaId;
  mensual: number;
  /** Techo semanal (lunes–domingo). 0 = sin control semanal. */
  semanal: number;
  /** Umbral de aviso (0.8 = avisar al 80 %). El crítico es siempre el 100 %. */
  umbralAviso: number;
}

export type NivelAlerta = 'ok' | 'aviso' | 'excedido';

export interface EstadoLimite {
  categoria: CategoriaId;
  periodo: Periodo;
  gastado: number;
  limite: number;
  /** gastado / limite (puede ser > 1). */
  ratio: number;
  restante: number;
  nivel: NivelAlerta;
}

/** Alerta que provoca (o provocaría) un gasto al cruzar un umbral. */
export interface AlertaLimite extends EstadoLimite {
  nivelAnterior: NivelAlerta;
}

// ─── Ajustes ─────────────────────────────────────────────────────────────────

export interface Ajustes {
  urlSincronizacion?: string;
  ultimaSincronizacion?: string;
  /** Redondear cada gasto al euro y llevar la diferencia a la meta principal. */
  redondeo?: boolean;
  /** Meses ('YYYY-MM') cuyo cierre ya se ha revisado. */
  cierres?: string[];
}
