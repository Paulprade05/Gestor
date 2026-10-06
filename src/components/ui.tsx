import { useEffect, useState, type ReactNode } from 'react';
import type { NivelAlerta } from '../types';
import { parseImporte } from '../lib/formato';

// ─── Iconos (trazos al estilo SF Symbols) ────────────────────────────────────

const RUTAS = {
  inicio: 'M3 10.5 12 3l9 7.5M5.5 9v11h4.5v-6h4v6h4.5V9',
  lista: 'M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01',
  mas: 'M12 5v14M5 12h14',
  plan: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-4a5 5 0 1 0 0-10 5 5 0 0 0 0 10Zm0-4a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z',
  ajustes:
    'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm7.4-3a7.4 7.4 0 0 0-.1-1.2l2-1.6-2-3.4-2.4 1a7.3 7.3 0 0 0-2-1.2L14.5 3h-4l-.4 2.6a7.3 7.3 0 0 0-2 1.2l-2.4-1-2 3.4 2 1.6a7.4 7.4 0 0 0 0 2.4l-2 1.6 2 3.4 2.4-1a7.3 7.3 0 0 0 2 1.2l.4 2.6h4l.4-2.6a7.3 7.3 0 0 0 2-1.2l2.4 1 2-3.4-2-1.6c.1-.4.1-.8.1-1.2Z',
  atras: 'M15 5l-7 7 7 7',
  borrar: 'M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3',
  teclaBorrar: 'M21 5H8l-6 7 6 7h13V5ZM11 9l6 6M17 9l-6 6',
  check: 'M5 12.5l4.5 4.5L19 7',
  aviso: 'M12 3 2 20h20L12 3Zm0 6v5m0 3v.01',
  hucha: 'M8 3h8M9 3v3.2A7 7 0 0 0 5 12.5V19a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6.5a7 7 0 0 0-4-6.3V3M10 12h4',
  menu: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM8 12h.01M12 12h.01M16 12h.01',
  buscar: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14Zm5-2 5 5',
  chevron: 'M9 5l7 7-7 7',
} as const;

export type NombreIcono = keyof typeof RUTAS;

export function Icono({ nombre, tam = 24, grosor = 2 }: { nombre: keyof typeof RUTAS; tam?: number; grosor?: number }) {
  return (
    <svg width={tam} height={tam} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={grosor} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={RUTAS[nombre]} />
    </svg>
  );
}

// ─── Barra de progreso ───────────────────────────────────────────────────────

export function Barra({ valor, nivel, color, marca, alto = 8 }: { valor: number; nivel?: NivelAlerta; color?: string; marca?: number; alto?: number }) {
  const ancho = `${Math.max(0, Math.min(1, valor)) * 100}%`;
  return (
    <div className="barra" style={{ height: alto }} role="progressbar" aria-valuenow={Math.round(valor * 100)} aria-valuemin={0} aria-valuemax={100}>
      <div className={`barra-relleno ${nivel ? `nivel-${nivel}` : ''}`} style={{ width: ancho, background: nivel && nivel !== 'ok' ? undefined : color }} />
      {marca !== undefined && <div className="barra-marca" style={{ left: `${Math.min(1, marca) * 100}%` }} />}
    </div>
  );
}

// ─── Anillo de progreso ──────────────────────────────────────────────────────

export function Anillo({ valor, tam = 68, grosor = 7, color = 'var(--rosa)', children }: { valor: number; tam?: number; grosor?: number; color?: string; children?: ReactNode }) {
  const r = (tam - grosor) / 2;
  const circ = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(1, valor));
  return (
    <div className="anillo" style={{ width: tam, height: tam }}>
      <svg width={tam} height={tam} viewBox={`0 0 ${tam} ${tam}`} aria-hidden="true">
        <circle cx={tam / 2} cy={tam / 2} r={r} fill="none" stroke="var(--anillo-fondo)" strokeWidth={grosor} />
        <circle
          className="anillo-valor"
          cx={tam / 2}
          cy={tam / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={grosor}
          strokeLinecap="round"
          strokeDasharray={circ}
          strokeDashoffset={circ * (1 - v)}
          transform={`rotate(-90 ${tam / 2} ${tam / 2})`}
        />
      </svg>
      <div className="anillo-centro">{children}</div>
    </div>
  );
}

// ─── Campo de importe ────────────────────────────────────────────────────────

/**
 * Input de importe con teclado decimal de iOS. Guarda el texto mientras se escribe
 * (para no pelearse con la coma decimal) y emite el número.
 */
export function CampoImporte({
  valor,
  onCambio,
  placeholder = '0',
  autoFocus,
  etiqueta,
  id,
}: {
  valor: number;
  onCambio: (n: number) => void;
  placeholder?: string;
  autoFocus?: boolean;
  etiqueta?: string;
  id?: string;
}) {
  const aTexto = (n: number) => (n ? String(n).replace('.', ',') : '');
  const [texto, setTexto] = useState(aTexto(valor));
  useEffect(() => {
    // Solo se reescribe si el valor cambia desde fuera (no mientras se teclea «12,»).
    setTexto((t) => (parseImporte(t) !== valor ? aTexto(valor) : t));
  }, [valor]);

  return (
    <label className="campo-importe" htmlFor={id}>
      {etiqueta && <span className="campo-etiqueta">{etiqueta}</span>}
      <span className="campo-importe-caja">
        <input
          id={id}
          type="text"
          inputMode="decimal"
          enterKeyHint="next"
          autoComplete="off"
          placeholder={placeholder}
          autoFocus={autoFocus}
          value={texto}
          onChange={(e) => {
            const t = e.target.value.replace(/[^\d.,]/g, '');
            setTexto(t);
            onCambio(parseImporte(t));
          }}
        />
        <span className="campo-sufijo">€</span>
      </span>
    </label>
  );
}

// ─── Control segmentado ──────────────────────────────────────────────────────

export function Segmentado<T extends string>({ opciones, valor, onCambio }: { opciones: { valor: T; texto: string }[]; valor: T; onCambio: (v: T) => void }) {
  const i = Math.max(0, opciones.findIndex((o) => o.valor === valor));
  return (
    <div className="segmentado" role="tablist" style={{ ['--n' as string]: opciones.length, ['--i' as string]: i }}>
      <div className="segmentado-pastilla" />
      {opciones.map((o) => (
        <button key={o.valor} role="tab" aria-selected={o.valor === valor} onClick={() => onCambio(o.valor)}>
          {o.texto}
        </button>
      ))}
    </div>
  );
}

/** Interruptor de iOS. */
export function Interruptor({ activo, onCambio, etiqueta }: { activo: boolean; onCambio(v: boolean): void; etiqueta: string }) {
  return (
    <button
      role="switch"
      aria-checked={activo}
      aria-label={etiqueta}
      className={`interruptor ${activo ? 'activo' : ''}`}
      onClick={(e) => {
        e.stopPropagation();
        vibrar(5);
        onCambio(!activo);
      }}
    >
      <span />
    </button>
  );
}

export function Seccion({ titulo, accion, children, pie }: { titulo?: string; accion?: ReactNode; children: ReactNode; pie?: ReactNode }) {
  return (
    <section className="seccion">
      {(titulo || accion) && (
        <div className="seccion-cabecera">
          {titulo && <h2>{titulo}</h2>}
          {accion}
        </div>
      )}
      <div className="tarjeta">{children}</div>
      {pie && <p className="seccion-pie">{pie}</p>}
    </section>
  );
}

export const vibrar = (ms = 10) => {
  // iOS Safari no implementa vibrate(); en Android da respuesta háptica.
  try {
    navigator.vibrate?.(ms);
  } catch {
    /* nada */
  }
};
