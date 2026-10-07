/**
 * Red de seguridad: si algo falla al pintar la app, en lugar de una pantalla en blanco se muestra
 * esta, que permite recargar, guardar los datos tal cual están o empezar de cero.
 * Usa el almacén directamente (no el estado de React), porque el fallo puede estar ahí.
 */
import { Component, type ErrorInfo, type ReactNode } from 'react';
import { compartirArchivo } from '../lib/archivos';
import { almacen, type ClaveKV } from '../lib/db';

const CLAVES: ClaveKV[] = ['usuario', 'diagnostico', 'metas', 'limites', 'recurrentes', 'categorias', 'ajustes'];

async function guardarDatos() {
  const db = await almacen();
  const datos: Record<string, unknown> = { app: 'hucha', version: 2, exportado: new Date().toISOString() };
  for (const k of CLAVES) datos[k] = await db.get(k);
  delete (datos.ajustes as Record<string, unknown> | undefined)?.bloqueo;
  datos.movimientos = await db.movimientos();
  await compartirArchivo(`hucha-rescate-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(datos, null, 2), 'application/json');
}

export class Recuperacion extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Hucha: error al pintar', error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="recuperacion" role="alert">
        <div className="bloqueo-logo">🐷</div>
        <h1>Algo ha fallado</h1>
        <p>Tus datos siguen guardados en el iPhone. Prueba a recargar; si vuelve a pasar, guarda una copia de tus datos antes de nada.</p>
        <button className="boton-principal" onClick={() => location.reload()}>
          Recargar
        </button>
        <button className="boton-secundario" onClick={() => void guardarDatos()}>
          Guardar mis datos
        </button>
        <button
          className="boton-texto texto-rojo"
          onClick={async () => {
            if (!window.confirm('Se borrarán todos los datos de este dispositivo. Guarda antes una copia si quieres conservarlos. ¿Borrar?')) return;
            await (await almacen()).borrarTodo();
            location.reload();
          }}
        >
          Borrar datos y empezar de cero
        </button>
        <small className="recuperacion-detalle">{this.state.error.message}</small>
      </div>
    );
  }
}
