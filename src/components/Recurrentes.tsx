import { useState } from 'react';
import type { CategoriaId, Recurrente, TipoMovimiento } from '../types';
import { useEstado } from '../estado';
import { categoria, categoriasDe } from '../lib/categorias';
import { deISO } from '../lib/fechas';
import { euros } from '../lib/formato';
import { proximaFecha, totalMensual } from '../lib/recurrentes';
import Hoja from './Hoja';
import { CampoImporte, Interruptor, Seccion, Segmentado } from './ui';

export default function Recurrentes() {
  const { recurrentes, guardarRecurrente } = useEstado();
  const [editor, setEditor] = useState<{ abierto: boolean; r?: Recurrente }>({ abierto: false });
  const ahora = new Date();
  const gastos = recurrentes.filter((r) => r.tipo === 'gasto');
  const ingresos = recurrentes.filter((r) => r.tipo === 'ingreso');

  const fila = (r: Recurrente) => {
    const c = categoria(r.categoria);
    const proxima = deISO(proximaFecha(r, ahora)).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
    return (
      <div className={`fila fila-boton ${r.activo ? '' : 'inactiva'}`} key={r.id} role="button" tabIndex={0} onClick={() => setEditor({ abierto: true, r })}>
        <span className="fila-icono" style={{ ['--cat' as string]: c.color }}>
          {c.emoji}
        </span>
        <span className="fila-texto">
          {r.nota || c.nombre}
          <small>
            Día {r.dia} · {r.activo ? `próximo ${proxima}` : 'en pausa'}
          </small>
        </span>
        <span className={`fila-valor ${r.tipo === 'ingreso' ? 'texto-verde' : ''}`}>
          {r.tipo === 'ingreso' ? '+' : '−'}
          {euros(r.importe)}
        </span>
        <Interruptor activo={r.activo} onCambio={(v) => void guardarRecurrente({ ...r, activo: v })} etiqueta={`Activar ${r.nota || c.nombre}`} />
      </div>
    );
  };

  return (
    <div className="pantalla">
      <div className="tarjeta estadisticas estadisticas-sueltas">
        <div>
          <small>Ingresos fijos</small>
          <strong className="texto-verde">+{euros(totalMensual(recurrentes, 'ingreso'))}</strong>
        </div>
        <div>
          <small>Gastos fijos</small>
          <strong>−{euros(totalMensual(recurrentes, 'gasto'))}</strong>
        </div>
      </div>
      <p className="seccion-pie">
        Se apuntan solos cada mes el día indicado (si abres la app más tarde, se apuntan todos los pendientes). También puedes marcar «🔁 Cada mes» al apuntar un
        movimiento.
      </p>

      <div className="botonera-sola">
        <button className="boton-principal" onClick={() => setEditor({ abierto: true })}>
          + Añadir movimiento fijo
        </button>
      </div>

      {ingresos.length > 0 && <Seccion titulo="Ingresos">{ingresos.map(fila)}</Seccion>}
      {gastos.length > 0 && <Seccion titulo="Gastos">{gastos.map(fila)}</Seccion>}
      {recurrentes.length === 0 && (
        <div className="vacio vacio-grande">
          <p className="vacio-emoji">🔁</p>
          Añade aquí tu nómina, el alquiler o tus suscripciones y no tendrás que apuntarlos cada mes.
        </div>
      )}

      <EditorRecurrente abierto={editor.abierto} r={editor.r} onCerrar={() => setEditor((e) => ({ ...e, abierto: false }))} />
    </div>
  );
}

function EditorRecurrente({ abierto, r, onCerrar }: { abierto: boolean; r?: Recurrente; onCerrar(): void }) {
  const titulo = r ? 'Editar fijo' : 'Nuevo fijo';
  return (
    <Hoja abierta={abierto} onCerrar={onCerrar} titulo={titulo} etiqueta={titulo}>
      <FormularioRecurrente key={r?.id ?? 'nuevo'} r={r} onCerrar={onCerrar} />
    </Hoja>
  );
}

function FormularioRecurrente({ r, onCerrar }: { r?: Recurrente; onCerrar(): void }) {
  const { guardarRecurrente, borrarRecurrente, notificar } = useEstado();
  const [tipo, setTipo] = useState<TipoMovimiento>(r?.tipo ?? 'gasto');
  const [importe, setImporte] = useState(r?.importe ?? 0);
  const [cat, setCat] = useState<CategoriaId>(r?.categoria ?? 'vivienda');
  const [nota, setNota] = useState(r?.nota ?? '');
  const [dia, setDia] = useState(r?.dia ?? new Date().getDate());
  const cats = categoriasDe(tipo);
  const catValida = cats.some((c) => c.id === cat) ? cat : cats[0]?.id;
  const valido = importe > 0 && !!catValida;

  return (
    <div className="formulario formulario-hoja">
      <Segmentado
        opciones={[
          { valor: 'gasto', texto: 'Gasto' },
          { valor: 'ingreso', texto: 'Ingreso' },
        ]}
        valor={tipo}
        onCambio={(t) => {
          setTipo(t);
          setCat(t === 'ingreso' ? 'nomina' : 'vivienda');
        }}
      />
      <CampoImporte id="rec-importe" etiqueta="Importe cada mes" valor={importe} onCambio={setImporte} />
      <label className="campo">
        <span className="campo-etiqueta">Concepto</span>
        <input type="text" placeholder={tipo === 'gasto' ? 'Ej. Alquiler, Netflix…' : 'Ej. Nómina'} value={nota} onChange={(e) => setNota(e.target.value)} />
      </label>
      <span className="campo-etiqueta">Categoría</span>
      <div className="chips">
        {cats.map((c) => (
          <button key={c.id} className={`chip chip-categoria ${catValida === c.id ? 'activa' : ''}`} style={{ ['--cat' as string]: c.color }} onClick={() => setCat(c.id)}>
            {c.emoji} {c.nombre}
          </button>
        ))}
      </div>
      <label className="campo">
        <span className="campo-etiqueta">Día del mes</span>
        <select value={dia} onChange={(e) => setDia(Number(e.target.value))}>
          {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
            <option key={d} value={d}>
              Día {d}
              {d >= 29 ? ' (o el último del mes)' : ''}
            </option>
          ))}
        </select>
      </label>
      <button
        className="boton-principal"
        disabled={!valido}
        onClick={async () => {
          await guardarRecurrente({ id: r?.id, tipo, importe, categoria: catValida!, nota: nota.trim() || undefined, dia, activo: r?.activo ?? true });
          notificar(r ? 'Movimiento fijo actualizado' : 'Movimiento fijo creado', 'ok', { icono: '🔁' });
          onCerrar();
        }}
      >
        {r ? 'Guardar' : 'Crear'}
      </button>
      {r && (
        <div className="botonera botonera-centrada">
          <button
            className="boton-texto texto-rojo"
            onClick={async () => {
              await borrarRecurrente(r.id);
              notificar('Movimiento fijo eliminado (los ya apuntados se conservan)', 'ok', { icono: '🗑️' });
              onCerrar();
            }}
          >
            Eliminar
          </button>
        </div>
      )}
    </div>
  );
}
