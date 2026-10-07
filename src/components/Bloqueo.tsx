/**
 * Bloqueo con código de 4 cifras.
 *
 * <Candado> envuelve la app: si hay código configurado, la tapa con la pantalla de bloqueo al abrirla
 * y al volver tras X minutos en segundo plano (con «Siempre», se bloquea al salir, así la captura
 * del selector de apps de iOS ya no muestra tus cuentas). La app sigue montada debajo, así que al
 * desbloquear todo está donde lo dejaste.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { Ajustes } from '../types';
import { useEstado } from '../estado';
import { hashCodigo, LONGITUD_CODIGO, nuevaSal } from '../lib/codigo';
import Hoja from './Hoja';
import { Icono, vibrar } from './ui';

type Config = NonNullable<Ajustes['bloqueo']>;

// ─── Teclado de código ───────────────────────────────────────────────────────

const TECLAS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '⌫'];

function TecladoCodigo({
  titulo,
  mensaje,
  error,
  onCompleto,
  bloqueado,
}: {
  titulo: string;
  mensaje: string;
  error?: string | null;
  /** Devuelve true si el código es correcto; si no, los puntos tiemblan y se borra. */
  onCompleto(codigo: string): Promise<boolean>;
  bloqueado?: boolean;
}) {
  const [codigo, setCodigo] = useState('');
  const [agitar, setAgitar] = useState(false);
  const ocupado = useRef(false);

  const pulsar = async (k: string) => {
    if (bloqueado || ocupado.current || !k) return;
    vibrar(5);
    if (k === '⌫') return setCodigo((c) => c.slice(0, -1));
    const nuevo = (codigo + k).slice(0, LONGITUD_CODIGO);
    setCodigo(nuevo);
    if (nuevo.length < LONGITUD_CODIGO) return;
    ocupado.current = true;
    const ok = await onCompleto(nuevo);
    if (ok) {
      setCodigo('');
      ocupado.current = false;
    } else {
      vibrar(80);
      setAgitar(true);
      setTimeout(() => {
        setAgitar(false);
        setCodigo('');
        ocupado.current = false;
      }, 450);
    }
  };

  // Teclado físico (iPad con teclado, ordenador)
  const pulsarRef = useRef(pulsar);
  pulsarRef.current = pulsar;
  useEffect(() => {
    const alPulsar = (e: KeyboardEvent) => {
      if (/^\d$/.test(e.key)) void pulsarRef.current(e.key);
      else if (e.key === 'Backspace') void pulsarRef.current('⌫');
    };
    window.addEventListener('keydown', alPulsar);
    return () => window.removeEventListener('keydown', alPulsar);
  }, []);

  return (
    <div className="codigo">
      <p className="codigo-titulo">{titulo}</p>
      <p className={`codigo-mensaje ${error ? 'texto-rojo' : ''}`} aria-live="polite">
        {error ?? mensaje}
      </p>
      <div className={`codigo-puntos ${agitar ? 'agitar' : ''}`} aria-label={`${codigo.length} de ${LONGITUD_CODIGO} cifras`}>
        {Array.from({ length: LONGITUD_CODIGO }, (_, i) => (
          <span key={i} className={i < codigo.length ? 'lleno' : ''} />
        ))}
      </div>
      <div className="teclado teclado-codigo">
        {TECLAS.map((k, i) =>
          k ? (
            <button key={k} className="tecla" disabled={bloqueado} onClick={() => void pulsar(k)} aria-label={k === '⌫' ? 'Borrar' : k}>
              {k === '⌫' ? <Icono nombre="teclaBorrar" tam={26} grosor={1.6} /> : k}
            </button>
          ) : (
            <span key={`v${i}`} />
          ),
        )}
      </div>
    </div>
  );
}

// ─── Pantalla de bloqueo ─────────────────────────────────────────────────────

const MAX_INTENTOS = 5;
const ESPERA_MS = 30_000;

function PantallaBloqueo({ cfg, onDesbloquear }: { cfg: Config; onDesbloquear(): void }) {
  const { usuario, borrarTodo } = useEstado();
  const [fallos, setFallos] = useState(0);
  const [esperaHasta, setEsperaHasta] = useState(0);
  const [, setTic] = useState(0);
  const segundos = Math.max(0, Math.ceil((esperaHasta - Date.now()) / 1000));

  useEffect(() => {
    if (!segundos) return;
    const t = setInterval(() => setTic((n) => n + 1), 500);
    return () => clearInterval(t);
  }, [segundos]);

  const comprobar = async (codigo: string) => {
    if ((await hashCodigo(codigo, cfg.sal)) === cfg.hash) {
      onDesbloquear();
      return true;
    }
    const n = fallos + 1;
    setFallos(n);
    if (n % MAX_INTENTOS === 0) setEsperaHasta(Date.now() + ESPERA_MS);
    return false;
  };

  return (
    <div className="bloqueo" role="dialog" aria-modal="true" aria-label="Hucha bloqueada">
      <div className="bloqueo-logo">🐷</div>
      <TecladoCodigo
        titulo={`Hola, ${usuario?.nombre ?? ''}`}
        mensaje="Introduce tu código"
        error={segundos ? `Demasiados intentos. Espera ${segundos} s` : fallos ? 'Código incorrecto' : null}
        bloqueado={segundos > 0}
        onCompleto={comprobar}
      />
      <button
        className="boton-texto bloqueo-olvido"
        onClick={async () => {
          const ok = window.confirm(
            'Sin el código solo se puede borrar todo lo guardado en este dispositivo. Si tienes una copia de seguridad, podrás restaurarla después. ¿Borrar todos los datos?',
          );
          if (ok) {
            await borrarTodo();
            onDesbloquear();
          }
        }}
      >
        ¿Has olvidado el código?
      </button>
    </div>
  );
}

// ─── Envoltorio ──────────────────────────────────────────────────────────────

export function Candado({ children }: { children: ReactNode }) {
  const { cargado, ajustes } = useEstado();
  const cfg = ajustes.bloqueo;
  const [bloqueado, setBloqueado] = useState(false);
  const iniciado = useRef(false);
  const ocultoDesde = useRef<number | null>(null);

  // Al abrir la app con código configurado, empieza bloqueada.
  useEffect(() => {
    if (!cargado || iniciado.current) return;
    iniciado.current = true;
    if (cfg) setBloqueado(true);
  }, [cargado, cfg]);

  useEffect(() => {
    if (!cfg) return;
    const alCambiar = () => {
      if (document.visibilityState === 'hidden') {
        ocultoDesde.current = Date.now();
        if (cfg.minutos === 0) setBloqueado(true);
      } else if (ocultoDesde.current !== null && Date.now() - ocultoDesde.current >= cfg.minutos * 60_000) {
        setBloqueado(true);
      }
    };
    document.addEventListener('visibilitychange', alCambiar);
    return () => document.removeEventListener('visibilitychange', alCambiar);
  }, [cfg]);

  // Mientras no se ha decidido (primer render con datos), se trata como bloqueada: así no asoma nada.
  const activo = !!cfg && cargado && (bloqueado || !iniciado.current);
  return (
    <>
      <div className="candado-contenido" inert={activo} aria-hidden={activo || undefined}>
        {children}
      </div>
      {activo && <PantallaBloqueo cfg={cfg} onDesbloquear={() => setBloqueado(false)} />}
    </>
  );
}

// ─── Crear / comprobar el código desde Ajustes ───────────────────────────────

export function HojaCodigo({
  modo,
  onCerrar,
  onHecho,
}: {
  modo: 'crear' | 'verificar' | null;
  onCerrar(): void;
  onHecho(cfg?: Pick<Config, 'hash' | 'sal'>): void;
}) {
  const titulo = modo === 'crear' ? 'Nuevo código' : 'Tu código';
  return (
    <Hoja abierta={modo !== null} onCerrar={onCerrar} titulo={titulo} etiqueta={titulo}>
      {modo && <FormularioCodigo key={modo} modo={modo} onHecho={onHecho} />}
    </Hoja>
  );
}

function FormularioCodigo({ modo, onHecho }: { modo: 'crear' | 'verificar'; onHecho(cfg?: Pick<Config, 'hash' | 'sal'>): void }) {
  const { ajustes } = useEstado();
  const [primero, setPrimero] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (modo === 'verificar') {
    return (
      <TecladoCodigo
        titulo="Introduce tu código"
        mensaje="Para desactivar el bloqueo"
        error={error}
        onCompleto={async (c) => {
          const cfg = ajustes.bloqueo;
          if (cfg && (await hashCodigo(c, cfg.sal)) === cfg.hash) {
            onHecho();
            return true;
          }
          setError('Código incorrecto');
          return false;
        }}
      />
    );
  }

  return (
    <TecladoCodigo
      titulo={primero ? 'Repite el código' : `Elige un código de ${LONGITUD_CODIGO} cifras`}
      mensaje={primero ? 'Para confirmar' : 'Te lo pediremos al abrir la app'}
      error={error}
      onCompleto={async (c) => {
        if (!primero) {
          setPrimero(c);
          setError(null);
          return true;
        }
        if (c !== primero) {
          setPrimero(null);
          setError('No coinciden. Vuelve a empezar');
          return false;
        }
        const sal = nuevaSal();
        onHecho({ sal, hash: await hashCodigo(c, sal) });
        return true;
      }}
    />
  );
}
