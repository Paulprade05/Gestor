/**
 * Registro rápido de gastos e ingresos en una hoja inferior.
 *
 * - Teclado numérico propio: no abre el teclado del sistema, no hay zoom y se apunta en 3 toques
 *   (importe → categoría → guardar). Con teclado físico también funcionan dígitos, coma, retroceso e Intro.
 * - Antes de guardar un gasto avisa si va a cruzar el 80 % o el 100 % del límite (mensual o semanal).
 * - Atajos con los movimientos más repetidos y opción «Cada mes» para convertirlo en fijo.
 */
import { useMemo, useRef, useState, type KeyboardEvent, type RefObject } from 'react';
import type { AlertaLimite, CategoriaId, Movimiento, TipoMovimiento } from '../types';
import { useEstado } from '../estado';
import { categoria, categoriasDe } from '../lib/categorias';
import { aISO, deISO, hoyISO, sumarDias } from '../lib/fechas';
import { euros, parseImporte } from '../lib/formato';
import { impactoGasto, ingresosDelMes, movimientosFrecuentes, ordenarPorUso, rango, totalPorCategoria } from '../lib/presupuesto';
import Hoja from './Hoja';
import { Icono, Segmentado, vibrar } from './ui';

const MAX_ENTEROS = 6;
const TECLAS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', ',', '0', '⌫'];
const ORDEN = { ok: 0, aviso: 1, excedido: 2 } as const;

function pulsarTecla(t: string, k: string): string {
  if (k === '⌫') return t.slice(0, -1);
  if (k === ',') return t.includes(',') ? t : `${t || '0'},`;
  const [ent, dec] = t.split(',');
  if (dec !== undefined) return dec.length >= 2 ? t : t + k;
  if (ent.length >= MAX_ENTEROS) return t;
  return t === '0' ? k : t + k;
}

/** «1234,5» → «1.234,5» solo para mostrar. */
function mostrarImporte(t: string): string {
  if (!t) return '0';
  const [ent, dec] = t.split(',');
  const agrupado = ent.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return dec === undefined ? agrupado : `${agrupado},${dec}`;
}

type Aviso = { texto: string; nivel: AlertaLimite['nivel'] | 'info' };

function mensajeImpacto(peor: AlertaLimite | undefined, nombreCat: string): Aviso | null {
  if (!peor) return null;
  const periodo = peor.periodo === 'mensual' ? 'mensual' : 'semanal';
  if (peor.nivel === 'excedido') {
    return {
      nivel: 'excedido',
      texto: peor.restante < 0 ? `Superarás tu límite ${periodo} de ${nombreCat} en ${euros(-peor.restante)}` : `Agotarás tu límite ${periodo} de ${nombreCat}`,
    };
  }
  if (peor.nivel === 'aviso') return { nivel: 'aviso', texto: `Llegarás al ${Math.round(peor.ratio * 100)} % de tu límite ${periodo} de ${nombreCat}` };
  return { nivel: 'ok', texto: `Te quedarán ${euros(peor.restante)} en ${nombreCat} ${peor.periodo === 'mensual' ? 'este mes' : 'esta semana'}` };
}

interface Props {
  abierto: boolean;
  movimiento?: Movimiento;
  tipoInicial?: TipoMovimiento;
  onCerrar(): void;
}

export default function RegistroRapido({ abierto, movimiento, tipoInicial = 'gasto', onCerrar }: Props) {
  const { borrarMovimiento } = useEstado();
  const teclas = useRef<((e: KeyboardEvent) => void) | null>(null);
  const titulo = movimiento ? (movimiento.tipo === 'gasto' ? 'Editar gasto' : 'Editar ingreso') : 'Apuntar';

  return (
    <Hoja
      abierta={abierto}
      onCerrar={onCerrar}
      titulo={titulo}
      etiqueta={titulo}
      onKeyDown={(e) => teclas.current?.(e)}
      derecha={
        movimiento && (
          <button
            className="boton-texto texto-rojo"
            aria-label="Borrar"
            onClick={() => {
              onCerrar();
              void borrarMovimiento(movimiento.id); // se puede deshacer desde la notificación
            }}
          >
            <Icono nombre="borrar" tam={20} />
          </button>
        )
      }
    >
      <Formulario key={movimiento?.id ?? `nuevo-${tipoInicial}`} movimiento={movimiento} tipoInicial={tipoInicial} onCerrar={onCerrar} teclas={teclas} />
    </Hoja>
  );
}

function Formulario({
  movimiento,
  tipoInicial,
  onCerrar,
  teclas,
}: {
  movimiento?: Movimiento;
  tipoInicial: TipoMovimiento;
  onCerrar(): void;
  teclas: RefObject<((e: KeyboardEvent) => void) | null>;
}) {
  const { movimientos, limites, usuario, guardarMovimiento } = useEstado();
  const [tipo, setTipo] = useState<TipoMovimiento>(movimiento?.tipo ?? tipoInicial);
  const [texto, setTexto] = useState(movimiento ? String(movimiento.importe).replace('.', ',') : '');
  const [fecha, setFecha] = useState(movimiento?.fecha ?? hoyISO());
  const [nota, setNota] = useState(movimiento?.nota ?? '');
  const [repetir, setRepetir] = useState(false);
  const [guardando, setGuardando] = useState(false);

  const categorias = useMemo(() => {
    const visibles = categoriasDe(tipo).map((c) => c.id);
    // La del movimiento que se edita se muestra aunque esté oculta.
    if (movimiento && movimiento.tipo === tipo && !visibles.includes(movimiento.categoria)) visibles.unshift(movimiento.categoria);
    return ordenarPorUso(visibles, movimientos);
  }, [tipo, movimientos, movimiento]);

  const [cat, setCat] = useState<CategoriaId>(movimiento?.categoria ?? categorias[0]);
  const catValida = categorias.includes(cat) ? cat : categorias[0];

  const cambiarTipo = (t: TipoMovimiento) => {
    setTipo(t);
    setCat(ordenarPorUso(categoriasDe(t).map((c) => c.id), movimientos)[0]);
    setRepetir(false);
  };

  const importe = parseImporte(texto);
  const otros = useMemo(() => (movimiento ? movimientos.filter((g) => g.id !== movimiento.id) : movimientos), [movimientos, movimiento]);
  const frecuentes = useMemo(() => (movimiento ? [] : movimientosFrecuentes(movimientos, tipo)), [movimientos, movimiento, tipo]);

  const restantesMes = useMemo(() => {
    const [desde, hasta] = rango('mensual', deISO(fecha));
    const gastado = totalPorCategoria(otros, desde, hasta);
    return Object.fromEntries(limites.map((l) => [l.categoria, l.mensual - (gastado[l.categoria] ?? 0)])) as Record<CategoriaId, number>;
  }, [otros, limites, fecha]);

  const aviso = useMemo<Aviso | null>(() => {
    const c = categoria(catValida);
    if (tipo === 'ingreso') {
      if (c.tipo === 'fija') {
        const ing = ingresosDelMes(otros, usuario?.ingresosNetosMensuales ?? 0, deISO(fecha));
        return { nivel: 'info', texto: `Ingreso habitual: sustituye a los ${euros(ing.previstos)} previstos del mes` };
      }
      return { nivel: 'info', texto: 'Ingreso extra: te propondremos apartar una parte' };
    }
    const r = restantesMes[catValida];
    if (r === undefined) return { nivel: 'info', texto: `${c.nombre} no tiene límite propio: sale de tu margen del día a día` };
    if (!(importe > 0)) {
      return r >= 0 ? { nivel: 'ok', texto: `Quedan ${euros(r)} en ${c.nombre} este mes` } : { nivel: 'excedido', texto: `${c.nombre} ya va ${euros(-r)} por encima del límite` };
    }
    const impacto = impactoGasto(otros, limites, { tipo, importe, categoria: catValida, fecha });
    // Lo más grave primero; a igualdad, el que más se acerca al tope.
    const peor = [...impacto].sort((a, b) => ORDEN[b.nivel] - ORDEN[a.nivel] || b.ratio - a.ratio)[0];
    return mensajeImpacto(peor, c.nombre);
  }, [importe, catValida, fecha, otros, limites, restantesMes, tipo, usuario]);

  const pulsar = (k: string) => {
    vibrar(5);
    setTexto((t) => pulsarTecla(t, k));
  };

  const guardar = async () => {
    if (!(importe > 0) || guardando) return;
    setGuardando(true);
    try {
      await guardarMovimiento({ id: movimiento?.id, tipo, importe, categoria: catValida, fecha, nota }, { repetir });
      vibrar(15);
      onCerrar();
    } finally {
      setGuardando(false);
    }
  };

  teclas.current = (e: KeyboardEvent) => {
    if ((e.target as HTMLElement).tagName === 'INPUT') return;
    if (/^\d$/.test(e.key)) pulsar(e.key);
    else if (e.key === ',' || e.key === '.') pulsar(',');
    else if (e.key === 'Backspace') pulsar('⌫');
    else if (e.key === 'Enter') void guardar();
    else return;
    e.preventDefault();
  };

  const hoy = hoyISO();
  const ayer = aISO(sumarDias(new Date(), -1));
  const otraFecha = fecha !== hoy && fecha !== ayer;
  const esIngreso = tipo === 'ingreso';

  return (
    <>
      {!movimiento && (
        <div className="registro-tipo">
          <Segmentado
            opciones={[
              { valor: 'gasto', texto: 'Gasto' },
              { valor: 'ingreso', texto: 'Ingreso' },
            ]}
            valor={tipo}
            onCambio={cambiarTipo}
          />
        </div>
      )}

      <div className={`registro-importe ${esIngreso ? 'es-ingreso' : ''}`} aria-live="polite">
        {esIngreso && texto && <span className="registro-signo">+</span>}
        <span className={texto ? '' : 'apagado'}>{mostrarImporte(texto)}</span>
        <span className="registro-moneda">€</span>
      </div>

      <div className={`registro-aviso nivel-${aviso?.nivel ?? 'ok'}`} role={aviso?.nivel === 'excedido' ? 'alert' : 'status'}>
        {aviso && (aviso.nivel === 'aviso' || aviso.nivel === 'excedido') && <Icono nombre="aviso" tam={16} />}
        <span>{aviso?.texto ?? ' '}</span>
      </div>

      {frecuentes.length > 0 && (
        <div className="chips chips-desplazables chips-frecuentes" aria-label="Frecuentes">
          {frecuentes.map((f) => {
            const activo = nota === f.nota && catValida === f.categoria && importe === f.importe;
            return (
              <button
                key={`${f.categoria}|${f.nota}`}
                className={`chip ${activo ? 'activa' : ''}`}
                onClick={() => {
                  vibrar(5);
                  setTexto(String(f.importe).replace('.', ','));
                  setCat(f.categoria);
                  setNota(f.nota);
                }}
              >
                {categoria(f.categoria).emoji} {f.nota} <small>{euros(f.importe)}</small>
              </button>
            );
          })}
        </div>
      )}

      <div className="registro-categorias" role="radiogroup" aria-label="Categoría">
        {categorias.map((id) => {
          const c = categoria(id);
          const r = esIngreso ? undefined : restantesMes[id];
          return (
            <button
              key={id}
              role="radio"
              aria-checked={catValida === id}
              className={`registro-cat ${catValida === id ? 'activa' : ''}`}
              style={{ ['--cat' as string]: c.color }}
              onClick={() => {
                vibrar(5);
                setCat(id);
              }}
            >
              <span className="registro-cat-emoji">{c.emoji}</span>
              <span className="registro-cat-nombre">{c.nombre}</span>
              <span className={`registro-cat-resto ${r !== undefined && r < 0 ? 'texto-rojo' : ''}`}>{r !== undefined ? euros(Math.round(r)) : ' '}</span>
            </button>
          );
        })}
      </div>

      <div className="registro-extra">
        <div className="chips chips-compactos">
          <button className={`chip ${fecha === hoy ? 'activa' : ''}`} onClick={() => setFecha(hoy)}>
            Hoy
          </button>
          <button className={`chip ${fecha === ayer ? 'activa' : ''}`} onClick={() => setFecha(ayer)}>
            Ayer
          </button>
          <label className={`chip chip-fecha ${otraFecha ? 'activa' : ''}`}>
            {otraFecha ? deISO(fecha).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' }) : 'Otra…'}
            <input type="date" value={fecha} onChange={(e) => e.target.value && setFecha(e.target.value)} aria-label="Fecha" />
          </label>
          {!movimiento && (
            <button className={`chip ${repetir ? 'activa' : ''}`} onClick={() => setRepetir((v) => !v)} aria-pressed={repetir}>
              🔁 Cada mes
            </button>
          )}
        </div>
        <input
          className="registro-nota"
          type="text"
          placeholder={esIngreso ? 'Concepto (opcional)' : 'Nota (opcional)'}
          value={nota}
          maxLength={80}
          enterKeyHint="done"
          onChange={(e) => setNota(e.target.value)}
        />
      </div>

      <div className="teclado">
        {TECLAS.map((k) => (
          <button key={k} className="tecla" onClick={() => pulsar(k)} aria-label={k === '⌫' ? 'Borrar' : k === ',' ? 'Coma decimal' : k}>
            {k === '⌫' ? <Icono nombre="teclaBorrar" tam={26} grosor={1.6} /> : k}
          </button>
        ))}
      </div>

      <div className="hoja-pie">
        <button
          className={`boton-principal ${esIngreso ? 'boton-ingreso' : aviso?.nivel === 'excedido' && importe > 0 ? 'boton-peligro' : ''}`}
          disabled={!(importe > 0) || guardando}
          onClick={() => void guardar()}
        >
          {importe > 0 ? `${movimiento ? 'Guardar' : esIngreso ? 'Añadir ingreso' : 'Añadir gasto'} · ${euros(importe)}` : 'Introduce un importe'}
        </button>
      </div>
    </>
  );
}
