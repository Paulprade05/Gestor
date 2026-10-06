/**
 * Sincronización opcional en segundo plano (patrón «outbox»).
 *
 * La app es local-first: todo se guarda primero en el dispositivo. Si el usuario configura una URL
 * de sincronización, cada cambio se encola en `outbox` y se envía por POST:
 *   - con Background Sync (`registration.sync`) donde exista: el service worker lo envía aunque se cierre la app;
 *   - en Safari/iOS, que no lo soporta, al volver la conexión (`online`) y al volver a la app (`visibilitychange`).
 *
 * Formato enviado: { cambios: CambioPendiente[] }. El servidor debe responder 2xx para vaciar la cola.
 */
import type { Ajustes } from '../types';
import { almacen, type CambioPendiente } from './db';
import { nuevoId } from './formato';

export const ETIQUETA_SYNC = 'hucha-sync';

interface RegistroConSync extends ServiceWorkerRegistration {
  sync?: { register(etiqueta: string): Promise<void> };
}

export async function registrarCambio(c: Omit<CambioPendiente, 'id' | 'fecha'>): Promise<void> {
  const db = await almacen();
  const ajustes = await db.get<Ajustes>('ajustes');
  if (!ajustes?.urlSincronizacion) return; // sin servidor no se acumula cola
  await db.encolar({ ...c, id: nuevoId(), fecha: new Date().toISOString() });
  await programarSync();
}

export async function programarSync(): Promise<void> {
  try {
    const reg = (await navigator.serviceWorker?.getRegistration()) as RegistroConSync | undefined;
    if (reg?.sync) {
      await reg.sync.register(ETIQUETA_SYNC);
      return;
    }
  } catch {
    /* sin Background Sync: se sincroniza desde la página */
  }
  if (navigator.onLine) void sincronizarAhora().catch(() => undefined);
}

let enCurso: Promise<number> | null = null;

/** Envía la cola. Devuelve cuántos cambios se han enviado. */
export function sincronizarAhora(): Promise<number> {
  enCurso ??= (async () => {
    try {
      const db = await almacen();
      const ajustes = await db.get<Ajustes>('ajustes');
      const url = ajustes?.urlSincronizacion;
      if (!url) return 0;
      const cambios = await db.pendientes();
      if (cambios.length === 0) return 0;
      const r = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cambios }),
      });
      if (!r.ok) throw new Error(`El servidor respondió ${r.status}`);
      await db.quitarPendientes(cambios.map((c) => c.id));
      await db.set<Ajustes>('ajustes', { ...ajustes, ultimaSincronizacion: new Date().toISOString() });
      return cambios.length;
    } finally {
      enCurso = null;
    }
  })();
  return enCurso;
}

export function iniciarSincronizacion(): void {
  const intentar = () => navigator.onLine && void sincronizarAhora().catch(() => undefined);
  window.addEventListener('online', intentar);
  document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && intentar());
  intentar();
}
