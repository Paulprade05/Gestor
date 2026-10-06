import { memo, useMemo, useState } from 'react';
import type { Meta } from '../types';
import { useEstado } from '../estado';
import { mesAnio } from '../lib/fechas';
import { centimos, euros, porcentaje } from '../lib/formato';
import { aportadoEntre, ahorroPlanificado, cierreMesAnterior, estadoMeta, metaPrincipal, metasActivas, rango } from '../lib/presupuesto';
import { EditorMeta, HojaAportar, plantillas, type Plantilla } from './HojasAhorro';
import { Barra, Icono, Interruptor, Seccion } from './ui';

export default memo(Ahorro);

function Ahorro() {
  const { metas, ajustes, guardarAjustes, diagnostico, limites } = useEstado();
  const [editor, setEditor] = useState<{ abierto: boolean; meta?: Meta; plantilla?: Plantilla }>({ abierto: false });
  const [aportarA, setAportarA] = useState<Meta | null>(null);
  const ahora = new Date();

  const activas = metasActivas(metas);
  const archivadas = metas.filter((m) => m.archivada);
  const [desde, hasta] = rango('mensual', ahora);
  const totalAhorrado = centimos(metas.reduce((s, m) => s + estadoMeta(m, ahora).ahorrado, 0));
  const planificado = ahorroPlanificado(metas, ahora);
  const aportadoMes = aportadoEntre(metas, desde, hasta);
  const redondeoMes = centimos(
    metas.flatMap((m) => m.aportaciones).reduce((s, a) => (a.nota === 'Redondeo' && a.fecha >= desde && a.fecha <= hasta ? s + a.importe : s), 0),
  );
  const sostenible = diagnostico?.ahorroMaximoSostenible;
  const principal = metaPrincipal(metas);

  // Fondo de emergencia: 3 meses de gastos fijos (del diagnóstico o, si no hay, de los límites).
  const fondo = useMemo(() => {
    const base = diagnostico?.gastosFijosTotales ?? limites.reduce((s, l) => s + l.mensual, 0);
    return Math.max(500, Math.round((base * 3) / 50) * 50);
  }, [diagnostico, limites]);
  const ideas = plantillas(fondo).filter((p) => !activas.some((m) => m.nombre === p.nombre));

  return (
    <div className="pantalla">
      <header className="cabecera-grande">
        <h1>Ahorro</h1>
      </header>

      <section className="hero hero-compacto" aria-label="Resumen del ahorro">
        <p className="hero-etiqueta">Tienes ahorrado</p>
        <p className="hero-cifra">{euros(totalAhorrado)}</p>
        <p className="hero-detalle">
          Este mes has apartado {euros(aportadoMes)} de {euros(planificado)} previstos
        </p>
        <Barra valor={planificado > 0 ? aportadoMes / planificado : 0} color="var(--rosa)" alto={8} />
        {sostenible !== undefined && planificado > sostenible + 5 && (
          <p className="hero-mini texto-naranja">
            Tus huchas piden {euros(planificado)}/mes y tu ahorro sostenible es {euros(sostenible)}. Alarga algún plazo o baja aportaciones.
          </p>
        )}
      </section>

      <TarjetaCierre />

      <Seccion
        titulo="Huchas"
        accion={
          <button className="boton-texto" onClick={() => setEditor({ abierto: true })}>
            + Nueva
          </button>
        }
      >
        {activas.length === 0 && (
          <div className="vacio">
            <p className="vacio-emoji">🐷</p>
            No tienes huchas activas. Crea una o elige una idea de abajo.
          </div>
        )}
        {activas.map((m) => (
          <TarjetaHucha key={m.id} meta={m} onEditar={() => setEditor({ abierto: true, meta: m })} onAportar={() => setAportarA(m)} />
        ))}
      </Seccion>

      {ideas.length > 0 && (
        <Seccion titulo="Ideas">
          <div className="chips chips-ideas">
            {ideas.map((p) => (
              <button key={p.nombre} className="chip" onClick={() => setEditor({ abierto: true, plantilla: p })}>
                {p.emoji} {p.nombre} <small>{euros(p.importe)}</small>
              </button>
            ))}
          </div>
        </Seccion>
      )}

      <Seccion titulo="Ahorro automático" pie={principal ? `Va a «${principal.nombre}», tu hucha principal.` : 'Crea una hucha para activarlo.'}>
        <div className="fila-interruptor fila-interruptor-tarjeta">
          <span>
            🪙 Redondeo al euro
            <small>Cada gasto se redondea hacia arriba y la diferencia se aparta. Un café de 1,80 € aparta 0,20 €.{redondeoMes > 0 && ` Este mes: ${euros(redondeoMes)}.`}</small>
          </span>
          <Interruptor activo={!!ajustes.redondeo} onCambio={(v) => void guardarAjustes({ ...ajustes, redondeo: v })} etiqueta="Redondeo al euro" />
        </div>
      </Seccion>

      {archivadas.length > 0 && (
        <Seccion titulo="Archivadas">
          {archivadas.map((m) => {
            const e = estadoMeta(m, ahora);
            return (
              <button className="fila fila-boton" key={m.id} onClick={() => setEditor({ abierto: true, meta: m })}>
                <span className="fila-icono">{m.emoji}</span>
                <span className="fila-texto">
                  {m.nombre}
                  <small>
                    {euros(e.ahorrado)} de {euros(m.importeObjetivo)} {e.completada ? '· conseguida 🎉' : ''}
                  </small>
                </span>
                <Icono nombre="chevron" tam={18} />
              </button>
            );
          })}
        </Seccion>
      )}

      <EditorMeta abierto={editor.abierto} meta={editor.meta} plantilla={editor.plantilla} onCerrar={() => setEditor((x) => ({ ...x, abierto: false }))} />
      <HojaAportar meta={aportarA} onCerrar={() => setAportarA(null)} />
    </div>
  );
}

function TarjetaHucha({ meta, onEditar, onAportar }: { meta: Meta; onEditar(): void; onAportar(): void }) {
  const e = estadoMeta(meta, new Date());
  const estadoTexto = e.completada ? '¡Conseguida!' : e.enCamino ? 'En camino' : `${euros(-e.diferencia)} por detrás`;
  return (
    <div className="hucha">
      <div className="meta-cabecera">
        <span className="meta-icono">{meta.emoji}</span>
        <div className="meta-titulo">
          <p className="meta-nombre">
            {meta.nombre} {meta.principal && <span className="pill pill-rosa">Principal</span>}
          </p>
          <p className="meta-cifras">
            <strong>{euros(e.ahorrado)}</strong> de {euros(meta.importeObjetivo)}
          </p>
        </div>
        <button className="boton-icono" onClick={onEditar} aria-label={`Editar ${meta.nombre}`}>
          <Icono nombre="menu" />
        </button>
      </div>
      <Barra valor={e.progreso} color="linear-gradient(90deg, var(--rosa-claro), var(--rosa))" alto={10} />
      <p className="meta-pie">
        {porcentaje(e.progreso)} · <span className={e.enCamino ? 'texto-verde' : 'texto-naranja'}>{estadoTexto}</span> · {euros(meta.aporteMensualPlanificado)}/mes · {mesAnio(meta.fechaLimite)}
      </p>
      {!e.completada && e.necesarioAlMes > meta.aporteMensualPlanificado + 1 && (
        <p className="meta-pie texto-naranja">Para llegar a tiempo harían falta {euros(Math.ceil(e.necesarioAlMes))}/mes</p>
      )}
      {!e.completada && (
        <button className="boton-secundario" onClick={onAportar}>
          Aportar
        </button>
      )}
    </div>
  );
}

/** Repaso del mes anterior: si sobró dinero, propone pasarlo a la hucha principal. */
export function TarjetaCierre() {
  const { movimientos, metas, usuario, ajustes, resolverCierre } = useEstado();
  const cierre = useMemo(() => (usuario ? cierreMesAnterior(movimientos, metas, usuario, new Date()) : null), [movimientos, metas, usuario]);
  const principal = metaPrincipal(metas);
  if (!cierre || ajustes.cierres?.includes(cierre.mes)) return null;

  const mes = mesAnio(`${cierre.mes}-01`).split(' ')[0];
  const detalle = `Entraron ${euros(cierre.ingresos)}, gastaste ${euros(cierre.gastos)} y apartaste ${euros(cierre.ahorrado)}.`;

  if (cierre.sobrante <= 0) {
    return (
      <section className="tarjeta cierre cierre-negativo">
        <p className="cierre-titulo">📉 En {mes} gastaste {euros(-cierre.sobrante)} más de lo que entró</p>
        <p className="cierre-detalle">{detalle} Revisa tus límites en Más → Presupuesto.</p>
        <div className="cierre-botones">
          <button className="boton-secundario" onClick={() => void resolverCierre(cierre.mes, null, 0)}>
            Entendido
          </button>
        </div>
      </section>
    );
  }

  const mitad = Math.floor(cierre.sobrante / 2);
  return (
    <section className="tarjeta cierre">
      <p className="cierre-titulo">
        🌸 En {mes} te sobraron <span className="texto-rosa">{euros(cierre.sobrante)}</span>
      </p>
      <p className="cierre-detalle">{detalle}</p>
      <div className="cierre-botones">
        {principal ? (
          <>
            <button className="boton-principal boton-pequeno" onClick={() => void resolverCierre(cierre.mes, principal.id, cierre.sobrante)}>
              Pasar todo a {principal.emoji}
            </button>
            {mitad >= 5 && (
              <button className="boton-secundario" onClick={() => void resolverCierre(cierre.mes, principal.id, mitad)}>
                La mitad
              </button>
            )}
          </>
        ) : null}
        <button className="boton-texto" onClick={() => void resolverCierre(cierre.mes, null, 0)}>
          Ahora no
        </button>
      </div>
    </section>
  );
}
