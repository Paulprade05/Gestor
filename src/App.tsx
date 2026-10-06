import { useCallback, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Movimiento } from './types';
import { useEstado } from './estado';
import Ahorro from './components/Ahorro';
import Dashboard from './components/Dashboard';
import Mas from './components/Mas';
import Movimientos from './components/Movimientos';
import Onboarding from './components/Onboarding';
import RegistroRapido from './components/RegistroRapido';
import { Icono, vibrar, type NombreIcono } from './components/ui';

type Pestana = 'inicio' | 'movimientos' | 'ahorro' | 'mas';

const PESTANAS: { id: Pestana; texto: string; icono: NombreIcono }[] = [
  { id: 'inicio', texto: 'Inicio', icono: 'inicio' },
  { id: 'movimientos', texto: 'Movimientos', icono: 'lista' },
  { id: 'ahorro', texto: 'Ahorro', icono: 'hucha' },
  { id: 'mas', texto: 'Más', icono: 'menu' },
];

export default function App() {
  const { cargado, usuario, celebracion } = useEstado();
  const [pestana, setPestana] = useState<Pestana>('inicio');
  // Las pestañas ya visitadas siguen montadas (ocultas): cambiar es instantáneo y conservan
  // su scroll y sus filtros, como en una app nativa.
  const [visitadas, setVisitadas] = useState<ReadonlySet<Pestana>>(() => new Set(['inicio']));
  const [reinicioMas, setReinicioMas] = useState(0);
  const zonas = useRef<Partial<Record<Pestana, HTMLElement | null>>>({});
  const [hoja, setHoja] = useState<{ abierta: boolean; movimiento?: Movimiento }>({ abierta: false });
  const pestanaActual = useRef(pestana);
  pestanaActual.current = pestana;

  // Callbacks estables: las pantallas están memorizadas y no se repintan al cambiar de pestaña.
  const irA = useCallback((p: Pestana) => {
    if (p === pestanaActual.current) {
      // Tocar la pestaña activa: sube al principio (y en «Más», vuelve al menú).
      zonas.current[p]?.scrollTo({ top: 0, behavior: 'smooth' });
      if (p === 'mas') setReinicioMas((n) => n + 1);
      return;
    }
    setVisitadas((v) => (v.has(p) ? v : new Set([...v, p])));
    setPestana(p);
  }, []);
  const editar = useCallback((movimiento: Movimiento) => setHoja({ abierta: true, movimiento }), []);
  const verTodo = useCallback(() => irA('movimientos'), [irA]);
  const irAhorro = useCallback(() => irA('ahorro'), [irA]);

  if (!cargado) return <div className="splash" aria-label="Cargando">🐷</div>;
  if (!usuario?.onboardingCompletado) return <Onboarding />;

  const nuevo = () => {
    vibrar(10);
    setHoja({ abierta: true });
  };

  const contenido: Record<Pestana, () => ReactNode> = {
    inicio: () => <Dashboard onEditar={editar} onVerTodo={verTodo} onIrAhorro={irAhorro} />,
    movimientos: () => <Movimientos onEditar={editar} />,
    ahorro: () => <Ahorro />,
    mas: () => <Mas key={reinicioMas} />,
  };

  return (
    <div className="app">
      {PESTANAS.filter((p) => visitadas.has(p.id)).map((p) => (
        <main
          key={p.id}
          ref={(el) => {
            zonas.current[p.id] = el;
          }}
          className="scroll contenido"
          hidden={pestana !== p.id}
        >
          {contenido[p.id]()}
        </main>
      ))}

      <nav className="tabbar" aria-label="Secciones">
        {PESTANAS.slice(0, 2).map((p) => (
          <BotonPestana key={p.id} {...p} activa={pestana === p.id} onClick={() => irA(p.id)} />
        ))}
        <button className="tabbar-anadir" onClick={nuevo} aria-label="Apuntar gasto o ingreso">
          <Icono nombre="mas" tam={28} grosor={2.6} />
        </button>
        {PESTANAS.slice(2).map((p) => (
          <BotonPestana key={p.id} {...p} activa={pestana === p.id} onClick={() => irA(p.id)} />
        ))}
      </nav>

      <RegistroRapido abierto={hoja.abierta} movimiento={hoja.movimiento} onCerrar={() => setHoja((h) => ({ ...h, abierta: false }))} />
      <Toasts />
      {celebracion && <Confeti key={celebracion} />}
    </div>
  );
}

function BotonPestana({ texto, icono, activa, onClick }: { texto: string; icono: NombreIcono; activa: boolean; onClick(): void }) {
  return (
    <button className={`tabbar-boton ${activa ? 'activa' : ''}`} onClick={onClick} aria-current={activa ? 'page' : undefined}>
      <Icono nombre={icono} tam={24} grosor={activa ? 2.2 : 1.8} />
      <span>{texto}</span>
    </button>
  );
}

function Toasts() {
  const { toasts, cerrarToast } = useEstado();
  return (
    <div className="toasts" aria-live="assertive">
      {toasts.map((t) => (
        <div key={t.id} className={`toast toast-${t.nivel}`} role="status" onClick={() => cerrarToast(t.id)}>
          <span className="toast-icono">{t.icono ?? (t.nivel === 'excedido' ? '🚨' : t.nivel === 'aviso' ? '⚠️' : '✨')}</span>
          <span className="toast-texto">{t.texto}</span>
          {t.accion && (
            <button
              className="toast-accion"
              onClick={(e) => {
                e.stopPropagation();
                t.accion!.ejecutar();
                cerrarToast(t.id);
              }}
            >
              {t.accion.texto}
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

const COLORES_CONFETI = ['#ff4f8b', '#ffb3cf', '#d81b60', '#ffd166', '#c3a6ff'];

function Confeti() {
  const piezas = useMemo(
    () =>
      Array.from({ length: 48 }, (_, i) => ({
        left: Math.random() * 100,
        delay: Math.random() * 0.5,
        duracion: 2.2 + Math.random() * 1.2,
        color: COLORES_CONFETI[i % COLORES_CONFETI.length],
        giro: Math.random() * 720 - 360,
        ancho: 6 + Math.random() * 6,
      })),
    [],
  );
  return (
    <div className="confeti" aria-hidden="true">
      {piezas.map((p, i) => (
        <i
          key={i}
          style={{
            left: `${p.left}%`,
            width: p.ancho,
            height: p.ancho * 0.45,
            background: p.color,
            animationDelay: `${p.delay}s`,
            animationDuration: `${p.duracion}s`,
            ['--giro' as string]: `${p.giro}deg`,
          }}
        />
      ))}
    </div>
  );
}
