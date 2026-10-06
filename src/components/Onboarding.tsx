import { useMemo, useState } from 'react';
import type { Diagnostico, PerfilGasto, RespuestasOnboarding } from '../types';
import { useEstado } from '../estado';
import { categoria } from '../lib/categorias';
import { mesAnio } from '../lib/fechas';
import { euros, porcentaje } from '../lib/formato';
import { generarDiagnostico, PERFILES } from '../lib/plan';
import { estadoMeta, metaPrincipal } from '../lib/presupuesto';
import { CampoImporte, Icono } from './ui';

const PASOS = ['bienvenida', 'ingresos', 'fijos', 'perfil', 'capacidad', 'objetivo', 'resultado'] as const;
const SUGERENCIAS_META = ['Fondo de emergencia', 'Viaje', 'Coche', 'Entrada de un piso'];
const PLAZOS = [3, 6, 12, 24, 36];

const RESPUESTAS_VACIAS: RespuestasOnboarding = {
  ingresosNetos: 0,
  gastosFijos: { vivienda: 0, comida: 0, transporte: 0, suscripciones: 0 },
  perfilGasto: 'equilibrado',
  capacidadAhorroEstimada: 0,
  objetivo: { nombre: '', importe: 0, plazoMeses: 12, ahorroActual: 0 },
};

export const TEXTO_VIABILIDAD: Record<Diagnostico['viabilidad'], { texto: string; clase: string }> = {
  holgada: { texto: 'Holgado', clase: 'pill-verde' },
  viable: { texto: 'Viable', clase: 'pill-verde' },
  ajustada: { texto: 'Ajustado', clase: 'pill-naranja' },
  inviable: { texto: 'Fuera de plazo', clase: 'pill-rojo' },
  'sin-margen': { texto: 'Sin margen', clase: 'pill-rojo' },
};

export default function Onboarding() {
  const { usuario, diagnostico, metas, completarOnboarding, cancelarOnboarding } = useEstado();
  const repitiendo = Boolean(diagnostico);

  const [paso, setPaso] = useState(repitiendo ? 1 : 0);
  const [nombre, setNombre] = useState(usuario?.nombre ?? '');
  const [r, setR] = useState<RespuestasOnboarding>(() => {
    if (!diagnostico) return RESPUESTAS_VACIAS;
    const principal = metaPrincipal(metas);
    const ahorrado = principal ? estadoMeta(principal, new Date()).ahorrado : diagnostico.respuestas.objetivo.ahorroActual;
    return {
      ...diagnostico.respuestas,
      gastosFijos: { transporte: 0, ...diagnostico.respuestas.gastosFijos },
      objetivo: { ...diagnostico.respuestas.objetivo, ahorroActual: ahorrado },
    };
  });

  const fijos = r.gastosFijos.vivienda + r.gastosFijos.comida + r.gastosFijos.suscripciones + (r.gastosFijos.transporte ?? 0);
  const margen = r.ingresosNetos - fijos;
  const id = PASOS[paso];
  const resultado = useMemo(() => (id === 'resultado' ? generarDiagnostico(r) : null), [id, r]);

  const set = (cambios: Partial<RespuestasOnboarding>) => setR((x) => ({ ...x, ...cambios }));
  const setFijo = (k: keyof RespuestasOnboarding['gastosFijos'], v: number) => setR((x) => ({ ...x, gastosFijos: { ...x.gastosFijos, [k]: v } }));
  const setObj = (cambios: Partial<RespuestasOnboarding['objetivo']>) => setR((x) => ({ ...x, objetivo: { ...x.objetivo, ...cambios } }));

  const puedeSeguir: Record<(typeof PASOS)[number], boolean> = {
    bienvenida: nombre.trim().length > 0,
    ingresos: r.ingresosNetos > 0,
    fijos: fijos > 0,
    perfil: true,
    capacidad: true,
    objetivo: r.objetivo.nombre.trim().length > 0 && r.objetivo.importe > 0 && r.objetivo.plazoMeses >= 1,
    resultado: true,
  };

  const siguiente = async () => {
    if (!puedeSeguir[id]) return;
    if (id === 'resultado' && resultado) return completarOnboarding(nombre, resultado);
    setPaso((p) => p + 1);
  };
  const atras = () => (paso > (repitiendo ? 1 : 0) ? setPaso((p) => p - 1) : repitiendo && cancelarOnboarding());

  return (
    <div className="onb">
      <header className="onb-barra">
        {paso > 0 || repitiendo ? (
          <button className="boton-icono" onClick={atras} aria-label={paso <= 1 && repitiendo ? 'Cancelar' : 'Atrás'}>
            <Icono nombre="atras" />
          </button>
        ) : (
          <span className="boton-icono" />
        )}
        <div className="onb-progreso">
          <div style={{ width: `${(paso / (PASOS.length - 1)) * 100}%` }} />
        </div>
        <span className="onb-paso">{paso >= 1 && paso <= 5 ? `${paso}/5` : ''}</span>
      </header>

      <form
        className="onb-cuerpo scroll"
        onSubmit={(e) => {
          e.preventDefault();
          void siguiente();
        }}
        key={id}
      >
        {id === 'bienvenida' && (
          <>
            <div className="onb-emoji">🐷</div>
            <h1>Tu plan de ahorro en 2 minutos</h1>
            <p className="onb-sub">Te haremos 5 preguntas para calcular cuánto puedes ahorrar, cuánto gastar en cada cosa y cuándo llegarás a tu meta. Todo se queda en tu iPhone.</p>
            <label className="campo">
              <span className="campo-etiqueta">¿Cómo te llamas?</span>
              <input type="text" autoComplete="given-name" enterKeyHint="next" placeholder="Tu nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} />
            </label>
          </>
        )}

        {id === 'ingresos' && (
          <>
            <h1>¿Cuánto cobras al mes?</h1>
            <p className="onb-sub">Ingresos netos recurrentes: lo que te entra en la cuenta cada mes (nómina, pensión, alquileres…). Si cobras pagas extra, divide el total anual entre 12.</p>
            <CampoImporte id="ingresos" valor={r.ingresosNetos} onCambio={(v) => set({ ingresosNetos: v })} etiqueta="Ingresos netos mensuales" autoFocus />
          </>
        )}

        {id === 'fijos' && (
          <>
            <h1>Gastos fijos indispensables</h1>
            <p className="onb-sub">Lo que pagas sí o sí cada mes. Una estimación vale; luego podrás ajustarlo.</p>
            <CampoImporte id="vivienda" valor={r.gastosFijos.vivienda} onCambio={(v) => setFijo('vivienda', v)} etiqueta="🏠 Vivienda y facturas (alquiler/hipoteca, luz, agua, seguros)" autoFocus />
            <CampoImporte id="comida" valor={r.gastosFijos.comida} onCambio={(v) => setFijo('comida', v)} etiqueta="🛒 Comida (compra del mes)" />
            <CampoImporte id="transporte" valor={r.gastosFijos.transporte ?? 0} onCambio={(v) => setFijo('transporte', v)} etiqueta="🚗 Transporte (abono, gasolina, parking…)" />
            <CampoImporte id="suscripciones" valor={r.gastosFijos.suscripciones} onCambio={(v) => setFijo('suscripciones', v)} etiqueta="📺 Suscripciones (streaming, gimnasio, apps…)" />
            {r.ingresosNetos > 0 && fijos > 0 && (
              <p className={`onb-nota ${fijos / r.ingresosNetos > 0.5 ? 'texto-naranja' : ''}`}>
                Total {euros(fijos)} · {porcentaje(fijos / r.ingresosNetos)} de tus ingresos
                {fijos / r.ingresosNetos > 0.5 ? ' (lo sano es ≤ 50 %)' : ''}
              </p>
            )}
          </>
        )}

        {id === 'perfil' && (
          <>
            <h1>¿Cómo gastas?</h1>
            <p className="onb-sub">Sé sincero: un plan que no encaja contigo no se cumple.</p>
            <div className="opciones" role="radiogroup">
              {(Object.keys(PERFILES) as PerfilGasto[]).map((p) => (
                <button
                  type="button"
                  key={p}
                  role="radio"
                  aria-checked={r.perfilGasto === p}
                  className={`opcion ${r.perfilGasto === p ? 'activa' : ''}`}
                  onClick={() => set({ perfilGasto: p })}
                >
                  <span className="opcion-emoji">{PERFILES[p].emoji}</span>
                  <span>
                    <strong>{PERFILES[p].titulo}</strong>
                    <small>{PERFILES[p].descripcion}</small>
                  </span>
                  {r.perfilGasto === p && <Icono nombre="check" tam={20} />}
                </button>
              ))}
            </div>
          </>
        )}

        {id === 'capacidad' && (
          <>
            <h1>¿Cuánto crees que puedes ahorrar?</h1>
            <p className="onb-sub">
              Tras tus gastos fijos te quedan <strong>{euros(margen)}</strong> al mes. ¿Qué parte crees que podrías apartar sin agobiarte?
            </p>
            <CampoImporte id="capacidad" valor={r.capacidadAhorroEstimada} onCambio={(v) => set({ capacidadAhorroEstimada: v })} etiqueta="Ahorro mensual estimado" autoFocus />
            {margen > 0 && (
              <div className="chips">
                {[0.1, 0.2, 0.3].map((f) => {
                  const v = Math.round((r.ingresosNetos * f) / 5) * 5;
                  return (
                    <button type="button" key={f} className={`chip ${r.capacidadAhorroEstimada === v ? 'activa' : ''}`} onClick={() => set({ capacidadAhorroEstimada: v })}>
                      {euros(v)} · {porcentaje(f)}
                    </button>
                  );
                })}
              </div>
            )}
          </>
        )}

        {id === 'objetivo' && (
          <>
            <h1>¿Para qué ahorras?</h1>
            <label className="campo">
              <span className="campo-etiqueta">Objetivo</span>
              <input type="text" enterKeyHint="next" placeholder="Ej. Viaje a Japón" value={r.objetivo.nombre} onChange={(e) => setObj({ nombre: e.target.value })} />
            </label>
            <div className="chips">
              {SUGERENCIAS_META.map((s) => (
                <button type="button" key={s} className={`chip ${r.objetivo.nombre === s ? 'activa' : ''}`} onClick={() => setObj({ nombre: s })}>
                  {s}
                </button>
              ))}
            </div>
            <CampoImporte id="meta" valor={r.objetivo.importe} onCambio={(v) => setObj({ importe: v })} etiqueta="¿Cuánto necesitas?" />
            <CampoImporte id="ahorrado" valor={r.objetivo.ahorroActual} onCambio={(v) => setObj({ ahorroActual: v })} etiqueta="¿Cuánto tienes ya ahorrado para esto?" />
            <span className="campo-etiqueta">¿En cuánto tiempo? ({r.objetivo.plazoMeses} meses)</span>
            <div className="chips">
              {PLAZOS.map((m) => (
                <button type="button" key={m} className={`chip ${r.objetivo.plazoMeses === m ? 'activa' : ''}`} onClick={() => setObj({ plazoMeses: m })}>
                  {m < 12 ? `${m} meses` : m === 12 ? '1 año' : `${m / 12} años`}
                </button>
              ))}
            </div>
            <input
              className="deslizador"
              type="range"
              min={1}
              max={60}
              value={r.objetivo.plazoMeses}
              onChange={(e) => setObj({ plazoMeses: Number(e.target.value) })}
              aria-label="Plazo en meses"
            />
          </>
        )}

        {id === 'resultado' && resultado && <Resultado d={resultado} />}

        {/* Botón de envío oculto para que «Intro» en el teclado avance */}
        <button type="submit" hidden />
      </form>

      <footer className="onb-pie">
        <button className="boton-principal" disabled={!puedeSeguir[id]} onClick={() => void siguiente()}>
          {id === 'bienvenida' ? 'Empezar' : id === 'objetivo' ? 'Ver mi plan' : id === 'resultado' ? (repitiendo ? 'Aplicar nuevo plan' : 'Comenzar con este plan') : 'Continuar'}
        </button>
      </footer>
    </div>
  );
}

export function Resultado({ d }: { d: Diagnostico }) {
  const v = TEXTO_VIABILIDAD[d.viabilidad];
  const { necesidades, deseos, ahorro } = d.reglaResultante.reparto;
  const pct = (x: number) => Math.round(x * 100);
  const nombreRegla = `Tu reparto ${pct(necesidades)}/${pct(deseos)}/${pct(ahorro)}`;
  const origenRegla =
    d.reglaResultante.nombre === 'personalizada'
      ? `Adaptado a ti a partir de la regla ${d.reglaBase.nombre}`
      : `Equivale a la regla ${d.reglaResultante.nombre}`;

  return (
    <div className="resultado">
      <div className="resultado-hero">
        <span className={`pill ${v.clase}`}>{v.texto}</span>
        <p className="resultado-etiqueta">Ahorra cada mes</p>
        <p className="resultado-cifra">{euros(d.ahorroMensualRecomendado)}</p>
        <p className="resultado-sub">
          {d.mesesEstimados === 0
            ? '¡Ya tienes tu meta cubierta!'
            : d.mesesEstimados !== null && d.fechaObjetivoEstimada
              ? `«${d.respuestas.objetivo.nombre}» en ${d.mesesEstimados} ${d.mesesEstimados === 1 ? 'mes' : 'meses'} · ${mesAnio(d.fechaObjetivoEstimada)}`
              : 'Primero hay que liberar margen'}
        </p>
      </div>

      <div>
        <h2 className="resultado-titulo">{nombreRegla}</h2>
        <p className="resultado-sub">{origenRegla} (necesidades / ocio / ahorro)</p>
      </div>
      <div className="reparto">
        <div style={{ flex: necesidades, background: 'var(--lila)' }} />
        <div style={{ flex: deseos, background: 'var(--melocoton)' }} />
        <div style={{ flex: ahorro, background: 'var(--rosa)' }} />
      </div>
      <div className="reparto-leyenda">
        <span><i style={{ background: 'var(--lila)' }} />Necesidades {porcentaje(necesidades)}</span>
        <span><i style={{ background: 'var(--melocoton)' }} />Ocio {porcentaje(deseos)}</span>
        <span><i style={{ background: 'var(--rosa)' }} />Ahorro {porcentaje(ahorro)}</span>
      </div>

      <h2 className="resultado-titulo">Tu presupuesto mensual</h2>
      <div className="tarjeta">
        {Object.entries(d.presupuestoMensual).map(([id, importe]) => {
          const c = categoria(id);
          return (
            <div className="fila" key={id}>
              <span className="fila-emoji">{c.emoji}</span>
              <span className="fila-texto">{c.nombre}</span>
              <span className="fila-valor">{euros(importe)}</span>
            </div>
          );
        })}
        <div className="fila">
          <span className="fila-emoji">🐷</span>
          <span className="fila-texto">Ahorro para tu meta</span>
          <span className="fila-valor texto-rosa">{euros(d.ahorroMensualRecomendado)}</span>
        </div>
      </div>

      {d.avisos.length > 0 && (
        <ul className="avisos">
          {d.avisos.map((a, i) => (
            <li key={i} className={`aviso aviso-${a.tipo}`}>
              <span>{a.tipo === 'alerta' ? '⚠️' : a.tipo === 'consejo' ? '💡' : 'ℹ️'}</span>
              <p>{a.texto}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
