import { useEffect, useState } from 'react';
import { useEstado } from '../estado';
import { categoria } from '../lib/categorias';
import { almacen } from '../lib/db';
import { hoyISO } from '../lib/fechas';
import { compartirArchivo } from '../lib/archivos';
import { crearCopia, leerCopia } from '../lib/copia';
import { sincronizarAhora } from '../lib/sync';
import { HojaCodigo } from './Bloqueo';
import { Interruptor, Seccion, Segmentado } from './ui';

const esIOS = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const esStandalone = () =>
  window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;

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
    if (!s.usuario) return;
    const copia = crearCopia({
      usuario: s.usuario,
      diagnostico: s.diagnostico,
      metas: s.metas,
      limites: s.limites,
      recurrentes: s.recurrentes,
      categorias: s.categorias,
      ajustes: s.ajustes,
      movimientos: s.movimientos,
    });
    void compartirArchivo(`hucha-copia-${hoyISO()}.json`, JSON.stringify(copia, null, 2), 'application/json');
  };

  const restaurar = async (archivo: File) => {
    try {
      const d = leerCopia(await archivo.text());
      const ok = window.confirm(
        `Se sustituirán todos tus datos actuales por los de la copia: ${d.movimientos.length} movimientos y ${d.metas.length} huchas de ${d.usuario.nombre}. ¿Continuar?`,
      );
      if (ok) await s.restaurarCopia(d);
    } catch (e) {
      s.notificar((e as Error).message, 'excedido');
    }
  };

  const [hojaCodigo, setHojaCodigo] = useState<'crear' | 'verificar' | null>(null);
  const bloqueo = s.ajustes.bloqueo;

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

      <Seccion
        titulo="Privacidad"
        pie="El código evita que otros vean tus cuentas si cogen el móvil. No cifra los datos: guarda también una copia de seguridad."
      >
        <div className="fila fila-interruptor">
          <span>
            🔒 Bloqueo con código
            <small>Se pide al abrir la app</small>
          </span>
          <Interruptor activo={!!bloqueo} onCambio={(v) => setHojaCodigo(v ? 'crear' : 'verificar')} etiqueta="Bloqueo con código" />
        </div>
        {bloqueo && (
          <div className="fila fila-interruptor">
            <span>Pedirlo al volver</span>
            <Segmentado
              opciones={[
                { valor: '0', texto: 'Siempre' },
                { valor: '1', texto: '1 min' },
                { valor: '5', texto: '5 min' },
              ]}
              valor={String(bloqueo.minutos)}
              onCambio={(v) => void s.guardarAjustes({ ...s.ajustes, bloqueo: { ...bloqueo, minutos: Number(v) } })}
            />
          </div>
        )}
        <div className="fila fila-interruptor">
          <span>
            🙈 Ocultar importes
            <small>También con el ojo del inicio</small>
          </span>
          <Interruptor activo={!!s.ajustes.privado} onCambio={(v) => void s.guardarAjustes({ ...s.ajustes, privado: v })} etiqueta="Ocultar importes" />
        </div>
      </Seccion>

      <Seccion titulo="Copia de seguridad y exportar" pie={`${s.movimientos.length} movimientos guardados en este dispositivo.`}>
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
            Guardar copia de seguridad
            <small>Todo: huchas, límites, fijos, categorías y movimientos (JSON)</small>
          </span>
        </button>
        <label className="fila fila-boton">
          <span className="fila-icono">♻️</span>
          <span className="fila-texto">
            Restaurar una copia
            <small>Sustituye los datos de este dispositivo por los de la copia</small>
          </span>
          <input
            type="file"
            accept="application/json,.json"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (f) void restaurar(f);
            }}
          />
        </label>
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

      <HojaCodigo
        modo={hojaCodigo}
        onCerrar={() => setHojaCodigo(null)}
        onHecho={async (cfg) => {
          const modo = hojaCodigo;
          setHojaCodigo(null);
          if (modo === 'crear' && cfg) {
            await s.guardarAjustes({ ...s.ajustes, bloqueo: { ...cfg, minutos: 1 } });
            s.notificar('Bloqueo activado', 'ok', { icono: '🔒' });
          } else if (modo === 'verificar') {
            await s.guardarAjustes({ ...s.ajustes, bloqueo: undefined });
            s.notificar('Bloqueo desactivado', 'ok', { icono: '🔓' });
          }
        }}
      />
    </div>
  );
}
