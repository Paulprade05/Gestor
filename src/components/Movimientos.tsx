import { memo, useMemo, useState } from 'react';
import type { CategoriaId, Movimiento, TipoMovimiento } from '../types';
import { useEstado } from '../estado';
import { categoria } from '../lib/categorias';
import { aISO, diasDelMes, etiquetaDia, finMes, inicioMes, mesAnio } from '../lib/fechas';
import { centimos, euros, porcentaje } from '../lib/formato';
import { calendarioMes, evolucionMensual, presupuestoDiario, type DiaCalendario } from '../lib/analisis';
import { comparativaMensual, ingresosDelMes, totalEntre, totalPorCategoria } from '../lib/presupuesto';
import { FilaMovimiento } from './FilaMovimiento';
import { Icono, Segmentado } from './ui';

type Filtro = 'todos' | TipoMovimiento;

export default memo(Movimientos);

function Movimientos({ onEditar }: { onEditar(m: Movimiento): void }) {
  const { movimientos, usuario } = useEstado();
  const [mes, setMes] = useState(() => inicioMes(new Date()));
  const [vista, setVista] = useState<'lista' | 'analisis'>('lista');
  const [tipo, setTipo] = useState<Filtro>('todos');
  const [filtroCat, setFiltroCat] = useState<CategoriaId | null>(null);
  const [busqueda, setBusqueda] = useState('');

  const desde = aISO(mes);
  const hasta = aISO(finMes(mes));
  const esMesActual = desde === aISO(inicioMes(new Date()));
  const titulo = mesAnio(mes);

  const gastosCat = useMemo(() => totalPorCategoria(movimientos, desde, hasta, 'gasto'), [movimientos, desde, hasta]);
  const ingresosCat = useMemo(() => totalPorCategoria(movimientos, desde, hasta, 'ingreso'), [movimientos, desde, hasta]);
  const ing = useMemo(() => ingresosDelMes(movimientos, usuario?.ingresosNetosMensuales ?? 0, mes), [movimientos, usuario, mes]);
  const gastos = totalEntre(movimientos, desde, hasta, 'gasto');
  const balance = centimos(ing.efectivos - gastos);
  const tasaAhorro = ing.efectivos > 0 ? balance / ing.efectivos : 0;

  const texto = busqueda.trim().toLocaleLowerCase('es');
  const lista = useMemo(
    () =>
      movimientos.filter((m) => {
        if (texto) {
          // La búsqueda recorre todos los meses.
          const c = categoria(m.categoria);
          return `${m.nota ?? ''} ${c.nombre} ${String(m.importe).replace('.', ',')}`.toLocaleLowerCase('es').includes(texto);
        }
        return m.fecha >= desde && m.fecha <= hasta && (tipo === 'todos' || m.tipo === tipo) && (!filtroCat || m.categoria === filtroCat);
      }),
    [movimientos, texto, desde, hasta, tipo, filtroCat],
  );

  const porDia = useMemo(() => {
    const grupos = new Map<string, Movimiento[]>();
    for (const m of lista) grupos.set(m.fecha, [...(grupos.get(m.fecha) ?? []), m]);
    return [...grupos.entries()];
  }, [lista]);

  // Chips de categoría: solo las que tienen movimientos este mes para el tipo elegido.
  const chipsCat = useMemo(() => {
    const fuente = tipo === 'ingreso' ? ingresosCat : tipo === 'gasto' ? gastosCat : { ...gastosCat, ...ingresosCat };
    return Object.entries(fuente).sort((a, b) => b[1] - a[1]);
  }, [tipo, gastosCat, ingresosCat]);

  const cambiarMes = (delta: number) => {
    setMes((m) => new Date(m.getFullYear(), m.getMonth() + delta, 1));
    setFiltroCat(null);
  };

  return (
    <div className="pantalla">
      <header className="cabecera-grande">
        <h1>Movimientos</h1>
      </header>

      <div className="tarjeta resumen-mes">
        <div className="selector-mes">
          <button className="boton-icono" onClick={() => cambiarMes(-1)} aria-label="Mes anterior">
            <Icono nombre="atras" />
          </button>
          <strong>{titulo.charAt(0).toUpperCase() + titulo.slice(1)}</strong>
          <button className="boton-icono girado" disabled={esMesActual} onClick={() => cambiarMes(1)} aria-label="Mes siguiente">
            <Icono nombre="atras" />
          </button>
        </div>

        <div className="estadisticas">
          <div>
            <small>Ingresos{ing.registradoHabitual || !esMesActual ? '' : '*'}</small>
            <strong className="texto-verde">+{euros(ing.efectivos)}</strong>
          </div>
          <div>
            <small>Gastos</small>
            <strong>−{euros(gastos)}</strong>
          </div>
          <div>
            <small>Balance</small>
            <strong className={balance >= 0 ? 'texto-rosa' : 'texto-rojo'}>
              {balance >= 0 ? '+' : '−'}
              {euros(Math.abs(balance))}
            </strong>
          </div>
        </div>
        <p className="resumen-nota">
          {ing.efectivos > 0 && (balance >= 0 ? `Te queda el ${porcentaje(tasaAhorro)} de lo que entra` : `Gastas un ${porcentaje(-tasaAhorro)} más de lo que entra`)}
          {!ing.registradoHabitual && esMesActual && ' · *incluye tus ingresos previstos'}
        </p>

        {gastos > 0 && (
          <div className="reparto reparto-mes" aria-hidden="true">
            {Object.entries(gastosCat)
              .sort((a, b) => b[1] - a[1])
              .map(([id, v]) => (
                <div key={id} style={{ flex: v, background: categoria(id).color, opacity: filtroCat && filtroCat !== id ? 0.25 : 1 }} />
              ))}
          </div>
        )}
      </div>

      <div className="vista-selector">
        <Segmentado
          opciones={[
            { valor: 'lista', texto: 'Lista' },
            { valor: 'analisis', texto: 'Análisis' },
          ]}
          valor={vista}
          onCambio={setVista}
        />
      </div>

      {vista === 'analisis' ? (
        <Analisis movimientos={movimientos} mes={mes} />
      ) : (
        <>
          <label className="buscador">
            <Icono nombre="buscar" tam={18} />
            <input type="search" placeholder="Buscar en todos los meses" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} enterKeyHint="search" />
          </label>

          {!texto && (
            <div className="chips chips-desplazables chips-filtro">
              {(['todos', 'gasto', 'ingreso'] as Filtro[]).map((t) => (
                <button
                  key={t}
                  className={`chip ${tipo === t ? 'activa' : ''}`}
                  onClick={() => {
                    setTipo(t);
                    setFiltroCat(null);
                  }}
                >
                  {t === 'todos' ? 'Todos' : t === 'gasto' ? 'Gastos' : 'Ingresos'}
                </button>
              ))}
              <span className="chips-separador" />
              {chipsCat.map(([id, v]) => {
                const c = categoria(id);
                return (
                  <button
                    key={id}
                    className={`chip chip-categoria ${filtroCat === id ? 'activa' : ''}`}
                    style={{ ['--cat' as string]: c.color }}
                    onClick={() => setFiltroCat(filtroCat === id ? null : id)}
                  >
                    {c.emoji} {c.nombre} <small>{euros(Math.round(v))}</small>
                  </button>
                );
              })}
            </div>
          )}

          {texto && <p className="seccion-pie">{lista.length === 0 ? 'Sin resultados' : `${lista.length} resultados`}</p>}

          {porDia.length === 0 && !texto && (
            <div className="vacio vacio-grande">
              <p className="vacio-emoji">🌷</p>
              No hay movimientos {filtroCat ? 'de esta categoría ' : ''}en este mes.
            </div>
          )}
          {porDia.map(([dia, ms]) => {
            const neto = centimos(ms.reduce((s, m) => s + (m.tipo === 'ingreso' ? m.importe : -m.importe), 0));
            return (
              <section className="seccion seccion-dia" key={dia}>
                <div className="seccion-cabecera">
                  <h3>{texto ? `${etiquetaDia(dia)} ${dia.slice(0, 4)}` : etiquetaDia(dia)}</h3>
                  <span className={neto > 0 ? 'texto-verde' : 'apagado'}>
                    {neto > 0 ? '+' : neto < 0 ? '−' : ''}
                    {euros(Math.abs(neto))}
                  </span>
                </div>
                <div className="tarjeta">
                  {ms.map((m) => (
                    <FilaMovimiento key={m.id} m={m} conFecha={false} onClick={() => onEditar(m)} />
                  ))}
                </div>
              </section>
            );
          })}
        </>
      )}
    </div>
  );
}

/** Ingresos y gastos de los últimos 6 meses (desde que se usa la app). */
function Evolucion() {
  const { movimientos, metas, usuario } = useEstado();
  const meses = useMemo(() => (usuario ? evolucionMensual(movimientos, metas, usuario) : []), [movimientos, metas, usuario]);
  if (meses.length < 2) return null;
  const max = Math.max(1, ...meses.flatMap((m) => [m.ingresos, m.gastos]));
  const total = meses.reduce((s, m) => ({ ingresos: s.ingresos + m.ingresos, gastos: s.gastos + m.gastos, ahorrado: s.ahorrado + m.ahorrado }), { ingresos: 0, gastos: 0, ahorrado: 0 });
  const balanceMedio = (total.ingresos - total.gastos) / meses.length;

  return (
    <section className="seccion">
      <div className="seccion-cabecera">
        <h2>Evolución</h2>
      </div>
      <div className="tarjeta evolucion">
        <div className="evolucion-zona">
          {meses.map((m) => (
            <div className="evolucion-mes" key={m.mes} aria-label={`${m.etiqueta}: ingresos ${euros(m.ingresos)}, gastos ${euros(m.gastos)}`}>
              <div className="evolucion-barras">
                <div className="evo-ingresos" style={{ height: `${(m.ingresos / max) * 100}%` }} />
                <div className={`evo-gastos ${m.gastos > m.ingresos ? 'excedido' : ''}`} style={{ height: `${(m.gastos / max) * 100}%` }} />
              </div>
              <span>{m.etiqueta}</span>
            </div>
          ))}
        </div>
        <div className="evolucion-leyenda">
          <span>
            <i className="evo-ingresos" />
            Ingresos
          </span>
          <span>
            <i className="evo-gastos" />
            Gastos
          </span>
        </div>
        <p className="grafico-pie importe">
          En {meses.length} meses te ha quedado una media de {euros(Math.round(balanceMedio))}/mes y has apartado {euros(Math.round(total.ahorrado))} a tus huchas.
        </p>
      </div>
    </section>
  );
}

const DIAS_SEMANA = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];

/** Calendario del mes con el gasto del día a día de cada día frente al presupuesto diario. */
function Calendario({ mes }: { mes: Date }) {
  const { movimientos, limites } = useEstado();
  const semanas = useMemo(() => calendarioMes(movimientos, limites, mes), [movimientos, limites, mes]);
  const [sel, setSel] = useState<DiaCalendario | null>(null);
  const hoy = aISO(new Date());
  const tope = presupuestoDiario(limites, mes);

  return (
    <section className="seccion">
      <div className="seccion-cabecera">
        <h2>Calendario</h2>
        {tope > 0 && <span className="apagado importe">Presupuesto {euros(Math.round(tope))}/día</span>}
      </div>
      <div className="tarjeta calendario">
        <div className="calendario-fila calendario-cabecera">
          {DIAS_SEMANA.map((d) => (
            <span key={d}>{d}</span>
          ))}
        </div>
        {semanas.map((s, i) => (
          <div className="calendario-fila" key={i}>
            {s.map((c, j) =>
              c ? (
                <button
                  key={c.fecha}
                  className={`cal-dia nivel-${c.nivel} ${c.fecha === hoy ? 'hoy' : ''} ${sel?.fecha === c.fecha ? 'sel' : ''}`}
                  disabled={c.futuro}
                  onClick={() => setSel(c)}
                  aria-label={`${c.dia}: ${euros(c.total)}`}
                >
                  {c.dia}
                </button>
              ) : (
                <span key={`v${j}`} />
              ),
            )}
          </div>
        ))}
        <p className="grafico-pie importe">
          {sel
            ? `${etiquetaDia(sel.fecha)}: ${euros(sel.variable)} en el día a día${sel.total > sel.variable ? ` + ${euros(centimos(sel.total - sel.variable))} en fijos` : ''} · ${sel.movimientos} ${sel.movimientos === 1 ? 'gasto' : 'gastos'}`
            : 'Toca un día para ver lo que gastaste. Rosa: dentro de tu presupuesto diario; naranja y rojo: por encima.'}
        </p>
      </div>
    </section>
  );
}

/** Comparativa por categoría con el mes anterior. */
function Analisis({ movimientos, mes }: { movimientos: Movimiento[]; mes: Date }) {
  const filas = useMemo(() => comparativaMensual(movimientos, mes, 'gasto'), [movimientos, mes]);
  const ingresos = useMemo(() => comparativaMensual(movimientos, mes, 'ingreso'), [movimientos, mes]);
  const max = Math.max(1, ...filas.map((f) => Math.max(f.actual, f.anterior)));
  const totalActual = centimos(filas.reduce((s, f) => s + f.actual, 0));
  const totalAnterior = centimos(filas.reduce((s, f) => s + f.anterior, 0));
  const esMesActual = aISO(mes) === aISO(inicioMes(new Date()));
  const diasTranscurridos = esMesActual ? new Date().getDate() : diasDelMes(mes);
  const mediaDiaria = totalActual / diasTranscurridos;
  const mesAnterior = mesAnio(new Date(mes.getFullYear(), mes.getMonth() - 1, 1)).split(' ')[0];

  if (filas.length === 0 && ingresos.length === 0) {
    return (
      <div className="vacio vacio-grande">
        <p className="vacio-emoji">📊</p>
        Aún no hay datos para comparar.
      </div>
    );
  }

  return (
    <>
      <section className="seccion">
        <div className="tarjeta analisis-resumen">
          <div>
            <small>Gasto medio diario</small>
            <strong>{euros(Math.round(mediaDiaria))}</strong>
          </div>
          <div>
            <small>vs. {mesAnterior}</small>
            <strong className={totalActual > totalAnterior ? 'texto-rojo' : 'texto-verde'}>
              {totalAnterior > 0 ? `${totalActual > totalAnterior ? '▲' : '▼'} ${porcentaje(Math.abs(totalActual - totalAnterior) / totalAnterior)}` : '—'}
            </strong>
          </div>
          {esMesActual && (
            <div>
              <small>Proyección del mes</small>
              <strong>{euros(Math.round(mediaDiaria * diasDelMes(mes)))}</strong>
            </div>
          )}
        </div>
        {esMesActual && <p className="seccion-pie">El mes actual va por el día {diasTranscurridos}; se compara con {mesAnterior} completo.</p>}
      </section>

      <Evolucion />
      <Calendario mes={mes} />

      <section className="seccion">
        <div className="seccion-cabecera">
          <h2>Gastos por categoría</h2>
        </div>
        <div className="tarjeta">
          {filas.map((f) => {
            const c = categoria(f.categoria);
            const sube = f.diferencia > 0;
            return (
              <div className="comparativa" key={f.categoria}>
                <span className="fila-icono fila-icono-pequeno" style={{ ['--cat' as string]: c.color }}>
                  {c.emoji}
                </span>
                <div className="comparativa-cuerpo">
                  <div className="comparativa-cabecera">
                    <span className="fila-texto">{c.nombre}</span>
                    <strong>{euros(f.actual)}</strong>
                  </div>
                  <div className="comparativa-barras">
                    <div style={{ width: `${(f.actual / max) * 100}%`, background: c.color }} />
                    <div className="anterior" style={{ width: `${(f.anterior / max) * 100}%` }} />
                  </div>
                  <small className="apagado">
                    {mesAnterior}: {euros(f.anterior)}
                    {f.variacion !== null && Math.abs(f.diferencia) >= 1 && (
                      <span className={sube ? 'texto-rojo' : 'texto-verde'}>
                        {' '}
                        · {sube ? '▲' : '▼'} {porcentaje(Math.abs(f.variacion))}
                      </span>
                    )}
                    {f.variacion === null && f.actual > 0 && <span className="texto-naranja"> · nuevo</span>}
                  </small>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {ingresos.length > 0 && (
        <section className="seccion">
          <div className="seccion-cabecera">
            <h2>Ingresos registrados</h2>
          </div>
          <div className="tarjeta">
            {ingresos.map((f) => {
              const c = categoria(f.categoria);
              return (
                <div className="fila" key={f.categoria}>
                  <span className="fila-icono" style={{ ['--cat' as string]: c.color }}>
                    {c.emoji}
                  </span>
                  <span className="fila-texto">
                    {c.nombre}
                    <small>
                      {mesAnterior}: {euros(f.anterior)}
                    </small>
                  </span>
                  <span className="fila-valor texto-verde">+{euros(f.actual)}</span>
                </div>
              );
            })}
          </div>
        </section>
      )}
    </>
  );
}
