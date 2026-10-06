/**
 * Hoja inferior al estilo iOS, reutilizable: fondo oscurecido, asa, cabecera con «Cancelar»,
 * título y acción a la derecha, y cierre arrastrando hacia abajo, tocando el fondo o con Escape.
 */
import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react';

interface Props {
  abierta: boolean;
  onCerrar(): void;
  titulo: ReactNode;
  etiqueta: string;
  derecha?: ReactNode;
  children: ReactNode;
  onKeyDown?(e: KeyboardEvent): void;
}

export default function Hoja({ abierta, onCerrar, titulo, etiqueta, derecha, children, onKeyDown }: Props) {
  const [arrastre, setArrastre] = useState(0);
  const inicio = useRef<number | null>(null);
  const hojaRef = useRef<HTMLDivElement>(null);
  // El contenido sigue montado mientras dura la animación de cierre.
  const [montada, setMontada] = useState(abierta);

  useEffect(() => {
    if (!abierta) {
      const t = setTimeout(() => setMontada(false), 450);
      return () => clearTimeout(t);
    }
    setMontada(true);
    setArrastre(0);
    hojaRef.current?.focus({ preventScroll: true });
  }, [abierta]);

  const empezar = (e: PointerEvent) => {
    if ((e.target as HTMLElement).closest('button, input, select')) return;
    inicio.current = e.clientY;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const mover = (e: PointerEvent) => {
    if (inicio.current !== null) setArrastre(Math.max(0, e.clientY - inicio.current));
  };
  const soltar = () => {
    if (inicio.current === null) return;
    inicio.current = null;
    if (arrastre > 110) onCerrar();
    else setArrastre(0);
  };

  return (
    <>
      <div className={`fondo-hoja ${abierta ? 'visible' : ''}`} onClick={onCerrar} aria-hidden="true" />
      <div
        ref={hojaRef}
        className={`hoja ${abierta ? 'abierta' : ''} ${arrastre > 0 ? 'arrastrando' : ''}`}
        style={abierta && arrastre ? { transform: `translateY(${arrastre}px)` } : undefined}
        role="dialog"
        aria-modal="true"
        aria-label={etiqueta}
        tabIndex={-1}
        inert={!abierta}
        onKeyDown={(e) => {
          if (e.key === 'Escape') return onCerrar();
          onKeyDown?.(e);
        }}
      >
        <div className="hoja-agarre" onPointerDown={empezar} onPointerMove={mover} onPointerUp={soltar} onPointerCancel={soltar}>
          <div className="hoja-asa" />
          <div className="hoja-cabecera">
            <button className="boton-texto" onClick={onCerrar}>
              Cancelar
            </button>
            <div className="hoja-titulo">{titulo}</div>
            <div className="hoja-derecha">{derecha}</div>
          </div>
        </div>
        {/* Se desmonta al cerrar: cada apertura empieza con el formulario limpio. */}
        {(abierta || montada) && children}
      </div>
    </>
  );
}
