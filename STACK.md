# STACK — LaParada

Fecha de verificación: 2026-08-25  
Estado: arquitectura observada y contrato objetivo para la estabilización.  
Nivel Cronos: **Nivel 3**, porque combina aplicación pública, panel administrativo, datos
multi-tenant, Functions programadas e integraciones externas con impacto operativo.

## Arquitectura vigente

| Capa | Tecnología | Fuente verificable |
| --- | --- | --- |
| Frontend | React 18, TypeScript, Vite 8, React Router 6, Tailwind CSS 3 | `package.json`, `vite.config.ts`, `tsconfig.json` |
| Backend | Firebase Cloud Functions v2, TypeScript CommonJS, Node 20 | `firebase-functions/package.json`, `firebase-functions/tsconfig.json`, `firebase-functions/src/index.ts` |
| Datos | Cloud Firestore y Cloud Storage | `firebase.json`, `firestore.rules`, `storage.rules` |
| Identidad | Firebase Authentication y perfiles `usuarios_negocio` | `src/context/AuthContext.tsx`, reglas |
| Pruebas | Vitest, Firebase Emulator Suite y ESLint | `package.json`, `tests/` |
| Paquetes | workspace pnpm | `pnpm-workspace.yaml`, `pnpm-lock.yaml` |
| Frontend publicado | Cloudflare Pages, dominio observado `laparada.pages.dev` | `AUDITORIA.md` |
| Proyecto Firebase | `laparada-26` | `.firebaserc` |

## Identidad visual

Dirección definida el 2026-09-04 para la tienda pública: **menú de parrilla + ticket de pedido**.
El objetivo es que el catálogo y la siguiente acción de compra aparezcan antes que el contenido
promocional, sin perder el carácter oscuro y amarillo de La Parada.

- **Referencias Mobbin:** [DoorDash](https://mobbin.com/screens/ed892ac4-7dc4-4b98-9ab2-81a4a978fac3)
  para jerarquía de restaurante/categorías y detalle de producto;
  [Uber Eats](https://mobbin.com/screens/5a3e701b-f2d5-4307-8ff5-d026d7d5ac0c) para carrito lateral
  y resumen antes de continuar; [Grill'd](https://mobbin.com/screens/e0b166c7-a999-4a15-b831-4dccb38f32e5)
  para navegación móvil por categorías y CTA persistente; y
  [HelloFresh](https://mobbin.com/screens/7d1f4046-bd85-40c3-ba90-f7e07aef1f2a) para jerarquía de
  foto, nombre, atributos y acción en cada ficha. Se toman patrones de interacción, no copy ni
  layouts literales.
- **Paleta:** carbón `#0B0A09` para navegación y marca; blanco cálido `#F4F0E8` para el área de menú;
  papel `#FFFCF7` para fichas y recibo; mostaza `#F6B800` para la acción principal; verde
  `#168A5B` exclusivamente para disponibilidad/entrega.
- **Tipografía:** Syne para marca y títulos cortos; DM Sans para búsqueda, descripciones, precios y
  formularios. Se mantienen las cargas no bloqueantes ya optimizadas.
- **Layout:** encabezado comercial compacto, categorías pegajosas, catálogo de lectura rápida y
  resumen del pedido persistente en escritorio; en móvil, lista de platos y CTA inferior.
- **Elemento firma:** el resumen se comporta visualmente como un ticket de cocina, con separadores
  punteados y total dominante.
- **Defaults evitados:** hero de pantalla casi completa que posterga el menú; mosaico de cinco
  tarjetas estrechas con texto diminuto; gradientes decorativos sin función; emojis usados como
  iconos de navegación.

### Backoffice administrativo — UX-002

Dirección definida el 2026-09-04: **cabina operativa + superficie de trabajo legible**. El panel
debe permitir cambiar de módulo, reconocer la hora y el negocio, y ejecutar la siguiente acción sin
depender de un dock flotante ni de memorizar iconos.

- **Referencias Mobbin:** [Fresha](https://mobbin.com/screens/bcbc7fb0-545b-42c7-9451-608eef1f5747)
  para la división catálogo/ticket del POS;
  [Whop](https://mobbin.com/screens/bb55ffb2-4fe1-4da8-a87e-85251e506943) para filtros temporales y
  métricas compactas;
  [Square Items](https://mobbin.com/screens/c914fb7a-3274-4fd2-9fa7-508a7af9274a) para búsqueda,
  filtros y acciones contextuales de catálogo;
  [Shopify Orders](https://mobbin.com/screens/09285c84-7606-414b-8bc6-dced300517a8) y
  [Square Orders](https://mobbin.com/screens/7704f2d4-cc6c-4474-9b43-d72d19470756) para cola de
  pedidos, estados separados y detalle lateral; y
  [Shopify móvil](https://mobbin.com/screens/01342a7b-44d0-4796-a548-c152b6d90b9f) para navegación
  inferior reducida. Se extraen convenciones, no recursos ni layouts literales.
- **Paleta:** carbón `#171713` para el shell; pergamino `#F4F1E8` para el área de trabajo; papel
  `#FFFDF8` para paneles; tinta `#201F1B` para lectura; dorado `#C9A84C` para prioridad; verde,
  naranja y rojo únicamente para estados operativos.
- **Tipografía:** Syne queda restringida a marca y títulos cortos; DM Sans cubre cifras, filtros,
  tablas, formularios y ayudas.
- **Layout:** sidebar persistente en escritorio, barra contextual superior y una secuencia común
  `acción principal → métricas breves → búsqueda/filtros → tabla, lista o tablero`. En móvil se
  conservan cuatro destinos principales y una hoja accesible para el resto.
- **Elemento firma:** pulso operativo compacto en la cabecera con módulo, hora y negocio visibles.
- **Defaults evitados:** dock flotante de nueve destinos en escritorio; grandes superficies negras
  vacías; emojis como iconos; tarjetas para cada fila administrativa; acciones destructivas con
  copy ambiguo.

El frontend público consulta el catálogo con el SDK web de Firebase. Las operaciones internas usan
servicios cliente y reglas, siempre con el `negocioId` seleccionado. El pedido público entra
exclusivamente por `crearPedidoPublico` y el alta de personal por `crearUsuarioPersonal`; ambas
callables exigen App Check. El contrato multi-tenant ya está implementado y validado localmente;
los datos históricos remotos aún requieren el backfill reversible de `MIGRACION_MULTI_TENANT.md`.

### Aislamiento multi-tenant

- Las colecciones superiores se conservan, pero cada documento operativo exige `negocioId`
  inmutable y toda consulta interna filtra primero por ese campo.
- Firestore y Storage derivan rol/tenant del perfil activo `usuarios_negocio/<uid>`; los claims
  globales heredados no conceden acceso.
- El catálogo conserva lectura pública, con escritura administrativa aislada. Los comprobantes de
  transferencia usan `transferencias/{negocioId}/...` y solo se leen con sesión del mismo tenant.
- `firestore.indexes.json` contiene 31 índices compuestos tenant-first para las consultas activas;
  se retiraron tres índices de estados de WhatsApp que dejaron de ser consultados por el cliente.
- `_ordenes_whatsapp_activas` mantiene un puntero interno por tenant/teléfono para serializar la
  orden conversacional. No requiere índice compuesto y está cerrada a todos los clientes.
- El superadministrador tiene acceso global en reglas, pero la interfaz siempre opera sobre el
  negocio seleccionado. La decisión completa está en `docs/adr/ADR-001-aislamiento-multitenant.md`.

## Contrato de pedido offline

Decisión registrada el 2026-08-25: se mantienen **efectivo** y **transferencia manual**. La
transferencia es una coordinación entre cliente y negocio; la aplicación no crea cobros, no abre
enlaces externos y no confirma automáticamente que el dinero llegó.

### Conceptos separados

- `MetodoPago`: `efectivo | transferencia`.
- `TipoEntrega`: `mostrador | domicilio`.
- `EstadoDomicilio`: `pendiente | en_preparacion | en_camino | entregado`.

`domicilio` deja de ser un método de pago. Los documentos históricos que lo usen en
`metodoPago` se consideran legado de solo lectura hasta una migración autorizada; los pedidos
nuevos no deben escribir ese valor.

### Entrada pública mínima para PASO-03

El cliente podrá enviar únicamente:

- `negocioId` o identificador público equivalente;
- `idempotencyKey` opaca y única por intento de pedido;
- items con `tipo`, `referenciaId` y `cantidad`;
- `clienteNombre`, `clienteTelefono`, `direccion`, `barrio` y `notas` opcionales según límites;
- `metodoPago` dentro de los dos valores offline.
- para efectivo, `pagaCon` opcional como dato logístico de cambio.

El backend deberá obtener del catálogo `nombre`, disponibilidad y precio; recalcular items,
subtotal, costo de domicilio, descuentos autorizados y total; fijar `origen`, `estado` y
timestamps (la hora del pedido queda en el timestamp, no en un campo de turno). Debe ignorar cualquier precio, total, estado o snapshot enviado por el navegador.

### Persistencia objetivo

Un domicilio válido conserva como mínimo `negocioId`, datos de entrega normalizados, items con
snapshots calculados en servidor, total en COP entero, `metodoPago`, `origen`, `estado`,
`idempotencyKey`, `creadoEn` y `actualizadoEn`. No almacena datos de tarjeta, sesión de cobro,
referencia de pasarela ni respuesta de proveedor financiero.

Las colecciones históricas `transacciones_pago` y `sesiones_pago` permanecen preservadas pero
denegadas a todos los clientes por reglas. Eliminarlas o migrarlas exige inventario remoto, backup
verificado, rollback y autorización explícita.

## Integraciones externas

- **WhatsApp Business Cloud API:** única integración operativa exportada por Functions. El webhook,
  cola, bot y callable manual están consolidados localmente; usan tres secretos independientes en
  Secret Manager y parámetros no secretos para número, versión y tenant. Falta el smoke con sandbox
  real para cerrar PASO-07.
- Los items de WhatsApp se resuelven desde el número visible del menú hacia IDs estables de
  `productos`/`combos`; el total se recalcula desde el catálogo vigente dentro de la confirmación.
- **Código IA heredado:** existe un cliente Anthropic no exportado en `firebase-functions/src/ai`. No se debe
  crear `CLAUDE_API_KEY` ni asumirlo activo hasta inventariarlo y decidir su destino.
- **Edición de fotos de productos:** `removerFondoProducto` es una callable v2 protegida con Auth,
  App Check, autorización por perfil administrativo y rate limit. La Function hace `fetch` a
  remove.bg usando exclusivamente el secreto `REMOVE_BG_API_KEY`; el navegador recibe un PNG
  transparente y compone localmente el producto sobre `public/assets/background-table.jpg` con
  Canvas antes de subir el JPEG final a Storage. Si el proveedor falla, la foto original se
  conserva y la UI muestra un error accionable. El procesador heredado de fondo uniforme por
  categoría fue retirado; no existe una segunda acción de edición ni un selector de color.
- **Pagos en línea:** ninguno. No deben existir SDK, webhook, scheduler, secreto, enlace ni UI de
  MercadoPago, Stripe, PayPal u otra plataforma.

## Entornos y configuración

- **Local frontend:** variables públicas `VITE_FIREBASE_*` en `.env.local`; no versionar secretos.
- **Procesamiento de imágenes:** `REMOVE_BG_API_KEY` no es una variable `VITE_*` y nunca se declara
  en el frontend. En producción se configura como secreto de Firebase Functions; localmente puede
  cargarse mediante el mecanismo de secretos del emulador (`firebase-functions/.secret.local`).
- **App Check:** la app web está registrada con una clave reCAPTCHA Enterprise `score` restringida a
  `laparada.pages.dev`; Cloudflare Pages entrega `VITE_FIREBASE_APP_CHECK_SITE_KEY` como variable
  cifrada de build. Las callables exigen App Check y consumen tokens de uso limitado; la cuenta de
  servicio de Functions 2nd gen tiene el rol `Firebase App Check Token Verifier`.
- **Emuladores:** Auth `9099`, Firestore `8080`, Functions `5001` y Storage `9199`. Las suites usan
  proyectos aislados `demo-*`; `test:rules` cubre Auth/Firestore/Storage y los scripts E2E locales
  cubren las callables sin tocar recursos remotos.
- **Functions:** runtime objetivo Node 20. El 2026-08-25 se validaron con Node `20.20.2` el build de
  Functions, TypeScript, ESLint, Vitest y las 41 pruebas de emuladores; la instalación global sigue
  en Node 24. Firebase marcó Node 20 como deprecado y anunció su retiro para el 2026-10-30; se debe
  migrar el runtime antes de esa fecha.
- **Producción:** Firebase `laparada-26` y frontend observado en Cloudflare Pages. No existe en el
  repositorio una configuración declarativa de Pages; el procedimiento de publicación debe
  documentarse en PASO-10.

## Comandos de verificación

```powershell
corepack pnpm install
corepack pnpm lint
corepack pnpm test
corepack pnpm test:rules
corepack pnpm run build
corepack pnpm run build:functions
corepack pnpm audit --prod
```

`corepack pnpm run dev` inicia Vite. Los comandos `deploy` existen, pero no se ejecutan sin
checklist y autorización explícita del operador.

## Costo

| Servicio | Estado | Orden de magnitud inicial | Control requerido |
| --- | --- | --- | --- |
| Firebase Blaze: Firestore, Storage, Functions, Cloud Build/Run y Secret Manager | Blaze/prueba gratuita verificado; consumo neto observado USD 0 | USD 0–5/mes con volumen pequeño y dentro/cerca de cuotas; puede crecer por tráfico, imágenes, jobs o abuso | Presupuesto USD 1 verificado con alertas 50/90/100 %; sin límite duro. Webhook `maxInstances: 10`, schedulers `maxInstances: 1` |
| Cloudflare Pages estático | Publicación observada; plan no verificable desde el repo | USD 0/mes si continúa en el plan gratuito y sin Pages Functions | Confirmar cuenta, plan y propietario |
| reCAPTCHA Enterprise / Firebase App Check | Clave `score` activa, dominio restringido, TTL 1 h y umbral 0,5 | USD 0 hasta 10.000 evaluaciones mensuales compartidas por organización; con Blaze, de 10.001 a 100.000 aplica un tramo de USD 8 | Vigilar cuota y presupuesto; App Check falla cerrado si se agota la cuota |
| WhatsApp Business Cloud API | Código local; alta de Meta for Developers y sandbox pendientes | USD 0 para las respuestas de texto sin plantilla dentro de la ventana de servicio que usa este bot; plantillas fuera de la ventana varían por categoría/país | Mantener el flujo reactivo sin plantillas para el smoke; presupuestar cualquier plantilla antes de activarla |
| Anthropic | Cliente heredado no exportado | USD 0 mientras permanezca inactivo y sin secreto | Retirar o presupuestar explícitamente antes de activarlo |
| Plataformas de pago | Retiradas | USD 0 | No crear cuentas, credenciales ni recursos |

Firebase Blaze conserva cuotas sin costo y cobra el exceso por uso; sus alertas de presupuesto no
son por sí solas un tope de gasto. Cloudflare documenta que las solicitudes de activos estáticos de
Pages son gratuitas y sin límite en planes Free/Paid, mientras Pages Functions comparte cuota con
Workers. Fuentes oficiales consultadas el 2026-08-25:

- https://firebase.google.com/docs/projects/billing/firebase-pricing-plans
- https://firebase.google.com/pricing
- https://cloud.google.com/billing/docs/how-to/budgets
- https://docs.cloud.google.com/recaptcha/docs/billing-information
- https://developers.cloudflare.com/pages/functions/pricing/
- https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing/

**Hallazgo de costo bajo:** el presupuesto de USD 1 informa al 50/90/100 %, pero no es un límite
duro. La concurrencia ya está acotada en código. Evaluar un spend cap para Cloud Run Functions antes
de PASO-10 si la cuenta lo permite; no bloquea el sandbox autorizado.

Los documentos de rate limit incluyen `expiraEn`; habilitar una política TTL para esa colección es
una acción externa pendiente del checklist de despliegue y sus borrados pueden generar operaciones
facturables.

Los índices tenant-first agregan almacenamiento y fan-out de escritura de bajo orden para el volumen
actual; no incorporan un proveedor ni costo fijo nuevo. El costo real deberá observarse después del
despliegue y del backfill autorizado.

WhatsApp añade consumo de Functions y Firestore cuando se active. El envío manual está limitado a
30 intentos por operador cada cinco minutos, el webhook a 100 eventos por solicitud y los schedulers
a una instancia. El flujo reactivo del bot usa texto sin plantilla dentro de la ventana de servicio,
que Meta documenta sin cargo; cualquier plantilla futura requiere una estimación separada.

## Gates de despliegue

Antes de producción: cero hallazgos críticos abiertos; todas las suites en verde con Node 20;
backup y rollback para cualquier migración; alerta de presupuesto revisada; secretos mínimos; y
autorización explícita separada para frontend, Functions, reglas o datos.
