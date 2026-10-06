import { memo, useEffect, useMemo, useState } from 'react';
import type { EstadoLimite, Movimiento, Periodo } from '../types';
import { useEstado } from '../estado';
import { categoria } from '../lib/categorias';
import { deISO, diasDelMes, mesAnio } from '../lib/fechas';
import { euros, porcentaje } from '../lib/formato';
import { gastoPorDia, metaPrincipal, metasActivas, proximosRecurrentes, resumenDashboard, type GastoDia } from '../lib/presupuesto';
import { TarjetaCierre } from './Ahorro';
import { FilaMovimiento } from './FilaMovimiento';
import { Anillo, Barra, Segmentado, Seccion } from './ui';

/** Fuerza un recálculo al cambiar de día con la app abierta (o al volver a ella). */
function useAhora(): Date {
  const [ahora, setAhora] = useState(() => new Date());
  useEffect(() => {
    const refrescar = () => setAhora(new Date());
    const t = setInterval(refrescar, 60_000);
    document.addEventListener('visibilitychange', refrescar);
    return () => {
      clearInterval(t);
      document.removeEventListener('visibilitychange', refrescar);
    };
  }, []);
  return ahora;
}

const saludo = (h: number) => (h < 6 ? 'Buenas noches' : h < 14 ? 'Buenos días' : h < 21 ? 'Buenas tardes' : 'Buenas noches');

interface Props {
  onEditar(m: Movimiento): void;
  onVerTodo(): void;
  onIrAhorro(): void;
}

export default memo(Dashboard);

function Dashboard({ onEditar, onVerTodo, onIrAhorro }: Props) {
  const { usuario, limites, movimientos, metas, recurrentes, aportar } = useEstado();
  const ahora = useAhora();
  const [periodo, setPeriodo] = useState<Periodo>('mensual');
  const r = useMemo(() => resumenDashboard(usuario!, limites, movimientos, metas, ahora), [usuario, limites, movimientos, metas, ahora]);
  const semana = useMemo(() => gastoPorDia(movimientos, ahora), [movimientos, ahora]);
  const proximos = useMemo(() => proximosRecurrentes(recurrentes, ahora, 10).slice(0, 4), [recurrentes, ahora]);

  const principal = metaPrincipal(metas);
  const otrasHuchas = metasActivas(metas).length - (principal ? 1 : 0);
  const pasado = r.restanteVariable < 0;
  const pendienteAportar = principal && r.meta ? Math.max(0, principal.aporteMensualPlanificado - r.meta.aportadoEsteMes) : 0;
  const filas = periodo === 'mensual' ? r.limitesMes : r.limitesSemana;
  const fecha = ahora.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
  const mes = mesAnio(ahora).split(' ')[0];
  const queda = r.presupuestoVariable > 0 ? Math.max(0, r.restanteVariable) / r.presupuestoVariable : 0;
  const ing = r.ingresos;

  return (
    <div className="pantalla">
      <header className="cabecera-grande">
        <p className="cabecera-fecha">{fecha}</p>
        <h1>
          {saludo(ahora.getHours())}, {usuario!.nombre}
        </h1>
      </header>

      {/* ── Balance ── */}
      <section className={`hero ${pasado ? 'hero-alerta' : ''}`} aria-label="Balance del mes">
        <p className="hero-etiqueta">Disponible en {mes}</p>
        <p className="hero-cifra">{euros(r.disponibleMes)}</p>
        <div className="hero-flujo">
          <span>
            <small>Ingresos{ing.registradoHabitual ? '' : ' previstos'}</small>
            <strong className="texto-verde">+{euros(ing.efectivos)}</strong>
          </span>
          <span>
            <small>Gastado</small>
            <strong>−{euros(r.gastadoMes)}</strong>
          </span>
          <span>
            <small>A huchas</small>
            <strong className="texto-rosa">{euros(r.ahorroPlanificado)}</strong>
          </span>
        </div>
        {ing.extra > 0 && <p className="hero-mini">Incluye {euros(ing.extra)} de ingresos extra este mes ✨</p>}

        <div className="hero-diario">
          <Anillo valor={queda} color={pasado ? 'var(--rojo)' : queda < 0.2 ? 'var(--naranja)' : 'var(--rosa)'}>
            <strong>{r.diasRestantes}</strong>
            <small>{r.diasRestantes === 1 ? 'día' : 'días'}</small>
          </Anillo>
          <div className="hero-diario-texto">
            <p className="hero-etiqueta">Puedes gastar hoy</p>
            <p className="hero-cifra-media">
              {euros(Math.floor(r.restanteDiario))}
              <small> /día</small>
            </p>
            <p className="hero-mini">
              {pasado ? `Te has pasado ${euros(-r.restanteVariable)}` : `Quedan ${euros(r.restanteVariable)} de ${euros(r.presupuestoVariable)} para el día a día`}
            </p>
          </div>
        </div>

        <Barra valor={r.consumoPresupuesto} marca={r.avanceMes} nivel={r.consumoPresupuesto > r.avanceMes + 0.1 ? 'aviso' : undefined} color="var(--rosa)" alto={8} />
        <p className="hero-detalle">
          {porcentaje(r.consumoPresupuesto)} del presupuesto gastado · {porcentaje(r.avanceMes)} del mes
        </p>
      </section>

      <TarjetaCierre />

      {/* ── Hucha principal ── */}
      {principal && r.meta && (
        <Seccion
          titulo="Ahorro"
          accion={
            <button className="boton-texto" onClick={onIrAhorro}>
              {otrasHuchas > 0 ? `+${otrasHuchas} huchas` : 'Ver'}
            </button>
          }
        >
          <div className="meta">
            <div className="meta-cabecera">
              <span className="meta-icono">{principal.emoji}</span>
              <div className="meta-titulo">
                <p className="meta-nombre">{principal.nombre}</p>
                <p className="meta-cifras">
                  <strong>{euros(r.meta.ahorrado)}</strong> de {euros(principal.importeObjetivo)}
                </p>
              </div>
              <span className={`pill ${r.meta.enCamino ? 'pill-verde' : 'pill-naranja'}`}>
                {r.meta.completada ? '¡Conseguida!' : r.meta.enCamino ? 'En camino' : `${euros(-r.meta.diferencia)} por detrás`}
              </span>
            </div>
            <Barra valor={r.meta.progreso} color="linear-gradient(90deg, var(--rosa-claro), var(--rosa))" alto={12} />
            <p className="meta-pie">
              {porcentaje(r.meta.progreso)} · este mes {euros(r.meta.aportadoEsteMes)} de {euros(principal.aporteMensualPlanificado)} · plazo {mesAnio(principal.fechaLimite)}
            </p>
            {!r.meta.completada && pendienteAportar > 0 && (
              <button className="boton-secundario" onClick={() => void aportar(principal.id, pendienteAportar, 'Aportación del mes')}>
                Apartar {euros(pendienteAportar)} de este mes
              </button>
            )}
          </div>
        </Seccion>
      )}

      {/* ── Próximos fijos ── */}
      {proximos.length > 0 && (
        <Seccion titulo="Próximos fijos">
          {proximos.map((p) => {
            const c = categoria(p.recurrente.categoria);
            const ingreso = p.recurrente.tipo === 'ingreso';
            return (
              <div className="fila" key={p.recurrente.id}>
                <span className="fila-icono" style={{ ['--cat' as string]: c.color }}>
                  {c.emoji}
                </span>
                <span className="fila-texto">
                  {p.recurrente.nota || c.nombre}
                  <small>{p.dias === 0 ? 'Hoy' : p.dias === 1 ? 'Mañana' : `En ${p.dias} días · ${deISO(p.fecha).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}`}</small>
                </span>
                <span className={`fila-valor ${ingreso ? 'texto-verde' : ''}`}>
                  {ingreso ? '+' : '−'}
                  {euros(p.recurrente.importe)}
                </span>
              </div>
            );
          })}
        </Seccion>
      )}

      {/* ── Últimos 7 días ── */}
      <Seccion titulo="Esta semana">
        <GraficoSemana dias={semana} referencia={r.presupuestoVariable / diasDelMes(ahora)} />
      </Seccion>

      {/* ── Límites ── */}
      <Seccion
        titulo="Límites"
        accion={<Segmentado opciones={[{ valor: 'mensual', texto: 'Mes' }, { valor: 'semanal', texto: 'Semana' }]} valor={periodo} onCambio={setPeriodo} />}
        pie={periodo === 'mensual' && r.gastadoSinLimite > 0 ? `Además, ${euros(r.gastadoSinLimite)} en categorías sin límite propio (salen del margen del día a día).` : undefined}
      >
        {filas.length === 0 && <p className="vacio">{periodo === 'mensual' ? 'Sin límites. Ponlos en Más → Presupuesto.' : 'Sin límites semanales configurados.'}</p>}
        {filas.map((e) => (
          <FilaLimite key={e.categoria} e={e} />
        ))}
      </Seccion>

      {/* ── Últimos movimientos ── */}
      <Seccion
        titulo="Últimos movimientos"
        accion={
          movimientos.length > 0 && (
            <button className="boton-texto" onClick={onVerTodo}>
              Ver todos
            </button>
          )
        }
        pie={movimientos.length > 0 ? 'Desliza a la izquierda para borrar.' : undefined}
      >
        {movimientos.length === 0 && (
          <div className="vacio">
            <p className="vacio-emoji">🌸</p>
            Aún no has apuntado nada.
            <br />
            Pulsa <strong className="texto-rosa">＋</strong> para añadir un gasto o un ingreso.
          </div>
        )}
        {movimientos.slice(0, 6).map((m) => (
          <FilaMovimiento key={m.id} m={m} onClick={() => onEditar(m)} />
        ))}
      </Seccion>
    </div>
  );
}

const INICIAL_DIA = ['D', 'L', 'M', 'X', 'J', 'V', 'S'];

function GraficoSemana({ dias, referencia }: { dias: GastoDia[]; referencia: number }) {
  const max = Math.max(referencia * 1.3, ...dias.map((d) => d.total), 1);
  const total = dias.reduce((s, d) => s + d.total, 0);
  const diasPorEncima = dias.filter((d) => d.total > referencia).length;

  return (
    <div className="grafico">
      <div className="grafico-zona">
        {referencia > 0 && <div className="grafico-ref" style={{ bottom: `${(referencia / max) * 100}%` }} />}
        {dias.map((d, i) => (
          <div className="grafico-col" key={d.fecha} aria-label={`${d.fecha}: ${euros(d.total)}`}>
            {d.total > 0 && <span className="grafico-valor">{Math.round(d.total)}</span>}
            <div
              className={`grafico-barra ${d.total > referencia ? 'sobre' : ''} ${i === dias.length - 1 ? 'hoy' : ''}`}
              style={{ height: `${Math.max(d.total > 0 ? 4 : 0, (d.total / max) * 100)}%` }}
            />
          </div>
        ))}
      </div>
      <div className="grafico-dias">
        {dias.map((d, i) => (
          <span key={d.fecha} className={i === dias.length - 1 ? 'hoy' : ''}>
            {i === dias.length - 1 ? 'Hoy' : INICIAL_DIA[deISO(d.fecha).getDay()]}
          </span>
        ))}
      </div>
      <p className="grafico-pie">
        {euros(total)} en 7 días (día a día) · tu ritmo ideal es {euros(Math.round(referencia))}/día
        {diasPorEncima > 0 && ` · ${diasPorEncima} ${diasPorEncima === 1 ? 'día' : 'días'} por encima`}
      </p>
    </div>
  );
}

function FilaLimite({ e }: { e: EstadoLimite }) {
  const c = categoria(e.categoria);
  return (
    <div className={`limite nivel-${e.nivel}`}>
      <div className="limite-cabecera">
        <span className="fila-icono fila-icono-pequeno" style={{ ['--cat' as string]: c.color }}>
          {c.emoji}
        </span>
        <span className="fila-texto">{c.nombre}</span>
        {e.nivel !== 'ok' && <span className={`pill pill-${e.nivel === 'aviso' ? 'naranja' : 'rojo'}`}>{Math.round(e.ratio * 100)} %</span>}
        <span className="limite-cifras">
          {euros(e.gastado)} <span className="apagado">/ {euros(e.limite)}</span>
        </span>
      </div>
      <Barra valor={e.limite > 0 ? e.gastado / e.limite : e.gastado > 0 ? 1 : 0} nivel={e.nivel} color={c.color} />
      <p className="limite-pie">{e.restante >= 0 ? `Quedan ${euros(e.restante)}` : `Te has pasado ${euros(-e.restante)}`}</p>
    </div>
  );
}
