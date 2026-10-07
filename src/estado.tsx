import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type {
  Ajustes,
  AlertaLimite,
  Categoria,
  ConfigCategorias,
  Diagnostico,
  ISODate,
  Limite,
  Meta,
  MetaNueva,
  Movimiento,
  MovimientoNuevo,
  NivelAlerta,
  Recurrente,
  RecurrenteNuevo,
  Usuario,
} from './types';
import { normalizarMeta, type DatosCopia } from './lib/copia';
import { almacen, type ClaveKV } from './lib/db';
import { categoria, establecerCategorias } from './lib/categorias';
import { aISO, deISO, finMes, hoyISO, mesAnio, sumarMeses } from './lib/fechas';
import { centimos, euros, nuevoId } from './lib/formato';
import { limitesDesdeDiagnostico } from './lib/plan';
import { alertasRelevantes, estadoMeta, impactoGasto, metaPrincipal, textoAlerta } from './lib/presupuesto';
import { generarPendientes } from './lib/recurrentes';
import { registrarCambio } from './lib/sync';

interface Datos {
  usuario: Usuario | null;
  diagnostico: Diagnostico | null;
  metas: Meta[];
  limites: Limite[];
  movimientos: Movimiento[];
  recurrentes: Recurrente[];
  categorias: ConfigCategorias;
  ajustes: Ajustes;
}

export interface Toast {
  id: string;
  texto: string;
  nivel: NivelAlerta;
  icono?: string;
  accion?: { texto: string; ejecutar(): void };
}

type OpcionesToast = Pick<Toast, 'icono' | 'accion'>;

interface Contexto extends Datos {
  cargado: boolean;
  toasts: Toast[];
  /** Marca de tiempo mientras se muestra el confeti de meta conseguida. */
  celebracion: number | null;

  completarOnboarding(nombre: string, d: Diagnostico): Promise<void>;
  cancelarOnboarding(): Promise<void>;
  repetirOnboarding(): Promise<void>;

  guardarMovimiento(m: MovimientoNuevo, opciones?: { repetir?: boolean }): Promise<AlertaLimite[]>;
  borrarMovimiento(id: string): Promise<void>;

  guardarMeta(m: MetaNueva): Promise<Meta>;
  borrarMeta(id: string): Promise<void>;
  archivarMeta(id: string, archivada: boolean): Promise<void>;
  hacerPrincipal(id: string): Promise<void>;
  /** Importe negativo = retirar. */
  aportar(metaId: string, importe: number, nota?: string, fecha?: ISODate): Promise<void>;

  actualizarLimites(l: Limite[]): Promise<void>;

  guardarRecurrente(r: RecurrenteNuevo): Promise<void>;
  borrarRecurrente(id: string): Promise<void>;

  guardarCategoria(c: Omit<Categoria, 'id'> & { id?: string }): Promise<Categoria>;
  borrarCategoria(id: string): Promise<void>;
  alternarCategoriaOculta(id: string): Promise<void>;

  /** Marca revisado el cierre de `mes` ('YYYY-MM') y, si se indica, aparta el sobrante en una hucha. */
  resolverCierre(mes: string, metaId: string | null, importe: number): Promise<void>;

  guardarAjustes(a: Ajustes): Promise<void>;
  actualizarUsuario(cambios: Partial<Pick<Usuario, 'nombre' | 'ingresosNetosMensuales'>>): Promise<void>;
  /** Sustituye todos los datos por los de una copia (conserva el código y la sincronización del dispositivo). */
  restaurarCopia(d: DatosCopia): Promise<void>;
  borrarTodo(): Promise<void>;
  notificar(texto: string, nivel?: NivelAlerta, opciones?: OpcionesToast): void;
  cerrarToast(id: string): void;
}

const CATEGORIAS_VACIAS: ConfigCategorias = { personalizadas: [], ocultas: [] };
const VACIO: Datos = {
  usuario: null,
  diagnostico: null,
  metas: [],
  limites: [],
  movimientos: [],
  recurrentes: [],
  categorias: CATEGORIAS_VACIAS,
  ajustes: {},
};
const Ctx = createContext<Contexto | null>(null);

const ordenar = (ms: Movimiento[]) =>
  [...ms].sort((a, b) => (a.fecha === b.fecha ? b.creadoEn.localeCompare(a.creadoEn) : b.fecha.localeCompare(a.fecha)));

export function ProveedorEstado({ children }: { children: ReactNode }) {
  const [datos, setDatos] = useState<Datos>(VACIO);
  const [cargado, setCargado] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [celebracion, setCelebracion] = useState<number | null>(null);
  // Copia síncrona para que las acciones encadenadas no lean un estado viejo.
  const ref = useRef(datos);

  const actualizar = useCallback((cambios: Partial<Datos>) => {
    if (cambios.categorias) establecerCategorias(cambios.categorias);
    ref.current = { ...ref.current, ...cambios };
    setDatos(ref.current);
  }, []);

  const cerrarToast = useCallback((id: string) => setToasts((ts) => ts.filter((t) => t.id !== id)), []);
  const notificar = useCallback(
    (texto: string, nivel: NivelAlerta = 'ok', opciones: OpcionesToast = {}) => {
      const id = nuevoId();
      setToasts((ts) => [...ts.slice(-2), { id, texto, nivel, ...opciones }]);
      setTimeout(() => cerrarToast(id), nivel === 'excedido' || opciones.accion ? 6500 : 4000);
    },
    [cerrarToast],
  );

  const guardarKV = useCallback(async (clave: ClaveKV, valor: unknown) => {
    const db = await almacen();
    await db.set(clave, valor);
    if (clave !== 'ajustes') await registrarCambio({ entidad: clave, operacion: 'guardar', clave, datos: valor });
  }, []);

  const guardarMovimientosBD = useCallback(async (ms: Movimiento[]) => {
    if (ms.length === 0) return;
    const db = await almacen();
    await db.guardarMovimientos(ms);
    const ids = new Set(ms.map((m) => m.id));
    actualizar({ movimientos: ordenar([...ref.current.movimientos.filter((m) => !ids.has(m.id)), ...ms]) });
    for (const m of ms) void registrarCambio({ entidad: 'movimiento', operacion: 'guardar', clave: m.id, datos: m });
  }, [actualizar]);

  /** Apunta los movimientos fijos que tocaban desde la última vez que se abrió la app. */
  const revisarRecurrentes = useCallback(async () => {
    const { nuevos, actualizados } = generarPendientes(ref.current.recurrentes, new Date());
    if (actualizados.length === 0) return;
    await guardarMovimientosBD(nuevos);
    const porId = new Map(actualizados.map((r) => [r.id, r]));
    const recurrentes = ref.current.recurrentes.map((r) => porId.get(r.id) ?? r);
    await guardarKV('recurrentes', recurrentes);
    actualizar({ recurrentes });
    if (nuevos.length > 0) notificar(`${nuevos.length} ${nuevos.length === 1 ? 'movimiento fijo apuntado' : 'movimientos fijos apuntados'}`, 'ok', { icono: '🔁' });
  }, [actualizar, guardarKV, guardarMovimientosBD, notificar]);

  // ── Carga inicial y migraciones ──
  useEffect(() => {
    (async () => {
      const db = await almacen();
      const [usuario, diagnostico, metas, metaV1, limites, movimientos, recurrentes, categorias, ajustes] = await Promise.all([
        db.get<Usuario>('usuario'),
        db.get<Diagnostico>('diagnostico'),
        db.get<Meta[]>('metas'),
        db.get<Meta>('meta'),
        db.get<Limite[]>('limites'),
        db.movimientos(),
        db.get<Recurrente[]>('recurrentes'),
        db.get<ConfigCategorias>('categorias'),
        db.get<Ajustes>('ajustes'),
      ]);
      // Huchas completas aunque los datos guardados tengan huecos (versiones antiguas, copias editadas).
      let listaMetas = (Array.isArray(metas) ? metas : []).filter((m) => m && typeof m === 'object').map((m) => normalizarMeta(m as unknown as Record<string, unknown>));
      if (!metas && metaV1) {
        // v1 tenía una sola meta: pasa a ser la hucha principal.
        listaMetas = [normalizarMeta(metaV1 as unknown as Record<string, unknown>, true)];
        await db.set('metas', listaMetas);
      }
      // Datos guardados con forma inesperada → valores vacíos, en vez de romper la app.
      const comoLista = <T,>(x: unknown): T[] => (Array.isArray(x) ? x : []);
      const cfgCategorias =
        categorias && Array.isArray(categorias.personalizadas) && Array.isArray(categorias.ocultas) ? categorias : CATEGORIAS_VACIAS;
      actualizar({
        usuario: usuario ?? null,
        diagnostico: diagnostico ?? null,
        metas: listaMetas,
        limites: comoLista<Limite>(limites),
        movimientos: ordenar(comoLista<Movimiento>(movimientos).map((m) => ({ ...m, tipo: m.tipo ?? 'gasto' }))),
        recurrentes: comoLista<Recurrente>(recurrentes),
        categorias: cfgCategorias,
        ajustes: ajustes && typeof ajustes === 'object' ? ajustes : {},
      });
      setCargado(true);
      performance.mark?.('hucha:datos-cargados');
      await revisarRecurrentes();
    })();
  }, [actualizar, revisarRecurrentes]);

  // Al volver a la app (otro día) se apuntan los fijos que hayan vencido.
  useEffect(() => {
    const alVolver = () => document.visibilityState === 'visible' && void revisarRecurrentes();
    document.addEventListener('visibilitychange', alVolver);
    return () => document.removeEventListener('visibilitychange', alVolver);
  }, [revisarRecurrentes]);

  const valor = useMemo<Contexto>(() => {
    const ahoraISO = () => new Date().toISOString();

    const guardarMetas = async (metas: Meta[]) => {
      await guardarKV('metas', metas);
      actualizar({ metas });
    };

    const guardarRecurrentes = async (recurrentes: Recurrente[]) => {
      await guardarKV('recurrentes', recurrentes);
      actualizar({ recurrentes });
    };

    const guardarCategorias = async (categorias: ConfigCategorias) => {
      await guardarKV('categorias', categorias);
      actualizar({ categorias });
    };

    const aportar: Contexto['aportar'] = async (metaId, importe, nota, fecha) => {
      const m = ref.current.metas.find((x) => x.id === metaId);
      if (!m || !importe) return;
      const antes = estadoMeta(m, new Date());
      // No se puede retirar más de lo que hay.
      const cantidad = centimos(importe < 0 ? -Math.min(-importe, antes.ahorrado) : importe);
      if (!cantidad) return;
      const meta: Meta = {
        ...m,
        aportaciones: [...m.aportaciones, { id: nuevoId(), fecha: fecha ?? hoyISO(), importe: cantidad, nota }],
        actualizadoEn: ahoraISO(),
      };
      await guardarMetas(ref.current.metas.map((x) => (x.id === metaId ? meta : x)));
      if (!antes.completada && estadoMeta(meta, new Date()).completada) {
        setCelebracion(Date.now());
        setTimeout(() => setCelebracion(null), 3500);
        notificar(`¡Meta conseguida! ${meta.nombre}`, 'ok', { icono: '🎉' });
      } else if (cantidad > 0) {
        notificar(`${euros(cantidad)} a ${meta.nombre}`, 'ok', { icono: meta.emoji });
      } else {
        notificar(`Retirados ${euros(-cantidad)} de ${meta.nombre}`, 'ok', { icono: '↩️' });
      }
    };

    /** El redondeo de cada gasto se acumula en una sola aportación diaria «Redondeo». */
    const sumarRedondeo = async (metaId: string, diferencia: number) => {
      const m = ref.current.metas.find((x) => x.id === metaId);
      if (!m) return;
      const hoy = hoyISO();
      const existente = m.aportaciones.find((a) => a.fecha === hoy && a.nota === 'Redondeo');
      const aportaciones = existente
        ? m.aportaciones.map((a) => (a === existente ? { ...a, importe: centimos(a.importe + diferencia) } : a))
        : [...m.aportaciones, { id: nuevoId(), fecha: hoy, importe: diferencia, nota: 'Redondeo' }];
      await guardarMetas(ref.current.metas.map((x) => (x.id === metaId ? { ...m, aportaciones, actualizadoEn: ahoraISO() } : x)));
    };

    return {
      ...datos,
      cargado,
      toasts,
      celebracion,
      notificar,
      cerrarToast,
      aportar,

      // ── Onboarding ──
      async completarOnboarding(nombre, d) {
        const r = d.respuestas;
        const previo = ref.current.usuario;
        const usuario: Usuario = {
          id: previo?.id ?? nuevoId(),
          nombre: nombre.trim() || 'tú',
          moneda: 'EUR',
          ingresosNetosMensuales: r.ingresosNetos,
          perfilGasto: r.perfilGasto,
          onboardingCompletado: true,
          creadoEn: previo?.creadoEn ?? ahoraISO(),
          actualizadoEn: ahoraISO(),
        };
        const hoy = new Date();
        const datosMeta = {
          nombre: r.objetivo.nombre.trim() || 'Mi meta',
          importeObjetivo: r.objetivo.importe,
          importeInicial: r.objetivo.ahorroActual,
          fechaInicio: aISO(hoy),
          fechaLimite: aISO(sumarMeses(hoy, Math.max(1, Math.round(r.objetivo.plazoMeses)))),
          aporteMensualPlanificado: d.ahorroMensualRecomendado,
          aportaciones: [],
          actualizadoEn: ahoraISO(),
        };
        // Al repetir el diagnóstico se actualiza la hucha principal (el resto se conserva).
        const principal = metaPrincipal(ref.current.metas);
        const metas: Meta[] = principal
          ? ref.current.metas.map((m) => (m.id === principal.id ? { ...m, ...datosMeta } : m))
          : [...ref.current.metas, { id: nuevoId(), emoji: '🐷', principal: true, creadoEn: ahoraISO(), ...datosMeta }];
        // Límites del diagnóstico + los que el usuario hubiera puesto a otras categorías.
        const nuevos = limitesDesdeDiagnostico(d);
        const cubiertas = new Set(nuevos.map((l) => l.categoria));
        const limites = [...nuevos, ...ref.current.limites.filter((l) => !cubiertas.has(l.categoria))];
        await Promise.all([guardarKV('usuario', usuario), guardarKV('diagnostico', d), guardarKV('metas', metas), guardarKV('limites', limites)]);
        actualizar({ usuario, diagnostico: d, metas, limites });
      },

      async repetirOnboarding() {
        const u = ref.current.usuario;
        if (!u) return;
        const usuario = { ...u, onboardingCompletado: false };
        await guardarKV('usuario', usuario);
        actualizar({ usuario });
      },

      async cancelarOnboarding() {
        const u = ref.current.usuario;
        if (!u || !ref.current.diagnostico) return;
        const usuario = { ...u, onboardingCompletado: true };
        await guardarKV('usuario', usuario);
        actualizar({ usuario });
      },

      // ── Movimientos ──
      async guardarMovimiento(nuevo, opciones = {}) {
        const { movimientos, limites, ajustes, metas } = ref.current;
        const importe = centimos(nuevo.importe);
        const alertas = alertasRelevantes(impactoGasto(movimientos, limites, { ...nuevo, importe }));
        const previo = nuevo.id ? movimientos.find((m) => m.id === nuevo.id) : undefined;
        const mov: Movimiento = {
          id: previo?.id ?? nuevoId(),
          tipo: nuevo.tipo,
          importe,
          categoria: nuevo.categoria,
          fecha: nuevo.fecha,
          nota: nuevo.nota?.trim() || undefined,
          recurrenteId: previo?.recurrenteId,
          creadoEn: previo?.creadoEn ?? ahoraISO(),
          actualizadoEn: ahoraISO(),
        };

        if (opciones.repetir && !previo) {
          const rec: Recurrente = {
            id: nuevoId(),
            tipo: mov.tipo,
            importe,
            categoria: mov.categoria,
            nota: mov.nota,
            dia: deISO(mov.fecha).getDate(),
            desde: mov.fecha,
            ultima: mov.fecha, // este mismo movimiento es la primera vez
            activo: true,
            creadoEn: ahoraISO(),
          };
          mov.recurrenteId = rec.id;
          await guardarRecurrentes([...ref.current.recurrentes, rec]);
        }

        await guardarMovimientosBD([mov]);
        for (const a of alertas) notificar(textoAlerta(a), a.nivel);

        if (previo) return alertas;
        const principal = metaPrincipal(metas);
        const principalActiva = principal && !estadoMeta(principal, new Date()).completada ? principal : null;

        // Redondeo al euro → hucha principal
        if (mov.tipo === 'gasto' && ajustes.redondeo && principalActiva) {
          const diferencia = centimos(Math.ceil(importe) - importe);
          if (diferencia > 0) await sumarRedondeo(principalActiva.id, diferencia);
        }

        if (mov.tipo === 'ingreso') {
          const extra = categoria(mov.categoria).tipo === 'variable';
          const sugerido = Math.round((importe * 0.5) / 5) * 5;
          if (extra && principalActiva && sugerido >= 5) {
            notificar(`Ingreso de ${euros(importe)} guardado`, 'ok', {
              icono: '💰',
              accion: { texto: `Apartar ${euros(sugerido)}`, ejecutar: () => void aportar(principalActiva.id, sugerido, 'Parte de un ingreso extra') },
            });
          } else {
            notificar(`Ingreso de ${euros(importe)} guardado`, 'ok', { icono: '💰' });
          }
        }
        if (opciones.repetir) notificar(`Se apuntará solo cada mes, el día ${deISO(mov.fecha).getDate()}`, 'ok', { icono: '🔁' });
        return alertas;
      },

      async borrarMovimiento(id) {
        const borrado = ref.current.movimientos.find((g) => g.id === id);
        if (!borrado) return;
        const db = await almacen();
        await db.borrarMovimiento(id);
        actualizar({ movimientos: ref.current.movimientos.filter((g) => g.id !== id) });
        void registrarCambio({ entidad: 'movimiento', operacion: 'borrar', clave: id });
        notificar(borrado.tipo === 'gasto' ? 'Gasto borrado' : 'Ingreso borrado', 'ok', {
          icono: '🗑️',
          accion: { texto: 'Deshacer', ejecutar: () => void guardarMovimientosBD([borrado]) },
        });
      },

      // ── Huchas ──
      async guardarMeta(m) {
        const metas = ref.current.metas;
        const previa = m.id ? metas.find((x) => x.id === m.id) : undefined;
        const meta: Meta = previa
          ? { ...previa, ...m, id: previa.id, actualizadoEn: ahoraISO() }
          : {
              ...m,
              id: nuevoId(),
              fechaInicio: hoyISO(),
              aportaciones: [],
              principal: m.principal ?? metasActivasSinArchivar(metas).length === 0,
              creadoEn: ahoraISO(),
              actualizadoEn: ahoraISO(),
            };
        let lista = previa ? metas.map((x) => (x.id === meta.id ? meta : x)) : [...metas, meta];
        if (meta.principal) lista = lista.map((x) => ({ ...x, principal: x.id === meta.id }));
        await guardarMetas(lista);
        return meta;
      },

      async borrarMeta(id) {
        let lista = ref.current.metas.filter((m) => m.id !== id);
        if (!lista.some((m) => m.principal && !m.archivada)) lista = asignarPrincipal(lista);
        await guardarMetas(lista);
      },

      async archivarMeta(id, archivada) {
        let lista = ref.current.metas.map((m) => (m.id === id ? { ...m, archivada, principal: archivada ? false : m.principal } : m));
        if (!lista.some((m) => m.principal && !m.archivada)) lista = asignarPrincipal(lista);
        await guardarMetas(lista);
      },

      async hacerPrincipal(id) {
        await guardarMetas(ref.current.metas.map((m) => ({ ...m, principal: m.id === id })));
      },

      async resolverCierre(mes, metaId, importe) {
        if (metaId && importe > 0) {
          // Fechada el último día de ese mes: así cuenta como ahorro de aquel mes, no del actual.
          await aportar(metaId, importe, `Sobrante de ${mesAnio(`${mes}-01`).split(' ')[0]}`, aISO(finMes(deISO(`${mes}-01`))));
        }
        const ajustes = { ...ref.current.ajustes, cierres: [...new Set([...(ref.current.ajustes.cierres ?? []), mes])] };
        await guardarKV('ajustes', ajustes);
        actualizar({ ajustes });
      },

      // ── Límites ──
      async actualizarLimites(limites) {
        await guardarKV('limites', limites);
        actualizar({ limites });
      },

      // ── Recurrentes ──
      async guardarRecurrente(r) {
        const lista = ref.current.recurrentes;
        const previo = r.id ? lista.find((x) => x.id === r.id) : undefined;
        const rec: Recurrente = previo
          ? { ...previo, ...r, id: previo.id }
          : { ...r, id: nuevoId(), desde: hoyISO(), creadoEn: ahoraISO() };
        await guardarRecurrentes(previo ? lista.map((x) => (x.id === rec.id ? rec : x)) : [...lista, rec]);
        await revisarRecurrentes(); // por si toca hoy
      },

      async borrarRecurrente(id) {
        await guardarRecurrentes(ref.current.recurrentes.filter((r) => r.id !== id));
      },

      // ── Categorías ──
      async guardarCategoria(c) {
        const cfg = ref.current.categorias;
        const cat: Categoria = { ...c, id: c.id ?? `cat-${nuevoId()}`, personalizada: true, oculta: undefined };
        const existe = cfg.personalizadas.some((x) => x.id === cat.id);
        await guardarCategorias({
          ...cfg,
          personalizadas: existe ? cfg.personalizadas.map((x) => (x.id === cat.id ? cat : x)) : [...cfg.personalizadas, cat],
        });
        return cat;
      },

      async borrarCategoria(id) {
        const cfg = ref.current.categorias;
        await guardarCategorias({ personalizadas: cfg.personalizadas.filter((c) => c.id !== id), ocultas: cfg.ocultas.filter((x) => x !== id) });
        if (ref.current.limites.some((l) => l.categoria === id)) {
          const limites = ref.current.limites.filter((l) => l.categoria !== id);
          await guardarKV('limites', limites);
          actualizar({ limites });
        }
      },

      async alternarCategoriaOculta(id) {
        const cfg = ref.current.categorias;
        const ocultas = cfg.ocultas.includes(id) ? cfg.ocultas.filter((x) => x !== id) : [...cfg.ocultas, id];
        await guardarCategorias({ ...cfg, ocultas });
      },

      // ── Ajustes ──
      async guardarAjustes(ajustes) {
        await guardarKV('ajustes', ajustes);
        actualizar({ ajustes });
      },

      async actualizarUsuario(cambios) {
        const u = ref.current.usuario;
        if (!u) return;
        const usuario = { ...u, ...cambios, actualizadoEn: ahoraISO() };
        await guardarKV('usuario', usuario);
        actualizar({ usuario });
      },

      async restaurarCopia(d) {
        const { bloqueo, urlSincronizacion } = ref.current.ajustes;
        const ajustes: Ajustes = { ...d.ajustes, bloqueo, urlSincronizacion };
        const db = await almacen();
        await db.borrarTodo();
        await Promise.all([
          db.set('usuario', d.usuario),
          db.set('diagnostico', d.diagnostico ?? undefined),
          db.set('metas', d.metas),
          db.set('limites', d.limites),
          db.set('recurrentes', d.recurrentes),
          db.set('categorias', d.categorias),
          db.set('ajustes', ajustes),
          db.guardarMovimientos(d.movimientos),
        ]);
        actualizar({ ...d, movimientos: ordenar(d.movimientos), ajustes });
        notificar(`Copia restaurada: ${d.movimientos.length} movimientos`, 'ok', { icono: '💾' });
        await revisarRecurrentes();
      },

      async borrarTodo() {
        const db = await almacen();
        await db.borrarTodo();
        actualizar({ ...VACIO, categorias: CATEGORIAS_VACIAS });
      },
    };
  }, [datos, cargado, toasts, celebracion, notificar, cerrarToast, guardarKV, guardarMovimientosBD, revisarRecurrentes, actualizar]);

  return <Ctx.Provider value={valor}>{children}</Ctx.Provider>;
}

const metasActivasSinArchivar = (metas: Meta[]) => metas.filter((m) => !m.archivada);

/** Si no queda ninguna principal, lo pasa a ser la primera hucha activa. */
function asignarPrincipal(metas: Meta[]): Meta[] {
  const primera = metas.find((m) => !m.archivada);
  return metas.map((m) => ({ ...m, principal: m.id === primera?.id }));
}

export function useEstado(): Contexto {
  const c = useContext(Ctx);
  if (!c) throw new Error('useEstado fuera de <ProveedorEstado>');
  return c;
}
