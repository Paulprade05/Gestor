import { useEffect, useMemo, useState } from 'react';
import type { CategoriaId, Limite } from '../types';
import { useEstado } from '../estado';
import { categoria, categoriasDe } from '../lib/categorias';
import { euros, parseImporte } from '../lib/formato';
import { limitesDesdeDiagnostico, SEMANAS_POR_MES } from '../lib/plan';
import { ahorroPlanificado } from '../lib/presupuesto';
import { Resultado } from './Onboarding';

interface FilaBorrador {
  categoria: CategoriaId;
  mensual: number | null;
  semanal: number | null;
  umbralAviso: number;
}

const aBorrador = (limites: Limite[]): FilaBorrador[] => {
  const porCat = new Map(limites.map((l) => [l.categoria, l]));
  const ids = [...new Set([...limites.map((l) => l.categoria), ...categoriasDe('gasto').map((c) => c.id)])];
  return ids.map((id) => {
    const l = porCat.get(id);
    return { categoria: id, mensual: l ? l.mensual : null, semanal: l && l.semanal > 0 ? l.semanal : null, umbralAviso: l?.umbralAviso ?? 0.8 };
  });
};

const aLimites = (filas: FilaBorrador[]): Limite[] =>
  filas.filter((f) => f.mensual !== null).map((f) => ({ categoria: f.categoria, mensual: f.mensual!, semanal: f.semanal ?? 0, umbralAviso: f.umbralAviso }));

export default function Presupuesto() {
  const { limites, diagnostico, usuario, metas, categorias, actualizarLimites, repetirOnboarding, notificar } = useEstado();
  const [borrador, setBorrador] = useState<FilaBorrador[]>(() => aBorrador(limites));
  // `categorias` como dependencia: al crear u ocultar categorías cambian las filas.
  useEffect(() => setBorrador(aBorrador(limites)), [limites, categorias]);

  const nuevos = useMemo(() => aLimites(borrador), [borrador]);
  const cambiado = JSON.stringify(nuevos) !== JSON.stringify(limites);
  const totalLimites = nuevos.reduce((s, l) => s + l.mensual, 0);
  const ingresos = usuario?.ingresosNetosMensuales ?? 0;
  const planificado = ahorroPlanificado(metas, new Date());
  const margen = ingresos - totalLimites - planificado;

  const set = (i: number, cambios: Partial<FilaBorrador>) => setBorrador((fs) => fs.map((f, j) => (j === i ? { ...f, ...cambios } : f)));

  return (
    <div className="pantalla">
      <section className="seccion">
        <div className="seccion-cabecera">
          <h2>Techos de gasto</h2>
        </div>
        <div className="tarjeta">
          <div className="tabla-limites">
            <div className="tabla-limites-cabecera">
              <span />
              <span>Mes</span>
              <span>Semana</span>
            </div>
            {borrador.map((f, i) => {
              const c = categoria(f.categoria);
              return (
                <div className={`tabla-limites-fila ${f.mensual === null ? 'sin-limite' : ''}`} key={f.categoria}>
                  <span>
                    {c.emoji} {c.nombre}
                  </span>
                  <CampoLimite
                    etiqueta={`Límite mensual de ${c.nombre}`}
                    valor={f.mensual}
                    onCambio={(v) =>
                      set(i, {
                        mensual: v,
                        semanal: v === null ? null : c.tipo === 'variable' ? Math.round(v / SEMANAS_POR_MES) : f.semanal,
                      })
                    }
                  />
                  <CampoLimite etiqueta={`Límite semanal de ${c.nombre}`} valor={f.semanal} onCambio={(v) => set(i, { semanal: v })} desactivado={f.mensual === null} />
                </div>
              );
            })}
          </div>
          <div className="botonera">
            {diagnostico && (
              <button className="boton-texto" onClick={() => setBorrador(aBorrador([...limitesDesdeDiagnostico(diagnostico)]))}>
                Recomendados
              </button>
            )}
            <button
              className="boton-principal boton-pequeno"
              disabled={!cambiado}
              onClick={async () => {
                await actualizarLimites(nuevos);
                notificar('Límites guardados');
              }}
            >
              Guardar
            </button>
          </div>
        </div>
        <p className="seccion-pie">
          Total {euros(totalLimites)}/mes + {euros(planificado)} a huchas ={' '}
          <span className={margen < 0 ? 'texto-rojo' : ''}>{margen >= 0 ? `te sobran ${euros(margen)}` : `te faltan ${euros(-margen)}`}</span> de tus {euros(ingresos)} de
          ingresos. Vacío = sin límite propio (lo que gastes ahí sale del margen del día a día). Se avisa al 80 % y al 100 %.
        </p>
      </section>

      {diagnostico && (
        <section className="seccion">
          <div className="seccion-cabecera">
            <h2>Diagnóstico</h2>
            <button className="boton-texto" onClick={() => void repetirOnboarding()}>
              Repetir
            </button>
          </div>
          <p className="seccion-pie">
            Calculado el {new Date(diagnostico.creadoEn).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })}
          </p>
          <Resultado d={diagnostico} />
        </section>
      )}
    </div>
  );
}

function CampoLimite({ valor, onCambio, etiqueta, desactivado }: { valor: number | null; onCambio(v: number | null): void; etiqueta: string; desactivado?: boolean }) {
  const aTexto = (v: number | null) => (v === null ? '' : String(v).replace('.', ','));
  const [texto, setTexto] = useState(aTexto(valor));
  useEffect(() => {
    // Solo se reescribe si cambia desde fuera (no mientras se teclea «12,»).
    setTexto((t) => ((t.trim() === '' ? null : parseImporte(t)) !== valor ? aTexto(valor) : t));
  }, [valor]);
  return (
    <span className={`campo-importe-caja ${desactivado ? 'desactivado' : ''}`}>
      <input
        aria-label={etiqueta}
        type="text"
        inputMode="decimal"
        placeholder="—"
        disabled={desactivado}
        value={texto}
        onChange={(e) => {
          const t = e.target.value.replace(/[^\d.,]/g, '');
          setTexto(t);
          onCambio(t.trim() === '' ? null : parseImporte(t));
        }}
      />
      <span className="campo-sufijo">€</span>
    </span>
  );
}
