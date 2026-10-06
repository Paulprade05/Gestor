/**
 * Fila de gasto o ingreso con el gesto de iOS «deslizar para borrar»:
 * se arrastra a la izquierda para ver «Borrar»; si se arrastra hasta el fondo, borra directamente.
 * El borrado se puede deshacer desde la notificación.
 */
import { useRef, useState, type MouseEvent, type PointerEvent } from 'react';
import type { Movimiento } from '../types';
import { useEstado } from '../estado';
import { categoria } from '../lib/categorias';
import { etiquetaDia } from '../lib/fechas';
import { euros } from '../lib/formato';
import { Icono, vibrar } from './ui';

const ANCHO_BOTON = 84;

interface Gesto {
  x: number;
  y: number;
  base: number;
  dir?: 'h' | 'v';
}

export function FilaMovimiento({ m, onClick, conFecha = true }: { m: Movimiento; onClick(): void; conFecha?: boolean }) {
  const { borrarMovimiento } = useEstado();
  const c = categoria(m.categoria);
  const [dx, setDx] = useState(0);
  const [arrastrando, setArrastrando] = useState(false);
  const dxRef = useRef(0);
  const gesto = useRef<Gesto | null>(null);
  const huboArrastre = useRef(false);
  const ancho = useRef(0);

  const mover = (v: number) => {
    dxRef.current = v;
    setDx(v);
  };

  const borrar = () => {
    vibrar(20);
    mover(-(ancho.current || 400));
    setTimeout(() => void borrarMovimiento(m.id), 180);
  };

  const abajo = (e: PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    gesto.current = { x: e.clientX, y: e.clientY, base: dxRef.current };
    huboArrastre.current = false;
    ancho.current = e.currentTarget.offsetWidth;
  };

  const movimiento = (e: PointerEvent<HTMLDivElement>) => {
    const s = gesto.current;
    if (!s) return;
    const mx = e.clientX - s.x;
    const my = e.clientY - s.y;
    if (!s.dir) {
      if (Math.abs(mx) > 8 && Math.abs(mx) > Math.abs(my)) {
        s.dir = 'h';
        e.currentTarget.setPointerCapture(e.pointerId);
        setArrastrando(true);
      } else if (Math.abs(my) > 8) s.dir = 'v';
    }
    if (s.dir === 'h') {
      huboArrastre.current = true;
      mover(Math.min(0, Math.max(-ancho.current, s.base + mx)));
    }
  };

  const arriba = () => {
    const s = gesto.current;
    gesto.current = null;
    setArrastrando(false);
    if (s?.dir !== 'h') return;
    const v = dxRef.current;
    if (v < -ancho.current * 0.55) borrar();
    else mover(v < -ANCHO_BOTON / 2 ? -ANCHO_BOTON : 0);
  };

  // Tras un arrastre, o con la fila abierta, el toque cierra en lugar de abrir el movimiento.
  const clicCaptura = (e: MouseEvent) => {
    if (huboArrastre.current || dxRef.current !== 0) {
      e.stopPropagation();
      e.preventDefault();
      if (!huboArrastre.current) mover(0);
      huboArrastre.current = false;
    }
  };

  const esIngreso = m.tipo === 'ingreso';
  const detalle = [c.nombre, conFecha ? etiquetaDia(m.fecha) : null].filter(Boolean).join(' · ');

  return (
    <div className="deslizable">
      <button className="deslizable-borrar" style={{ width: Math.max(ANCHO_BOTON, -dx) }} onClick={borrar} tabIndex={dx === 0 ? -1 : 0} aria-label="Borrar">
        <Icono nombre="borrar" tam={20} />
        <span>Borrar</span>
      </button>
      <div
        className={`deslizable-contenido ${arrastrando ? 'arrastrando' : ''}`}
        style={{ transform: dx ? `translateX(${dx}px)` : undefined }}
        onPointerDown={abajo}
        onPointerMove={movimiento}
        onPointerUp={arriba}
        onPointerCancel={arriba}
        onClickCapture={clicCaptura}
      >
        <button className="fila fila-boton" onClick={onClick}>
          <span className="fila-icono" style={{ ['--cat' as string]: c.color }}>
            {c.emoji}
          </span>
          <span className="fila-texto">
            {m.nota || c.nombre}
            <small>
              {m.recurrenteId && <span title="Movimiento fijo">🔁 </span>}
              {detalle}
            </small>
          </span>
          <span className={`fila-valor ${esIngreso ? 'texto-verde' : ''}`}>
            {esIngreso ? '+' : '−'}
            {euros(m.importe)}
          </span>
        </button>
      </div>
    </div>
  );
}
