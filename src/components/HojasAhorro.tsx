import { useState } from 'react';
import type { Meta } from '../types';
import { useEstado } from '../estado';
import { aISO, deISO, mesesEntre, sumarMeses } from '../lib/fechas';
import { centimos, euros } from '../lib/formato';
import { estadoMeta } from '../lib/presupuesto';
import Hoja from './Hoja';
import { CampoImporte, Interruptor, Segmentado } from './ui';

export const EMOJIS_META = ['🐷', '✈️', '🏖️', '🚗', '🏡', '🎓', '🎁', '🎄', '🆘', '💍', '👶', '💻', '📱', '🐶', '🎸', '💪'];

export interface Plantilla {
  emoji: string;
  nombre: string;
  importe: number;
  fechaLimite: string;
}

/** Ideas de huchas; el fondo de emergencia se calcula como 3 meses de gastos fijos. */
export function plantillas(fondoEmergencia: number, ahora = new Date()): Plantilla[] {
  const en = (meses: number) => aISO(sumarMeses(ahora, meses));
  const navidad = new Date(ahora.getFullYear(), 11, 15);
  if (navidad.getTime() - ahora.getTime() < 45 * 86_400_000) navidad.setFullYear(navidad.getFullYear() + 1);
  return [
    { emoji: '🆘', nombre: 'Fondo de emergencia', importe: fondoEmergencia, fechaLimite: en(12) },
    { emoji: '✈️', nombre: 'Viaje', importe: 1500, fechaLimite: en(8) },
    { emoji: '🎄', nombre: 'Navidad', importe: 400, fechaLimite: aISO(navidad) },
    { emoji: '🚗', nombre: 'Coche', importe: 6000, fechaLimite: en(24) },
    { emoji: '🏡', nombre: 'Entrada de un piso', importe: 20000, fechaLimite: en(48) },
    { emoji: '🎓', nombre: 'Formación', importe: 1200, fechaLimite: en(10) },
  ];
}

const aporteNecesario = (objetivo: number, ahorrado: number, fechaLimite: string) => {
  const meses = Math.max(1, Math.ceil(mesesEntre(new Date(), deISO(fechaLimite))));
  return Math.max(0, Math.ceil((objetivo - ahorrado) / meses / 5) * 5);
};

// ─── Crear / editar hucha ────────────────────────────────────────────────────

export function EditorMeta({ abierto, meta, plantilla, onCerrar }: { abierto: boolean; meta?: Meta; plantilla?: Plantilla; onCerrar(): void }) {
  const titulo = meta ? 'Editar hucha' : 'Nueva hucha';
  return (
    <Hoja abierta={abierto} onCerrar={onCerrar} titulo={titulo} etiqueta={titulo}>
      <FormularioMeta key={meta?.id ?? plantilla?.nombre ?? 'nueva'} meta={meta} plantilla={plantilla} onCerrar={onCerrar} />
    </Hoja>
  );
}

function FormularioMeta({ meta, plantilla, onCerrar }: { meta?: Meta; plantilla?: Plantilla; onCerrar(): void }) {
  const { metas, guardarMeta, borrarMeta, archivarMeta, notificar } = useEstado();
  const [emoji, setEmoji] = useState(meta?.emoji ?? plantilla?.emoji ?? '🐷');
  const [nombre, setNombre] = useState(meta?.nombre ?? plantilla?.nombre ?? '');
  const [objetivo, setObjetivo] = useState(meta?.importeObjetivo ?? plantilla?.importe ?? 0);
  const [inicial, setInicial] = useState(meta?.importeInicial ?? 0);
  const [fechaLimite, setFechaLimite] = useState(meta?.fechaLimite ?? plantilla?.fechaLimite ?? aISO(sumarMeses(new Date(), 12)));
  const ahorrado = meta ? estadoMeta(meta, new Date()).ahorrado : inicial;
  const sugerido = aporteNecesario(objetivo, ahorrado, fechaLimite);
  const [aporte, setAporte] = useState(meta?.aporteMensualPlanificado ?? sugerido);
  const [principal, setPrincipal] = useState(meta?.principal ?? !metas.some((m) => !m.archivada));

  const valido = nombre.trim().length > 0 && objetivo > 0 && fechaLimite.length === 10;

  const guardar = async () => {
    if (!valido) return;
    await guardarMeta({
      id: meta?.id,
      nombre: nombre.trim(),
      emoji,
      importeObjetivo: centimos(objetivo),
      importeInicial: centimos(inicial),
      fechaLimite,
      aporteMensualPlanificado: centimos(aporte),
      principal,
    });
    notificar(meta ? 'Hucha actualizada' : `Hucha «${nombre.trim()}» creada`, 'ok', { icono: emoji });
    onCerrar();
  };

  return (
    <div className="formulario formulario-hoja">
      <div className="selector-emoji" role="radiogroup" aria-label="Icono">
        {EMOJIS_META.map((e) => (
          <button key={e} role="radio" aria-checked={emoji === e} className={emoji === e ? 'activa' : ''} onClick={() => setEmoji(e)}>
            {e}
          </button>
        ))}
      </div>
      <label className="campo">
        <span className="campo-etiqueta">Nombre</span>
        <input type="text" placeholder="Ej. Viaje a Japón" value={nombre} onChange={(e) => setNombre(e.target.value)} />
      </label>
      <CampoImporte id="meta-objetivo" etiqueta="Objetivo" valor={objetivo} onCambio={setObjetivo} />
      {!meta && <CampoImporte id="meta-inicial" etiqueta="Lo que ya tienes ahorrado para esto" valor={inicial} onCambio={setInicial} />}
      <label className="campo">
        <span className="campo-etiqueta">¿Para cuándo?</span>
        <input type="date" value={fechaLimite} onChange={(e) => setFechaLimite(e.target.value)} />
      </label>
      <CampoImporte id="meta-aporte" etiqueta="Aportación mensual" valor={aporte} onCambio={setAporte} />
      {sugerido > 0 && aporte !== sugerido && (
        <button className="sugerencia" onClick={() => setAporte(sugerido)}>
          💡 Para llegar a tiempo hacen falta <strong>{euros(sugerido)}/mes</strong> · Usar
        </button>
      )}
      <div className="fila-interruptor">
        <span>
          Hucha principal
          <small>Sale en el inicio y recibe el redondeo y las sugerencias</small>
        </span>
        <Interruptor activo={principal} onCambio={setPrincipal} etiqueta="Hucha principal" />
      </div>
      <button className="boton-principal" disabled={!valido} onClick={() => void guardar()}>
        {meta ? 'Guardar' : 'Crear hucha'}
      </button>
      {meta && (
        <div className="botonera botonera-centrada">
          <button
            className="boton-texto"
            onClick={async () => {
              await archivarMeta(meta.id, !meta.archivada);
              onCerrar();
            }}
          >
            {meta.archivada ? 'Recuperar' : 'Archivar'}
          </button>
          <button
            className="boton-texto texto-rojo"
            onClick={async () => {
              if (!window.confirm(`¿Borrar la hucha «${meta.nombre}» y su historial de aportaciones?`)) return;
              await borrarMeta(meta.id);
              onCerrar();
            }}
          >
            Borrar
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Aportar / retirar ───────────────────────────────────────────────────────

export function HojaAportar({ meta, onCerrar }: { meta: Meta | null; onCerrar(): void }) {
  return (
    <Hoja abierta={meta !== null} onCerrar={onCerrar} titulo={meta ? `${meta.emoji} ${meta.nombre}` : ''} etiqueta="Aportar a la hucha">
      {meta && <FormularioAportar key={meta.id} meta={meta} onCerrar={onCerrar} />}
    </Hoja>
  );
}

function FormularioAportar({ meta, onCerrar }: { meta: Meta; onCerrar(): void }) {
  const { aportar } = useEstado();
  const e = estadoMeta(meta, new Date());
  const pendienteMes = Math.max(0, centimos(meta.aporteMensualPlanificado - e.aportadoEsteMes));
  const [modo, setModo] = useState<'aportar' | 'retirar'>('aportar');
  const [importe, setImporte] = useState(pendienteMes || 0);
  const rapidos = modo === 'aportar' ? [...new Set([pendienteMes, 10, 25, 50, 100].filter((x) => x > 0))] : [10, 50, e.ahorrado].filter((x) => x > 0);
  const maximo = modo === 'retirar' ? e.ahorrado : Infinity;

  return (
    <div className="formulario formulario-hoja">
      <Segmentado
        opciones={[
          { valor: 'aportar', texto: 'Aportar' },
          { valor: 'retirar', texto: 'Retirar' },
        ]}
        valor={modo}
        onCambio={(m) => {
          setModo(m);
          setImporte(0);
        }}
      />
      <p className="hoja-resumen">
        Llevas <strong>{euros(e.ahorrado)}</strong> de {euros(meta.importeObjetivo)} · este mes {euros(e.aportadoEsteMes)} de {euros(meta.aporteMensualPlanificado)}
      </p>
      <CampoImporte id="aportar-importe" etiqueta={modo === 'aportar' ? '¿Cuánto apartas?' : '¿Cuánto sacas?'} valor={importe} onCambio={setImporte} autoFocus />
      <div className="chips">
        {rapidos.map((x) => (
          <button key={x} className={`chip ${importe === x ? 'activa' : ''}`} onClick={() => setImporte(x)}>
            {x === pendienteMes && modo === 'aportar' ? `Lo del mes · ${euros(x)}` : x === e.ahorrado && modo === 'retirar' ? `Todo · ${euros(x)}` : euros(x)}
          </button>
        ))}
      </div>
      <button
        className={`boton-principal ${modo === 'retirar' ? 'boton-peligro' : ''}`}
        disabled={!(importe > 0) || importe > maximo}
        onClick={async () => {
          await aportar(meta.id, modo === 'aportar' ? importe : -importe, modo === 'aportar' ? 'Aportación' : 'Retirada');
          onCerrar();
        }}
      >
        {importe > maximo ? `Solo hay ${euros(maximo)}` : `${modo === 'aportar' ? 'Apartar' : 'Retirar'} ${importe > 0 ? euros(importe) : ''}`}
      </button>
    </div>
  );
}
