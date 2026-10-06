import { useEffect, useState } from 'react';
import { useEstado } from '../estado';
import { categoria } from '../lib/categorias';
import { almacen } from '../lib/db';
import { hoyISO } from '../lib/fechas';
import { sincronizarAhora } from '../lib/sync';
import { Seccion } from './ui';

const esIOS = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const esStandalone = () =>
  window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;

/** En iPhone abre la hoja de compartir (Guardar en Archivos, AirDrop, Mail…); si no, descarga. */
async function compartirArchivo(nombre: string, contenido: string, tipo: string) {
  const archivo = new File([contenido], nombre, { type: tipo });
  if (navigator.canShare?.({ files: [archivo] })) {
    try {
      await navigator.share({ files: [archivo], title: nombre });
      return;
    } catch (e) {
      if ((e as Error).name === 'AbortError') return;
    }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(archivo);
  a.download = nombre;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export default function Ajustes() {
  const s = useEstado();
  const [url, setUrl] = useState(s.ajustes.urlSincronizacion ?? '');
  const [pendientes, setPendientes] = useState(0);
  const [sincronizando, setSincronizando] = useState(false);

  const contarPendientes = async () => setPendientes((await (await almacen()).pendientes()).length);
  useEffect(() => {
    void contarPendientes();
  }, [s.movimientos, s.ajustes]);

  const exportarCSV = () => {
    // Separador «;» y coma decimal: es lo que espera Excel en español. El BOM hace que respete los acentos.
    const filas = [...s.movimientos]
      .sort((a, b) => a.fecha.localeCompare(b.fecha))
      .map((m) =>
        [
          m.fecha,
          m.tipo === 'gasto' ? 'Gasto' : 'Ingreso',
          categoria(m.categoria).nombre,
          (m.nota ?? '').replace(/[;\r\n]/g, ' '),
          (m.tipo === 'gasto' ? -m.importe : m.importe).toFixed(2).replace('.', ','),
        ].join(';'),
      );
    void compartirArchivo(`hucha-movimientos-${hoyISO()}.csv`, '﻿' + ['Fecha;Tipo;Categoría;Concepto;Importe', ...filas].join('\r\n'), 'text/csv');
  };

  const exportarJSON = () => {
    const datos = {
      exportado: new Date().toISOString(),
      usuario: s.usuario,
      diagnostico: s.diagnostico,
      metas: s.metas,
      limites: s.limites,
      recurrentes: s.recurrentes,
      categorias: s.categorias,
      movimientos: s.movimientos,
    };
    void compartirArchivo(`hucha-copia-${hoyISO()}.json`, JSON.stringify(datos, null, 2), 'application/json');
  };

  return (
    <div className="pantalla">
      {esIOS() && !esStandalone() && (
        <Seccion titulo="Instalar en el iPhone">
          <ol className="pasos-instalar">
            <li>
              Toca <strong>Compartir</strong> <span aria-hidden="true">⬆︎</span> en Safari.
            </li>
            <li>
              Elige <strong>Añadir a pantalla de inicio</strong>.
            </li>
            <li>Ábrela desde el icono: pantalla completa y funciona sin conexión.</li>
          </ol>
        </Seccion>
      )}

      <Seccion titulo="Exportar" pie={`${s.movimientos.length} movimientos guardados en este dispositivo.`}>
        <button className="fila fila-boton" onClick={exportarCSV}>
          <span className="fila-icono">📊</span>
          <span className="fila-texto">
            Movimientos para Excel
            <small>CSV con fecha, tipo, categoría, concepto e importe</small>
          </span>
        </button>
        <button className="fila fila-boton" onClick={exportarJSON}>
          <span className="fila-icono">💾</span>
          <span className="fila-texto">
            Copia de seguridad
            <small>Todo: huchas, límites, fijos, categorías y movimientos (JSON)</small>
          </span>
        </button>
      </Seccion>

      <Seccion
        titulo="Sincronización"
        pie="Opcional. Todo se guarda en este dispositivo y funciona sin conexión. Si indicas una URL, los cambios se envían por POST en segundo plano cuando haya conexión."
      >
        <div className="formulario">
          <label className="campo">
            <span className="campo-etiqueta">URL del servidor</span>
            <input type="url" inputMode="url" autoCapitalize="off" autoCorrect="off" placeholder="https://…" value={url} onChange={(e) => setUrl(e.target.value)} />
          </label>
          <div className="botonera botonera-sin-margen">
            <span className="apagado">
              {pendientes} pendientes
              {s.ajustes.ultimaSincronizacion && ` · última ${new Date(s.ajustes.ultimaSincronizacion).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' })}`}
            </span>
            {url !== (s.ajustes.urlSincronizacion ?? '') ? (
              <button
                className="boton-principal boton-pequeno"
                onClick={async () => {
                  await s.guardarAjustes({ ...s.ajustes, urlSincronizacion: url.trim() || undefined });
                  s.notificar(url.trim() ? 'Sincronización activada' : 'Sincronización desactivada');
                }}
              >
                Guardar
              </button>
            ) : (
              <button
                className="boton-secundario boton-pequeno"
                disabled={!url || sincronizando}
                onClick={async () => {
                  setSincronizando(true);
                  try {
                    const n = await sincronizarAhora();
                    s.notificar(n ? `${n} cambios enviados` : 'Nada pendiente');
                  } catch (e) {
                    s.notificar(`No se pudo sincronizar: ${(e as Error).message}`, 'excedido');
                  } finally {
                    setSincronizando(false);
                    void contarPendientes();
                  }
                }}
              >
                Sincronizar ahora
              </button>
            )}
          </div>
        </div>
      </Seccion>

      <Seccion titulo="Datos">
        <button
          className="fila fila-boton"
          onClick={async () => {
            if (window.confirm('Se borrarán todos tus datos de este dispositivo. ¿Continuar?')) await s.borrarTodo();
          }}
        >
          <span className="fila-texto texto-rojo">Borrar todos los datos</span>
        </button>
      </Seccion>
    </div>
  );
}
