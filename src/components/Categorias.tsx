import { useMemo, useState } from 'react';
import type { Categoria, TipoMovimiento } from '../types';
import { useEstado } from '../estado';
import { categoriasDe, COLORES_CATEGORIA, EMOJIS_CATEGORIA } from '../lib/categorias';
import Hoja from './Hoja';
import { Icono, Interruptor, Seccion, Segmentado } from './ui';

export default function Categorias() {
  const { alternarCategoriaOculta, categorias } = useEstado();
  const [clase, setClase] = useState<TipoMovimiento>('gasto');
  const [editor, setEditor] = useState<{ abierto: boolean; c?: Categoria }>({ abierto: false });
  // El catálogo vive fuera de React: `categorias` (la configuración) es lo que indica que ha cambiado.
  const lista = useMemo(() => categoriasDe(clase, true), [clase, categorias]);

  return (
    <div className="pantalla">
      <div className="vista-selector">
        <Segmentado
          opciones={[
            { valor: 'gasto', texto: 'Gastos' },
            { valor: 'ingreso', texto: 'Ingresos' },
          ]}
          valor={clase}
          onCambio={setClase}
        />
      </div>

      <Seccion pie="Las ocultas no aparecen al apuntar, pero sus movimientos se conservan. Las tuyas se pueden editar.">
        {lista.map((c) => (
          <div
            key={c.id}
            className={`fila ${c.personalizada ? 'fila-boton' : ''} ${c.oculta ? 'inactiva' : ''}`}
            role={c.personalizada ? 'button' : undefined}
            tabIndex={c.personalizada ? 0 : undefined}
            onClick={c.personalizada ? () => setEditor({ abierto: true, c }) : undefined}
          >
            <span className="fila-icono" style={{ ['--cat' as string]: c.color }}>
              {c.emoji}
            </span>
            <span className="fila-texto">
              {c.nombre}
              <small>
                {clase === 'gasto' ? (c.tipo === 'fija' ? 'Fijo mensual' : 'Día a día') : c.tipo === 'fija' ? 'Ingreso habitual' : 'Ingreso extra'}
                {c.personalizada ? ' · tuya' : ''}
              </small>
            </span>
            {c.personalizada && <Icono nombre="chevron" tam={16} />}
            <Interruptor activo={!c.oculta} onCambio={() => void alternarCategoriaOculta(c.id)} etiqueta={`Mostrar ${c.nombre}`} />
          </div>
        ))}
      </Seccion>

      <div className="botonera-sola">
        <button className="boton-principal" onClick={() => setEditor({ abierto: true })}>
          + Nueva categoría de {clase === 'gasto' ? 'gasto' : 'ingreso'}
        </button>
      </div>

      <EditorCategoria abierto={editor.abierto} c={editor.c} clase={clase} onCerrar={() => setEditor((e) => ({ ...e, abierto: false }))} />
    </div>
  );
}

function EditorCategoria({ abierto, c, clase, onCerrar }: { abierto: boolean; c?: Categoria; clase: TipoMovimiento; onCerrar(): void }) {
  const titulo = c ? 'Editar categoría' : 'Nueva categoría';
  return (
    <Hoja abierta={abierto} onCerrar={onCerrar} titulo={titulo} etiqueta={titulo}>
      <FormularioCategoria key={c?.id ?? `nueva-${clase}`} c={c} clase={c?.clase ?? clase} onCerrar={onCerrar} />
    </Hoja>
  );
}

function FormularioCategoria({ c, clase, onCerrar }: { c?: Categoria; clase: TipoMovimiento; onCerrar(): void }) {
  const { guardarCategoria, borrarCategoria, notificar } = useEstado();
  const [nombre, setNombre] = useState(c?.nombre ?? '');
  const [emoji, setEmoji] = useState(c?.emoji ?? EMOJIS_CATEGORIA[0]);
  const [color, setColor] = useState(c?.color ?? COLORES_CATEGORIA[0]);
  const [tipo, setTipo] = useState<Categoria['tipo']>(c?.tipo ?? 'variable');
  const valido = nombre.trim().length > 0 && emoji.trim().length > 0;

  return (
    <div className="formulario formulario-hoja">
      <div className="vista-previa-categoria">
        <span className="fila-icono fila-icono-grande" style={{ ['--cat' as string]: color }}>
          {emoji || '❔'}
        </span>
        <strong>{nombre || 'Nombre'}</strong>
      </div>
      <label className="campo">
        <span className="campo-etiqueta">Nombre</span>
        <input type="text" maxLength={24} placeholder={clase === 'gasto' ? 'Ej. Café, Gimnasio…' : 'Ej. Clases particulares'} value={nombre} onChange={(e) => setNombre(e.target.value)} />
      </label>
      <span className="campo-etiqueta">Icono (o escribe cualquier emoji)</span>
      <div className="selector-emoji">
        <input className="emoji-libre" aria-label="Emoji propio" value={emoji} maxLength={4} onChange={(e) => setEmoji(e.target.value)} />
        {EMOJIS_CATEGORIA.map((e) => (
          <button key={e} className={emoji === e ? 'activa' : ''} onClick={() => setEmoji(e)}>
            {e}
          </button>
        ))}
      </div>
      <span className="campo-etiqueta">Color</span>
      <div className="selector-color" role="radiogroup" aria-label="Color">
        {COLORES_CATEGORIA.map((col) => (
          <button key={col} role="radio" aria-checked={color === col} aria-label={col} className={color === col ? 'activa' : ''} style={{ background: col }} onClick={() => setColor(col)} />
        ))}
      </div>
      <span className="campo-etiqueta">Tipo</span>
      <Segmentado
        opciones={
          clase === 'gasto'
            ? [
                { valor: 'variable', texto: 'Día a día' },
                { valor: 'fija', texto: 'Fijo mensual' },
              ]
            : [
                { valor: 'variable', texto: 'Extra' },
                { valor: 'fija', texto: 'Habitual' },
              ]
        }
        valor={tipo}
        onCambio={setTipo}
      />
      <button
        className="boton-principal"
        disabled={!valido}
        onClick={async () => {
          await guardarCategoria({ id: c?.id, nombre: nombre.trim(), emoji: emoji.trim(), color, clase, tipo });
          notificar(c ? 'Categoría actualizada' : `Categoría «${nombre.trim()}» creada`, 'ok', { icono: emoji });
          onCerrar();
        }}
      >
        {c ? 'Guardar' : 'Crear categoría'}
      </button>
      {c && (
        <div className="botonera botonera-centrada">
          <button
            className="boton-texto texto-rojo"
            onClick={async () => {
              if (!window.confirm(`¿Borrar «${c.nombre}»? Sus movimientos se conservan como «Sin categoría».`)) return;
              await borrarCategoria(c.id);
              onCerrar();
            }}
          >
            Borrar categoría
          </button>
        </div>
      )}
    </div>
  );
}
