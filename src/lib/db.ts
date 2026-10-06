/**
 * Almacenamiento local estructurado.
 *
 * IndexedDB (`hucha`, v2):
 *   - kv           clave → valor: usuario, diagnostico, metas, limites, recurrentes, categorias, ajustes
 *   - movimientos  gastos e ingresos (keyPath id, índice por fecha)
 *   - outbox       cambios pendientes de sincronizar (keyPath id)
 *
 * v1 → v2: el almacén `gastos` pasa a `movimientos` (cada registro con `tipo: 'gasto'`).
 * La meta única (`kv.meta`) se convierte en la lista `kv.metas` al cargar el estado.
 *
 * Si IndexedDB no está disponible (algunos modos privados antiguos de Safari) se usa localStorage
 * con la misma interfaz. Además se pide almacenamiento persistente para que iOS no lo purgue.
 */
import type { Movimiento } from '../types';

export const NOMBRE_DB = 'hucha';
const VERSION_DB = 2;

export type ClaveKV = 'usuario' | 'diagnostico' | 'meta' | 'metas' | 'limites' | 'recurrentes' | 'categorias' | 'ajustes';

export interface CambioPendiente {
  id: string;
  entidad: 'movimiento' | ClaveKV;
  operacion: 'guardar' | 'borrar';
  clave: string;
  datos?: unknown;
  fecha: string;
}

export interface Almacen {
  get<T>(clave: ClaveKV): Promise<T | undefined>;
  set<T>(clave: ClaveKV, valor: T): Promise<void>;
  movimientos(): Promise<Movimiento[]>;
  guardarMovimientos(ms: Movimiento[]): Promise<void>;
  borrarMovimiento(id: string): Promise<void>;
  pendientes(): Promise<CambioPendiente[]>;
  encolar(c: CambioPendiente): Promise<void>;
  quitarPendientes(ids: string[]): Promise<void>;
  borrarTodo(): Promise<void>;
}

// ─── IndexedDB ───────────────────────────────────────────────────────────────

const req = <T>(r: IDBRequest<T>) =>
  new Promise<T>((ok, ko) => {
    r.onsuccess = () => ok(r.result);
    r.onerror = () => ko(r.error);
  });

export function abrirDB(): Promise<IDBDatabase> {
  return new Promise((ok, ko) => {
    const r = indexedDB.open(NOMBRE_DB, VERSION_DB);
    r.onupgradeneeded = () => {
      const db = r.result;
      const tx = r.transaction!;
      if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv');
      if (!db.objectStoreNames.contains('outbox')) db.createObjectStore('outbox', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('movimientos')) db.createObjectStore('movimientos', { keyPath: 'id' }).createIndex('fecha', 'fecha');
      // Migración v1 → v2
      if (db.objectStoreNames.contains('gastos')) {
        const viejos = tx.objectStore('gastos').getAll();
        viejos.onsuccess = () => {
          const destino = tx.objectStore('movimientos');
          for (const g of viejos.result) destino.put({ tipo: 'gasto', ...g });
          db.deleteObjectStore('gastos');
        };
      }
    };
    r.onsuccess = () => ok(r.result);
    r.onerror = () => ko(r.error);
    r.onblocked = () => ko(new Error('IndexedDB bloqueada por otra pestaña'));
  });
}

function almacenIDB(db: IDBDatabase): Almacen {
  const store = (nombre: string, modo: IDBTransactionMode = 'readonly') => db.transaction(nombre, modo).objectStore(nombre);
  const fin = (t: IDBTransaction) =>
    new Promise<void>((ok, ko) => {
      t.oncomplete = () => ok();
      t.onerror = t.onabort = () => ko(t.error);
    });

  return {
    get: (k) => req(store('kv').get(k)),
    set: async (k, v) => void (await req(store('kv', 'readwrite').put(v, k))),
    movimientos: () => req(store('movimientos').getAll()),
    guardarMovimientos: async (ms) => {
      const t = db.transaction('movimientos', 'readwrite');
      ms.forEach((m) => t.objectStore('movimientos').put(m));
      await fin(t);
    },
    borrarMovimiento: async (id) => void (await req(store('movimientos', 'readwrite').delete(id))),
    pendientes: () => req(store('outbox').getAll()),
    encolar: async (c) => void (await req(store('outbox', 'readwrite').put(c))),
    quitarPendientes: async (ids) => {
      const t = db.transaction('outbox', 'readwrite');
      ids.forEach((id) => t.objectStore('outbox').delete(id));
      await fin(t);
    },
    borrarTodo: async () => {
      const t = db.transaction(['kv', 'movimientos', 'outbox'], 'readwrite');
      ['kv', 'movimientos', 'outbox'].forEach((s) => t.objectStore(s).clear());
      await fin(t);
    },
  };
}

// ─── Respaldo con localStorage ───────────────────────────────────────────────

function almacenLocal(): Almacen {
  const P = `${NOMBRE_DB}:`;
  const leer = <T>(k: string, def: T): T => {
    try {
      const v = localStorage.getItem(P + k);
      return v === null ? def : (JSON.parse(v) as T);
    } catch {
      return def;
    }
  };
  const escribir = (k: string, v: unknown) => localStorage.setItem(P + k, JSON.stringify(v));
  const todos = (): Movimiento[] => {
    // Migración v1: los gastos antiguos se guardaban en la clave «gastos».
    const viejos = leer<Movimiento[] | null>('gastos', null);
    if (viejos) {
      escribir('movimientos', [...leer<Movimiento[]>('movimientos', []), ...viejos.map((g) => ({ ...g, tipo: g.tipo ?? 'gasto' }))]);
      localStorage.removeItem(`${P}gastos`);
    }
    return leer<Movimiento[]>('movimientos', []);
  };

  return {
    get: async (k) => leer(k, undefined),
    set: async (k, v) => escribir(k, v),
    movimientos: async () => todos(),
    guardarMovimientos: async (ms) => {
      const ids = new Set(ms.map((m) => m.id));
      escribir('movimientos', [...todos().filter((x) => !ids.has(x.id)), ...ms]);
    },
    borrarMovimiento: async (id) => escribir('movimientos', todos().filter((x) => x.id !== id)),
    pendientes: async () => leer<CambioPendiente[]>('outbox', []),
    encolar: async (c) => escribir('outbox', [...leer<CambioPendiente[]>('outbox', []), c]),
    quitarPendientes: async (ids) => escribir('outbox', leer<CambioPendiente[]>('outbox', []).filter((c) => !ids.includes(c.id))),
    borrarTodo: async () => {
      Object.keys(localStorage)
        .filter((k) => k.startsWith(P))
        .forEach((k) => localStorage.removeItem(k));
    },
  };
}

let instancia: Promise<Almacen> | null = null;

export function almacen(): Promise<Almacen> {
  instancia ??= (async () => {
    // Pide que el navegador no purgue los datos (iOS lo concede a PWAs instaladas).
    navigator.storage?.persist?.().catch(() => undefined);
    try {
      if (typeof indexedDB === 'undefined') throw new Error('sin IndexedDB');
      return almacenIDB(await abrirDB());
    } catch {
      return almacenLocal();
    }
  })();
  return instancia;
}
