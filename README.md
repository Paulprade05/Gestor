# Hucha · PWA de finanzas personales (iOS first)

React 19 + TypeScript + Vite, CSS propio al estilo iOS. Local-first: todo vive en IndexedDB y funciona sin conexión.

```bash
npm install
npm run dev        # desarrollo (también accesible desde el iPhone en la misma red)
npm test           # tests del algoritmo y de los límites
npm run build      # build de producción en dist/
npm run preview    # sirve dist/ con service worker activo
npm run icons      # regenera los iconos PNG
```

> El service worker solo se registra en la build de producción. Para instalarla en iOS hace falta HTTPS
> (o `localhost`): despliega `dist/` en cualquier hosting estático y en Safari → Compartir → «Añadir a pantalla de inicio».

## Dónde está cada entregable

| Entregable | Fichero |
|---|---|
| 1. Modelos (Usuario, Meta, Movimiento, Recurrente, Categoría, Límite, Diagnóstico…) | [src/types.ts](src/types.ts) |
| 2. Algoritmo de recomendación | [src/lib/plan.ts](src/lib/plan.ts) (+ [tests](src/lib/plan.test.ts)) |
| Límites, alertas 80/100 %, ingresos, huchas, cierre de mes, comparativas | [src/lib/presupuesto.ts](src/lib/presupuesto.ts) (+ [tests](src/lib/presupuesto.test.ts)) |
| Movimientos fijos (se apuntan solos) | [src/lib/recurrentes.ts](src/lib/recurrentes.ts) (+ [tests](src/lib/recurrentes.test.ts)) |
| Catálogo de categorías (predefinidas + propias) | [src/lib/categorias.ts](src/lib/categorias.ts) |
| 3. Configuración PWA iOS | [index.html](index.html), [public/manifest.webmanifest](public/manifest.webmanifest), [public/sw.js](public/sw.js), [src/styles.css](src/styles.css) |
| 4. Registro rápido | [src/components/RegistroRapido.tsx](src/components/RegistroRapido.tsx) |
| 4. Balance / dashboard | [src/components/Dashboard.tsx](src/components/Dashboard.tsx) |
| Onboarding y diagnóstico | [src/components/Onboarding.tsx](src/components/Onboarding.tsx) |
| Persistencia y sincronización | [src/lib/db.ts](src/lib/db.ts), [src/lib/sync.ts](src/lib/sync.ts) |

## Algoritmo (resumen)

1. **Regla base** según gastos fijos / ingresos: ≤50 % → 50/30/20 · ≤60 % → 60/20/20 · ≤70 % → 70/20/10 · >70 % → 80/10/10.
2. **Tasa de ahorro** = la de la regla ± perfil (ahorrador +5 pt, disfrutón −5 pt; mínimo 5 %).
3. **Ahorro que pide la meta** = (importe − ya ahorrado) / plazo.
4. **Techo sostenible** = margen − 5 % de ingresos para imprevistos − ocio mínimo del perfil (3/5/8 %).
5. **Recomendado** = máx(regla, capacidad declarada, lo que pide la meta), limitado por el techo y redondeado a 5 €.
6. **Viabilidad** = recomendado / necesario (≥1,15 holgada · ≥1 viable · ≥0,8 ajustada · resto fuera de plazo); si no llega, propone plazo o importe alternativos.
7. El resto se reparte entre **imprevistos** y **ocio** según el perfil; las categorías variables (comida, ocio, imprevistos) tienen además techo semanal (= mensual × 12/52).

**Restante diario** = (lo que queda en categorías variables con límite − lo que te hayas pasado en las fijas − lo gastado en categorías sin límite) / días que quedan del mes.

## Ingresos, gastos y ahorro

- **Ingresos:** categorías habituales (nómina: si se registra, sustituye a los ingresos previstos del mes) y extra (paga extra, trabajos, ventas… se suman). Tras un ingreso extra se propone apartar la mitad.
- **Categorías:** 15 de gasto y 7 de ingreso predefinidas; se pueden ocultar y crear propias (nombre, emoji, color, fija o día a día). Cualquier categoría puede tener límite; sin límite, su gasto sale del margen del día a día.
- **Movimientos fijos:** nómina, alquiler, suscripciones… se apuntan solos cada mes (también los pendientes si la app llevaba días cerrada). Se crean desde Más → Movimientos fijos o con «🔁 Cada mes» al apuntar.
- **Movimientos:** resumen del mes (ingresos, gastos, balance), buscador en todos los meses, filtros por tipo y categoría, y análisis por categoría frente al mes anterior con proyección del mes.
- **Huchas:** varias metas con emoji, aportar y retirar, una principal (inicio, redondeo y sugerencias), archivar, ideas con fondo de emergencia calculado (3 meses de gastos fijos).
- **Ahorro automático:** redondeo de cada gasto al euro hacia la hucha principal.
- **Cierre de mes:** si el mes anterior sobró dinero (ingresos − gastos − apartado), propone pasarlo a la hucha principal con fecha de ese mes.
- **Exportar y restaurar:** CSV para Excel (`;` y coma decimal) y copia completa en JSON con la hoja de compartir de iOS; la copia se puede restaurar desde Ajustes ([src/lib/copia.ts](src/lib/copia.ts) valida y completa los datos, también de copias v1).
- **Previsión de fin de mes** ([src/lib/analisis.ts](src/lib/analisis.ts)): ingresos (con los fijos por llegar) − gastado − fijos pendientes − día a día proyectado − huchas. El ritmo diario mezcla el real con el presupuesto los primeros 10 días y no proyecta gastos extraordinarios (> 100 € o 5 × presupuesto diario). Si sale negativo, dice cuánto gastar al día para cuadrar.
- **Consejos automáticos** (máx. 3): previsión negativa, categoría disparada frente a los mismos días del mes anterior, gastos sin límite, racha, gastos hormiga, ingresos extra sin ahorrar, días sin apuntar.
- **Racha 🔥** de días dentro del presupuesto diario, **evolución** de 6 meses y **calendario** de gasto diario en Análisis.
- **Privacidad:** bloqueo con código de 4 cifras (solo se guarda SHA-256 con sal; «Siempre» bloquea al salir para que el selector de apps no muestre tus cuentas) y modo para difuminar importes. Es una barrera de privacidad, no cifrado.
- **Perfil** editable (nombre e ingresos previstos) y **pantalla de recuperación** si algo falla al pintar (recargar, guardar los datos o empezar de cero).
- **Migración:** la base de datos v1 (`gastos`, una sola `meta`) se convierte sola a v2 (`movimientos`, lista de `metas`).

## Detalles iOS

- `viewport-fit=cover` + `env(safe-area-inset-*)` en cabecera, tab bar, hoja y notificaciones.
- `apple-mobile-web-app-capable`, barra de estado `default` (clara), `apple-touch-icon` opaco de 180 px.
- Sin zoom en inputs: todos a ≥16 px (sin bloquear el zoom del usuario con `maximum-scale`). `touch-action: manipulation` quita el zoom por doble toque.
- Sin rebote de página: `body` fijo y `overscroll-behavior` en cada zona con scroll.
- Registro con teclado numérico propio (no aparece el teclado del sistema), hoja inferior que se cierra arrastrando.
- `navigator.storage.persist()` para que iOS no purgue los datos; respaldo en localStorage si IndexedDB falla.
- Background Sync no existe en Safari: la cola se envía al volver la conexión o al volver a la app.
- Teclado de iOS: [src/lib/ios.ts](src/lib/ios.ts) lee `visualViewport` y publica `--teclado`; las hojas se apoyan encima del teclado, se ocultan la tab bar y el teclado numérico propio, y el campo enfocado se centra.
- Pestañas montadas (ocultas al cambiar): cambio instantáneo, conservan scroll y filtros; tocar la pestaña activa sube al principio.
- **Ancho fijo de diseño, 390 pt** (script en [index.html](index.html)): en pantallas más estrechas (iPhone con «Zoom de pantalla» ampliado = 320 pt, SE, mini) la app se dibuja a 390 pt y iOS la escala para ocupar el ancho exacto; se ve igual que en un iPhone 12 sin depender de esos ajustes. En pantallas más anchas (Plus/Pro Max) usa su ancho real.
- **Respaldo adaptable** (final de [src/styles.css](src/styles.css)): si aun así el ancho útil baja (tamaño de texto de Safari ampliado), cifras con `clamp()`, cajas que pasan a otra fila en vez de recortar, y ajustes para ≤ 360 pt. Comprobado de 320 a 430 pt.
- Revisado a 390×844 (iPhone 12/13/14) con zonas seguras de 47/34 pt y a 390×664 (Safari con barras): nada fuera de pantalla, sin solapes, controles ≥ 32 pt, campos ≥ 16 px. Con 1.500 movimientos carga en ~160 ms y cada interacción tarda menos de 15 ms.
- Requiere iOS 16.2 o superior (`color-mix`, `inert`).

## Diseño

- Tema claro rosa siempre (`color-scheme: light only`), aunque el iPhone esté en modo oscuro. Los colores están como variables al principio de [src/styles.css](src/styles.css).
- Títulos y cifras en SF Pro Rounded (`ui-rounded`) en iPhone.
- Dashboard: balance con anillo de margen diario, gráfico de los últimos 7 días frente al ritmo ideal y límites por mes o semana.
- Deslizar un gasto a la izquierda para borrarlo, con «Deshacer» en la notificación.
- Gastos frecuentes en el registro rápido (un toque rellena importe, categoría y nota).
- Confeti al completar la meta. Pantallas de arranque de iOS en `public/splash/` (generadas con `npm run icons`).

## Pendiente / ideas

- Al desplegar una versión nueva, subir `VERSION` en `public/sw.js` para limpiar la caché antigua.
- El servidor de sincronización no está incluido: espera un `POST { cambios: [...] }` y responder 2xx.
