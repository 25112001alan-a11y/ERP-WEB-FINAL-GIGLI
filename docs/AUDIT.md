# Nexus ERP — Informe de auditoría

> Fecha: 2026-09-19 · Última actualización: 2026-09-23 (prueba CI de migraciones ECO preparada; cambios sin publicar)
> Alcance: `src/` (frontend React 19 + Vite + Tailwind 4), `server/` (Express 5 + Prisma + Zod, MySQL), `server/prisma/schema.prisma`
> Método: revisión de código por agentes de exploración (buenas prácticas, coherencia frontend↔backend, duplicación) + verificación cruzada del diff.
> Estado: hallazgos marcados ✅ (resuelto), ⏳ (pendiente deliberado), ⚠️ (requiere decisión del usuario). Moneda ARS y datos reales resueltos en tanda 2. Fase 0 completada.

## Veredicto

El código está **bien encuadrado**: señales de nivel senior en seguridad y consistencia (auth con re-validación en DB y lockout, tenancy por `companyId`, uploads con magic bytes, stock atómico, numeración fiscal con `FOR UPDATE`, auditoría transaccional). Las debilidades son de robustez a escala y de coherencia de UI, no de lógica. **No requiere reescritura.**

---

## 1. Buenas prácticas

### Trabajo ya resuelto ✅

| Hallazgo | Estado |
| --- | --- |
| Firma de webhook de Mercado Pago calculada sobre body re-serializado (`JSON.stringify`) — toda webhook real podía ser rechazada | ✅ Resuelto: `express.raw({ type: '*/*' })` montado en `/api/billing/webhook` antes del parser JSON global (`server/src/app.ts`); la ruta firma y procesa los bytes crudos (`server/src/routes/billing.routes.ts`) |
| Ajuste de stock con read-modify-write (condición de carrera, pérdida de actualizaciones) | ✅ Resuelto: `updateMany` atómico con guarda `quantity >= -delta` en `server/src/routes/stock.routes.ts` (mismo patrón que ventas) |
| Params de ruta/query sin validar → 500s genéricos con NaN | ✅ Resuelto: `lib/params.ts` (`parsePositiveInt`) aplicado en products, clients, suppliers, documents (`/:id`, receive, external, attachment) y stock `GET`; `?type=` de documents validado contra el enum |
| Dashboard low-stock escaneaba todas las tablas de todos los tenants (filtro en JS) | ✅ Resuelto: tenancy movido al WHERE de Prisma (`product.companyId`, `warehouse.companyId`) en `server/src/routes/dashboard.routes.ts` |
| Índices faltantes en FKs calientes (DocumentItem, StockMovement, Payment, Client, Supplier, User, Role, Document) | ✅ Resuelto: 14 `@@index` añadidos en `server/prisma/schema.prisma` (schema validado con `prisma validate`). **Pendiente aplicar en la DB**: `cd server && npx prisma migrate dev --name add_fk_indexes` |
| Sin CI | ✅ Resuelto: `.github/workflows/ci.yml` — job frontend (lint + tests) y job server (type-check + tests con servicio MySQL + `db push` + seed) |
| `currency`/`exchangeRate` siempre USD al persistir documentos, ignorando la moneda de la empresa | ✅ Resuelto (tanda 2): **decisión del usuario — moneda canónica en pesos argentinos (ARS)**. Defaults de schema `Company.currency` y `Document.currency` → `"ARS"`; los creates de documentos (ventas, recepciones, pedidos públicos) ya no fuerzan USD. Nota: las empresas existentes creadas con otra moneda deben ajustarla en Settings → Empresa |
| Datos inventados en UI: KPIs de InventoryView, ReportsView (+18.4%), gráficos de Purchases/Pedidos, "v2.4.0 Enterprise Cloud" en sidebar | ✅ Resuelto (tanda 2): todos los números se computan de datos reales; donde no existía dato, el elemento se quitó (ver sección "Tanda 2" abajo) |
| Alta de producto: tasas de IVA hardcodeadas `[16,12,8,0]` → creación fallaba con tasas distintas | ✅ Resuelto: el selector usa el catálogo real de impuestos cargado en App ([`AddProductView.tsx`](../src/components/views/AddProductView.tsx)) y envía `taxId` directo |
| Alta de producto: descartaba Stock Inicial y Almacén Principal (producto nacía sin stock, silenciosamente) | ✅ Resuelto: `POST /api/products` acepta `stockInicial` + `warehouseId` (ambos o ninguno) y crea la fila `Stock` en la misma transacción (`server/src/routes/products.routes.ts`); el frontend los envía cuando corresponden |
| Proveedores: el frontend forzaba `email/phone/taxId = ''` pese a que el backend los devuelve | ✅ Resuelto: mapeo 1:1 en `src/App.tsx`, render con `?? ''` en `PurchasesView.tsx`, tipos ajustados en `src/types.ts` |
| Finanzas: todo status no-'Conciliado' se mostraba como "Completado" (mentira visual) | ✅ Resuelto: passthrough del status real del backend (`src/App.tsx`) |

### Pendientes ⏳ / requieren decisión ⚠️

| Hallazgo | Estado |
| --- | --- |
| Sin paginación en listas ilimitadas (documents/products/clients/suppliers/users) | ✅ Resuelto (2026-10-07) — `page`/`limit` ahora cortan a nivel de query (`skip`/`take`) con `total` = filas que matchean sin paginar; sin parámetros se conserva el array completo. Ver sección "Paginación real (2026-10-07)" |
| Scaffold de formulario repetido en 8 vistas (`FormScaffold` + `useSubmitFlow`, ~-250 líneas) | ⏳ Pendiente — refactor de UI con riesgo de regresión visual; tanda propia |
| `formatMoney`: 4 locales distintos + ~40 `toFixed` sueltos (el mismo monto se ve distinto según vista) | ✅ Verificado (2026-10-07) — formato unificado en `src/lib/format.ts` (`Intl.NumberFormat` es-AR, currency-aware, fallback RangeError), usado en ~25 vistas; 0 `toFixed` de dinero visible; MRR en USD y tienda con su moneda real. Ver sección "Formato monetario (2026-10-07)" |
| `parseBody` (zod-safeParse→400 repetido 15+ veces), CRUD factory clients/suppliers, line-math, doc-number padding, `getUserPermissions` reutilizable | ✅ Verificado (2026-10-07) — `parseBody` y `getUserPermissions` ya existen y se usan en todos los caminos; factory y line-math se **rechazan** por YAGNI/churn (ver sección "parseBody y simplificaciones (2026-10-07)") |
| -7 dependencias sin imports en el frontend (`lucide-react`, `motion`, `@google/genai`, `express`, `dotenv`, `autoprefixer`, `esbuild`) y rename de `"react-example"` | ✅ Verificado (2026-10-07) — ya removidas en `1ddaa68`; `express`/`dotenv` viven en `server/package.json` donde se usan; 0 imports en `src/`; nombre del paquete es `nexus-erp`; `esbuild` solo transitivo de Vite. Ver sección "Dependencias sin imports (2026-10-07)" |
| `loadAll` pide 3 endpoints (users/roles/audit) a todo usuario autenticado → banner de error para no-admins; navegación sin gating de permisos | ✅ Verificado (2026-10-07) — resuelto en `3d19ce2`: `loadAll` gatea cada fetch con `can(p, ...)` (el fetch salteado no es error), sidebar filtra cada ítem por `VIEW_PERMISSIONS` y una vista sin permiso muestra panel amigable en vez de tablas vacías. Ver sección "loadAll y gating de navegación (2026-10-07)" |
| Endpoints vivos sin UI: `/api/clients`, edit/delete de products/suppliers | ⏳ Pendiente — producto (¿traer las vistas o quitarlas de la API?) |
| `imageUrl` renderizado sin columna en el schema | ⏳ Pendiente — o se agrega el campo o se quita de la UI |
| Test de webhook MP con fixture grabado (body + firma reales) | ⚠️ Recomendado antes de depender de producción — hoy la suite ejerce el path con firmas sintéticas |
| `trust proxy 1` | ✅ Verificado por topología: la API corre en Railway tras exactamente un proxy TLS; no es un defecto en ese despliegue |
| Webhook `eventId` fallback `evt-${Date.now()}` rompe idempotencia si faltan ambos IDs | ⚠️ Menor — decidir si rechazar el evento en vez de inventar ID |
| Registro: `registerSchema` defaulteaba `USD` pese a moneda canónica ARS | ✅ Resuelto (Fase 0): default → `ARS` en `server/src/routes/auth.routes.ts` |
| Admin panel mostraba "26 empresas" hardcodeado | ✅ Resuelto (Fase 0): conteo real vía `/api/billing/admin/overview` (SuperAdmin) o 1 (admin regular) en `AdminView.tsx` |
| Compras ▸ 3 puntitos sin acción | ✅ Resuelto (Fase 0): menú con Ver/Editar/Duplicar/Anular en `PurchasesView.tsx` |
| POS catálogo: "carrito vacío" pequeño, 1 producto visible, scroll forzado | ✅ Resuelto (Fase 0): panel `min-h-[400px]`, grid `2→5` cols, cards compactas en `PosView.tsx` |
| POS checkout por método (Efectivo/Tarjeta/QR/Dividir) no funcional | ✅ Resuelto (Fase 0): `handleCheckout` por método — Efectivo con modal de monto vuelto, Tarjeta/QR mock, Dividir con modal multi-pago en `PosView.tsx` |

---

## 2. Incoherencias frontend ↔ backend

Todas las rutas que el frontend llama existen en el server; las incoherencias son semánticas o de shape. Estado tras esta tanda:

| Incoherencia | Estado |
| --- | --- |
| Alta de producto: tasa hardcodeada + stock descartado (bloqueaba creación) | ✅ Resuelto (ver §1) |
| Proveedores con campos vacíos forzados | ✅ Resuelto |
| Status de financiero mentiroso ("Completado" universal) | ✅ Resuelto |
| POS envía todo el carrito a UN warehouse (falla checkout multi-warehouse) | ⏳ Corregido en el diff local, sin publicar: `warehouseId` por línea dentro de la sucursal activa. Si una línea requiere sumar stock repartido entre depósitos, se bloquea con explicación; no se vende desde otro depósito sin evidencia de stock |
| Ajuste de stock: el motivo cargado en la vista no se envía (backend recibe "Ajuste manual desde el frontend") | ⏳ Pendiente (pasar `reason` en el payload) |
| Transferencias: la vista muestra stock total como máximo pero el backend exige stock en el origen | ⏳ Pendiente (mostrar stock por depósito en origen) |
| `PurchasesView` resumen de OC con IVA hardcodeado 16% (el total guardado difiere) | ⏳ Pendiente |
| Pedidos públicos nunca avanzan de estado ("Imprimir/Procesar" son `alert()` stubs) | ⏳ Pendiente (funcionalidad de flujo de pedidos) |
| Finanzas: FACTURA emitida a cliente cuenta como egreso (solo VENTA es ingreso) | ⏳ Pendiente (lógica de negocio) |
| `imageUrl` en tipos/UI sin columna en DB | ⏳ Pendiente |
| Chips de filtro de auditoría no cubren módulos que el backend sí loguea (Configuración, billing) | ⏳ Pendiente (cosmético) |
| Impuestos del sistema (companyId null) se ven editables en Settings pero el PATCH responde 403 | ⏳ Pendiente (ocultar/deshabilitar toggle) |
| `README.md` desactualizado (refiere a AI Studio/GEMINI, ignora `server/`; `clean` usa `rm -rf` inválido en Windows) | ⏳ Pendiente |

---

## 3. Duplicación y simplificación

Potencial medido: **~850-950 líneas menos y −7 dependencias** sin cambiar comportamiento.

| Duplicación | Estado |
| --- | --- |
| 8 vistas con scaffold de formulario (header, cards, panel de éxito, error, redirect) → `FormScaffold` + `useSubmitFlow` | ⏳ Pendiente |
| 9 `loadX` en `App.tsx` (~270 líneas) → un `loadResource(path)` | ⏳ Pendiente |
| Money formatting en 4 locales + ~40 `toFixed` → `formatMoney()` | ⏳ Decisión ARS tomada; helper en el diff local sin publicar, con USD explícito para MRR y moneda propia de la tienda. Falta verificar cobertura de todas las vistas |
| `clients.routes.ts` y `suppliers.routes.ts` estructuralmente idénticos → CRUD factory | ⏳ Pendiente |
| `safeParse`→400 repetido 15+ veces → `parseBody()` | ⏳ Pendiente |
| Line-math de items en 5 vistas y 3 handlers; doc-number `padStart(4,'0')` en 10+ sitios; side-effects de stock en 3 handlers | ⏳ Pendiente (helpers compartidos) |
| Flatten de permisos en 3 lugares (ya existe `getUserPermissions`) | ⏳ Pendiente |
| Header con 19 botones hardcodeados vs `navItems` del Sidebar (una sola fuente) | ✅ Resuelto (2026-10-07) — `src/lib/navigation.ts` es la única fuente (`NAV_SECTIONS`/`ADMIN_SECTIONS`/`QUICK_NAV_ITEMS`); el quick-nav del Header consume el registro y gatea por `VIEW_PERMISSIONS`. Ver sección "Navegación única (2026-10-07)" |
| Carrito mobile + summary duplicados en POS y PublicClientStore | ⏳ Pendiente |
| Dependencias sin imports (`lucide-react`, `motion`, `@google/genai`, `express`, `dotenv`, `autoprefixer`, `esbuild`) | ✅ Verificado (2026-10-07) — misma conclusión que la fila anterior; `vite` ya está en `devDependencies` y el lock root no tiene entradas top-level de ninguna de las 7 |

---

## Comandos pendientes para el mantenedor

```bash
# ✅ RESUELTO 2026-09-19 (verificado contra information_schema local):
# - currency defaults ARS en empresas y comprobantes
# - los 14 índices FK presentes (clientes, comprobantes×3, items, movimientos×4, pagos×2, proveedores, roles, usuarios×2)
# - branchId nullable en usuarios
# Ya no hace falta correr ninguna migración local.
```

## Deploy Railway (estado 2026-09-19)

- Auto-deploy GitHub caído ("Could not load branches") → backend a producción sale SOLO por `railway up` desde la raíz. Frontend (Vercel) sí auto-deploya `main`.
- 2026-09-19: en GitHub → Settings → Applications el dueño ve solo VERCEL. Normal si miraba la pestaña OAuth Apps: Vercel es OAuth App, Railway es GitHub App y vive en la pestaña **Installed GitHub Apps**. Si ahí tampoco está → instalarla desde Railway (avatar → Account Settings → Integrations → GitHub → Connect, autorizar e incluir el repo), luego Retry en el servicio.
- 2026-09-19: confirmado que solo existe la OAuth App "Railway App" (botón Revoke = solo login, no tocar). La GitHub App NO está instalada → instalar desde Railway como arriba.
- 2026-09-19 (corrección del dueño): GitHub SÍ estaba conectado y Railway SÍ aparecía; lo que no aparece es el botón Configure. Diagnóstico "no instalada" posiblemente erróneo — pendiente captura de pantalla exacta para no seguir adivinando. Deploy por CLI (`railway up`) funciona y no depende de esto.
- 2026-09-19 (aclaración final del dueño): Installed GitHub Apps → Railway aparece, sin botón Configure ni en lista ni adentro. Explicación: al hacer click en Railway YA se está en la pantalla de configuración (Repository access + Save); no hay un segundo botón Configure adentro. Acción: elegir All/Select repositories + Save, luego Retry en Railway.
- 2026-09-19 (estado final confirmado): en **Installed GitHub Apps solo está Vercel** (sin Railway); en **Authorized OAuth Apps sí está Railway App** (solo login, con Revoke). Conclusión definitiva: la GitHub App de Railway **no está instalada** en la cuenta → no hay Configure posible. Fix: instalar desde Railway (avatar → Account Settings → Integrations → GitHub → Connect, autorizar e incluir el repo), luego Retry en el servicio. La referencia vieja al repo en el servicio es residual de una instalación anterior.
- 2026-09-19 (corrección: la cuenta SÍ está conectada — "Connected as 25112001alan-a11y" + link "Configure repo access" en Integrations). Acción real: click en **Configure repo access** → incluir `ERP-WEB-FINAL-GIGLI` → Save → Retry en el servicio. Conexión de cuenta ≠ acceso al repo; ese link es el que otorga el acceso.
- 2026-09-19 (resuelto): el servicio muestra **"Auto deploys when pushed to GitHub"** (antes: "Auto deploy unavailable"). Integración restaurada vía Configure repo access. Verificación pendiente: próximo push debe disparar deploy solo.
- 2026-09-19 (verificado por el dueño): apareció el deploy automático tras el push. **Auto-deploy restaurado y funcionando.** Deploys: frontend por Vercel solo, backend por Railway solo. `railway up` queda como plan B.
- Botón Disconnect bloqueado: irrelevante, no se necesita.
- NO actualizar MySQL 9.4 → 9.7.2 hasta cerrar el trabajo activo.

---

## Tanda 2 — decisiones y datos reales (2026-09-19)

### Decisiones de producto tomadas por el dueño

- **Moneda canónica: peso argentino (ARS).** Backend: defaults `ARS` en el schema; los creates de documentos ya no fuerzan USD. Frontend: montos muestran `$` que ahora representan ARS; el helper `formatMoney` (es-AR/ARS) queda habilitado para la tanda de duplicación.

### Datos inventados → datos reales

| Vista | Antes (falso) | Ahora (real) |
| --- | --- | --- |
| InventoryView | KPIs "Depósito Central 14.250 unidades", selector de depósito decorativo que vaciaba la tabla, `warehouse: ''` siempre | KPIs computados del stock real por depósito (unidades + InStock/LowStock/OutOfStock), selector que filtra por `stocks[].warehouseId` real; `Product.stocks` expuesto por el mapper; categorías desde el catálogo real; se quitaron `more_vert` muerto y paginación falsa |
| ReportsView | "+18.4% vs período anterior", selector de período que no filtraba, gráfico con `max=1000` falso, "Mayor Rotación" = slice sin orden, PDF = `setTimeout` + `alert` | Selector 7d/30d/90d/año FILTRA las ventas reales por `createdAt`; "Ventas Totales" y "Ticket Promedio" del período; delta real vs. período anterior igual (badge oculto sin datos previos); "Mayor Rotación" → "Productos con Menor Stock" ordenado por stock real; gráfico por categorías reales; **botón de PDF eliminado** (prometía y no exportaba) |
| PurchasesView | "Equipos (80%)/Insumos (45%)" hardcodeado | "Gastos por Proveedor" con totales reales de las compras (orders), alturas como % del máximo real; empty state |
| PublicOrdersView | "+12% vs ayer", barras semanales hardcodeadas, chip "Hoy" falso en Enviados | "+X% vs ayer" computado de pedidos reales (hoy vs ayer, badge oculto si ayer fue 0); barras = pedidos reales por día de los últimos 7 días; "Hoy" solo en la barra real |
| Sidebar | "v2.4.0 • Enterprise Cloud" literales, "En línea" sin verificación | Línea de versión/edición eliminada; "En línea" real vía `apiFetch('/api/health')` al montar (En línea / Sin conexión / Verificando), sin polling |

### Registro de commits (tanda 2)

```text
fbb99d9 feat(server): moneda canonica en pesos argentinos (ARS)
7e10ad4 feat(front): reemplazar datos inventados por metricas reales
```

---

## Fase 0 — quick wins (2026-09-19)

### Qué se hizo

| Área | Antes | Ahora |
| --- | --- | --- |
| Compras ▸ 3 puntitos | Botón `more_vert` sin `onClick` | Menú accesible (overlay + ESC/click-outside) con Ver / Editar (si no pagado) / Duplicar (POST OC) / Anular (si no pagado/recibido) |
| POS catálogo | Panel chico, 1 producto visible, scroll forzado | `min-h-[400px]`, grid `2→5` cols, cards `p-sm` + `line-clamp-2`, pills con scroll horizontal |
| POS checkout | `handleCheckout` incompleto | Efectivo → modal monto recibido + vuelto → `onCompleteSale`; Tarjeta/QR → mock VENTA Pagado; Dividir Pago → modal multi-fila con validación de suma |
| Admin panel | "26 empresas" hardcodeado | Conteo real: SuperAdmin vía `overview.totals.companies`, regular → `1` |
| Registro | `registerSchema` default `USD` | Default `ARS` coherente con moneda canónica |
| Auth arquitectura | Propuesta "1 email + passwords por rol" | Decisión: **Opción A** — modelo estándar (1 user = 1 email + 1 password + roles), selector de sucursal en UI (Fase 1) |

### Registro de commits (Fase 0)

```text
343b071 feat: Fase 0 - menu Compras, catalogo y checkout POS, admin real y registro ARS
```

---

## Fase 1 — selector de sucursal (2026-09-19)

### Decisión de arquitectura auth (confirmada por el dueño)

**Opción A — modelo estándar**: 1 usuario = 1 email + 1 password + N roles. Cada persona tiene su cuenta propia. Se descarta la propuesta "1 email compartido + passwords por rol/persona" (anti-patrón: rompe recovery, auditoría, 2FA/SSO, compliance).

### Qué se hizo

| Área | Antes | Ahora |
| --- | --- | --- |
| Selector de sucursal | No existía | Dropdown en Header (icono `store`, solo si hay sucursales) + opción "Todas"; persistencia per-company en `localStorage nexus:activeBranchId:<companyId>` |
| Filtro por sucursal | Tablas mostraban todo mezclado | InventoryView (cards, tabla, dropdown de depósitos, badges) y PosView (grilla, disponibilidad, `allowOversell` respetado) filtran por `warehouseId ∈ sucursal`; chip con X para limpiar; POS vende desde depósito de la sucursal activa |
| Backend | `GET /api/stock/warehouses` no traía nombre de sucursal | Mismo endpoint ahora hace `include: { branch: { id, name } }`. Cero cambios de schema, cero endpoints nuevos |
| Lógica compartida | — | Nuevo `src/lib/branch.ts` (`deriveBranches`, `warehouseIdsForBranch`, `branchStock`) + `branch.test.ts` (5 tests) |
| Tipos | `WarehouseOption` sin sucursal | Suma `branchId?`/`branch?` opcionales + nuevo `BranchOption` (cero breakage) |

### Pendiente (anotado por el implementador, no bloquea)

- Filtro por sucursal en Ventas (`toFrontSale` descarta `branchId` — hay que propagarlo) y en reportes/dashboard.

### Registro de commits (Fase 1)

```text
dd6e785 feat: Fase 1 - selector de sucursal con filtro de stock y ventas
```

### Verificación

`npm run lint` ✓ · `npm test` (19 passed, 2 files) ✓ · `npm run build` ✓ · `server build` ✓

---

## Fix sucursales — POS exige sucursal, usuarios fijados (2026-09-19)

### Problema (reportado por el dueño)

POS operaba con sucursal "TODAS" (una venta ocurre en UN punto físico) y cualquier usuario cambiaba de sucursal libremente.

### Qué se hizo

| Área | Antes | Ahora |
| --- | --- | --- |
| Modelo | `User` sin sucursal | `User.branchId Int?` + FK (`ON DELETE SET NULL`) + índice; migración `20260921194109_user_branch_lock` aplicada. `null` = dueño/all-access, set = fijado |
| Backend | — | `GET /me` devuelve `branchId`, `isOwner`, `allowedBranches`; `POST /users` acepta `branchId` (403 si no sos Super Admin); `PATCH /users/:id/branch` (Super Admin, con audit) |
| Header | Todos cambiaban de sucursal | Fijado → badge sin dropdown; dueño → selector con "Todas" |
| POS | Vendía en "TODAS" | Sin sucursal → prompt bloqueante "Seleccioná la sucursal del punto de venta"; grid y checkout deshabilitados hasta elegir; venta solo desde depósitos de la sucursal activa |
| Alta de usuarios | Sin sucursal | `NewUserView` con picker opcional de sucursal |
| Cuentas existentes | — | Intactas (`branchId null` = all-access, incluida `ana.silva@empresa.com`) |

### Registro de commits

```text
b58449c feat: bloquear usuarios a su sucursal, POS exige sucursal especifica
```

### Verificación

`npm run lint` ✓ · `npm test` (19) ✓ · `npm run build` ✓ · `server build` ✓ · `server test` (33 pass, 1 skip) ✓ · `prisma validate` ✓

---

## Seed demo AR — 3 empresas coherentes (2026-09-19)

Archivo: `server/prisma/seed-ar-demo.ts` (no toca `seed.ts`; re-corridas idempotentes). Ejecutar con `npm run prisma:seed:ar` desde `server/`.

| Empresa | Rubro | Branches | Productos | Cuentas demo (password `password123` — solo demo) |
| --- | --- | --- | --- | --- |
| Lo de Marta | Kiosco | Casa Central, Suc. Estación | 20 (caramelos, alfajores, gaseosas…; IVA 21/10.5/Exento) | `dueno@lodemarta.test` (Super Admin, todo) · `marta@lodemarta.test` (Encargado, Casa Central) · `cajero@lodemarta.test` (Cajero, Suc. Estación) |
| TecnoSur | Electrónica | Casa Central, Suc. Shopping | 18 (notebooks, celulares, accesorios — nada de comida) | `dueno@tecnosur.test` (Super Admin) · `jefe@tecnosur.test` (Encargado, Casa Central) · `ventas@tecnosur.test` (Vendedor, Suc. Shopping) |
| El Tornillo | Ferretería | Casa Central, Suc. Ruta | 18 (herramientas, tornillería, pinturas) | `dueno@eltornillo.test` (Super Admin) · `capataz@eltornillo.test` (Encargado, Casa Central) · `mostrador@eltornillo.test` (Vendedor, Suc. Ruta) |

Cada empresa: stock con mínimos (varios bajo mínimo para probar low-stock), 5-7 clientes, 3-5 proveedores, 1 VENTA + 1 COMPRA recientes. Todo ARS. Nota: los documentos semilla NO mueven stock (para no alterar el low-stock armado).

### Registro de commits

```text
c9bdb08 feat: seed demo con 3 empresas argentinas coherentes y cuentas por rol
```

---

## Fase 2 — roles custom + Permisos global (2026-09-19)

### Qué se hizo

**Backend** (`server/src/routes/users.routes.ts`):
- `GET /api/users/roles` (extendido) — roles del tenant con `permissions[]`, `permissionCount`, `userCount`
- `GET /api/users/permissions` (nuevo) — catálogo GLOBAL (`usuarios.leer`)
- `POST /api/users/roles` — crea rol con nombre libre (2-50) + `permissionNames[]` validados contra el catálogo (400 desconocido, 409 nombre duplicado); transacción + audit; 201
- `PATCH /api/users/roles/:id` — rename + reemplazo de set; Super Admin no renombrable y con set completo obligatorio (400); 409/404 según caso
- `DELETE /api/users/roles/:id` — 400 si Super Admin, 409 si tiene usuarios, 204 + audit

**Frontend** (`AdminView.tsx`): cards "Roles y Permisos" eliminadas. Tabs: Usuarios / **Roles (n)** (tabla + modal crear/editar con checkboxes agrupados por módulo + eliminar con confirm) / **Permisos (n)** (lista solo-lectura del catálogo global agrupada + nota) / Facturación. Gestión visible solo con `usuarios.escribir`. Nombres de rol libres por empresa; permisos siempre del catálogo global.

### Registro de commits

```text
5677f0e feat: Fase 2 - roles personalizados por empresa y seccion Permisos global
```

### Verificación

`npm run lint` ✓ · `npm test` (19) ✓ · `npm run build` ✓ · `server build` ✓ · `server test` (33 pass, 1 skip) ✓

---

## Aislamiento admin de plataforma (2026-09-19) — CRÍTICO resuelto

### Problema (reportado por el dueño)

El dueño de cada empresa (rol Super Admin) veía el panel de administración de Nexus con datos de OTRAS empresas (cantidad de empresas, MRR, lista de no suscriptas). Dueño de empresa ≠ administrador de Nexus.

### Qué se hizo

| Área | Antes | Ahora |
| --- | --- | --- |
| Permiso plataforma | `billing.manage` otorgado a todo dueño en el registro | Nuevo `PLATFORM_ONLY_PERMISSIONS = ['billing.manage']` (`middleware/auth.ts`); el registro lo excluye del rol Super Admin del dueño. `billing.leer` lo conservan (verificado: no filtra nada cross-tenant) |
| Catálogo de permisos | Todos veían todo | `GET /permissions` oculta permisos plataforma a quien no los tiene |
| Roles custom (Fase 2) | Un dueño podía auto-otorgarse `billing.manage` | `POST/PATCH /roles` → 400 ante auto-otorgamiento; invariante Super Admin corregido (set completo = no-plataforma + extras) |
| Seed demo | Dueños demo con catálogo completo | `OWNER_PERMS` sin `billing.manage`; DB local reconciliada: **39 filas eliminadas** en tenants no-plataforma, 0 restantes, `ana.silva@empresa.com` intacta |
| Endpoint overview | Gate por permiso que todos tenían | Sin cambios — el gate ahora es significativo |
| Frontend | — | Sin cambios necesarios (verificado): el conteo cae a 1 ante 403 y la tab Facturación desaparece sin el permiso |
| Tests | — | Nuevo `server/test/platform-permissions.test.ts` (5 tests de regresión) |

Verificado en vivo: `dueno@lodemarta.test` → `GET /api/billing/admin/overview` → **403**; `ana.silva@empresa.com` → **200**.

### Registro de commits

```text
3bdae00 fix(server): aislar admin de plataforma, billing.manage solo para Nexus
```

---

## Modal compartida (2026-09-19)

### Hallazgo honesto

No existe modal de crear/editar usuario: la creación es la página `NewUserView` (`max-w-[672px]`, correcto) y los modales de `AdminView` ya estaban centrados. El aplastamiento reportado no reproduce desde código — si lo ves en un punto concreto, pasame la pantalla exacta y lo miro.

### Qué se hizo (corta la clase de bug de raíz)

- Nueva primitiva `src/components/Modal.tsx` (~45 líneas: overlay + panel centrado, prop `maxWidth`, cierre con ESC/click-outside).
- Modales de crear/editar rol y confirmación de borrado migrados a ella (mismo texto y estilo). Resto de shells intactos.

### Registro de commits

```text
5ab4329 fix(front): primitiva Modal compartida y migracion de modales de roles
```

### Verificación

`npm run lint` ✓ · `npm test` (19) ✓ · `npm run build` ✓ · `server build` ✓ · `server test` (38 pass, 1 skip — 5 tests nuevos) ✓

---

## Fix sistémico de modales (2026-09-19)

### Causa raíz (encontrada al revisar "agregar nuevo rol")

Todos los modales usaban `flex items-center justify-center` en el overlay. Con contenido alto (el modal de roles tiene ~9 grupos de permisos y supera el viewport), el panel centrado se recorta arriba y abajo y se ve "aplastado al centro". No era el ancho — era el centrado vertical con overflow.

### Qué se hizo

Patrón de centrado `m-auto` en los 5 shells (centra cuando entra, scrollea desde arriba cuando no):
- `src/components/Modal.tsx` (primitiva: overlay `flex` + `overflow-y-auto`, panel con `m-auto`)
- `AdminView` roles/borrar (vía primitiva, ya aplicado)
- `PurchasesView` nuevo proveedor, `PosView` efectivo/dividir, `SupplierVoucherModal` (mismo patrón in-place, contenido intacto)

Regla: todo modal nuevo usa `<Modal>` o el patrón `m-auto`; `items-center` queda prohibido en overlays.

### Registro de commits

```text
cf7726d fix(front): centrado m-auto en modales, fin del aplastamiento sistemico
```

### Verificación

`npm run lint` ✓ · `npm test` (19) ✓ · `npm run build` ✓ (solo clases, sin cambios de lógica)

---

## Push remoto + rutas por empresa (2026-09-19)

### Push (deuda operativa saldada)

25 commits estaban solo locales — Vercel/Railway despliegan desde `main`, así que nada era visible. Push realizado (`37ffacb..eab705e`). **Regla desde ahora: pushear al cerrar cada tanda.** Si el modal de roles sigue viéndose aplastado tras el redeploy de Vercel (tarda unos minutos + hard-refresh), avisar con captura: el código ya tiene el fix `m-auto`.

### Rutas por empresa — `/t/:slug`

Hallazgo: el backend YA estaba por slug (`GET/POST /api/public/store/:slug/...`); el hueco era solo la entrada del frontend.

| Área | Antes | Ahora |
| --- | --- | --- |
| Entrada directa | Solo con sesión o portal genérico | `/t/:slug` bootea directo en el portal de ESA empresa, sin login (parseo de pathname al boot, sin react-router) |
| Slug desconocido | Catálogo vacío | Vista "Tienda no encontrada" |
| Pedido anónimo | Navegaba a vista con sesión | Se queda en la tienda (solo con sesión va a `pedidos-publicos`) |
| Moneda | No se mostraba | Visible en el storefront (+ `currency` en payload compañía) |
| Settings | Prefijo `/tienda/` (incorrecto) | Prefijo `/t/` + botón "Copiar enlace" + "Ver mi tienda pública" |
| Deploy | — | Verificado: `vercel.json` ya reescribe `/(.*) → /index.html` (deep links funcionan) |

Aislamiento verificado en DB dev: tenant nuevo ve catálogo vacío, pedido con producto ajeno rechazado, lookup por email con scope. Esto desbloquea el portal público multi-tenant (#12 de la lista del dueño).

### Registro de commits

```text
8b9d672 feat: rutas publicas por empresa con slug y entrada directa /t/:slug
```

### Verificación

`npm run lint` ✓ · `npm test` (19) ✓ · `npm run build` ✓ · `server build` ✓ · `server test` (38 pass, 1 skip) ✓

---

## Causa raíz modales: colisión de tokens spacing (2026-09-19)

### El bug real (el fix `m-auto` no alcanzaba)

El `@theme` de `src/index.css` define `--spacing-xs/sm/md/lg/xl/2xl` propios (0.25–3rem para `p-md`, `gap-sm`, etc.). Tailwind v4 resuelve `max-w-2xl` contra esa escala en vez de los contenedores: el CSS compilado decía literalmente `.max-w-2xl{max-width:var(--spacing-2xl)}` = **48px**. El modal de roles medía 48px, el de borrar 16px, los de POS 8–16px. Verificado en `dist/assets/*.css`, no adivinado.

### Qué se hizo

Reemplazo por valores arbitrarios (inmunes a la colisión, equivalen a los defaults de Tailwind) en los 8 usos afectados:
- `max-w-2xl` → `max-w-[42rem]` (Modal roles, default de la primitiva)
- `max-w-md` → `max-w-[28rem]` (Modal borrar, split POS, 2 párrafos)
- `max-w-sm` → `max-w-[24rem]` (efectivo POS)
- Regla: en anchos NUNCA usar `max-w-{xs,sm,md,lg,xl,2xl}` pelados; siempre arbitrarios. El sistema `p-md/gap-sm/space-y-*` sigue intacto.

### Registro de commits

```text
83f34d9 fix(front): anchos reales en modales, colision de tokens spacing resuelta
```

### Verificación

CSS compilado con 42/28/24rem ✓ · `npm run lint` ✓ · `npm test` (19) ✓ · `npm run build` ✓

---

## Lote POS: QR + pagos reales (2026-09-19)

### Scanner (PosView, botón junto al buscador)

| Modo | Cómo funciona |
| --- | --- |
| Cámara | `BarcodeDetector` nativo + `getUserMedia` (cámara trasera), cero dependencias; una lectura por activación; stream cortado al cerrar (sin cámaras zombie); fallback con mensaje si no hay soporte/permiso |
| Pistola HID | Input con `autoFocus` donde la pistola escribe y cierra con Enter (actúa como teclado) |
| Lookup | Client-side sobre productos en memoria: `barcode` exacto → `sku` exacto → nombre contiene; `barcode` expuesto por el mapper (el backend ya lo devolvía, se descartaba); no encontrado → error inline, sin `alert()` |

### Pagos reales contra backend

- `POST /api/documents` acepta `payments?: [{ method: 'Efectivo'\|'Tarjeta'\|'QR / Transf.', amount }]` (máx 10); suma ≠ total → 400; crea N filas `Payment` en `Pagado`. Sin el array, el comportamiento legacy queda intacto.
- Efectivo (modal monto + vuelto), Tarjeta, QR/Transf. y Dividir (multi-fila validada client + server) ahora persisten pagos reales. Botón normalizado `'Tarjeta Crédito'` → `'Tarjeta'`.
- Mock restante: únicamente Mercado Pago online (Fase E).

### Registro de commits

```text
fad1ae9 feat(pos): lector QR camara+HID y pagos reales contra backend
```

### Verificación

`npm run lint` ✓ · `npm test` (19) ✓ · `npm run build` ✓ · `server build` ✓ · `server test` (40 pass — 2 tests nuevos de pagos — 1 skip) ✓

---

## Seed AR en boot de producción (2026-09-19)

### Problema

Las 9 cuentas demo solo existían en MySQL local. En la web (Railway) no se podía entrar con ellas.

### Qué se hizo

- `server/src/bootstrap.ts` (`runDemoSeed`): además del seed incremental, ejecuta `prisma/seed-ar-demo.ts` — bajo el flag existente `RUN_DEMO_SEED=true`, idempotente, seguro en cada boot.
- En Railway, el boot ya aplica migraciones pendientes (`migrate deploy`): al redeplear entran `user_branch_lock`, índices FK y defaults ARS.
- API de producción verificada en vivo: `GET /api/health` → `{"status":"ok"}`.

### Condición (verificado por el dueño en Railway)

- `RUN_DEMO_SEED=true` ya existía desde antes ✅ (nada que agregar).
- Pero el flag solo no alcanzaba: el código en producción era anterior al cableado del seed AR, así que cada boot corría solo el incremental. Además el auto-deploy GitHub está caído ("Could not load branches") → los pushes no llegaban.
- Camino adoptado: deploy manual con Railway CLI (`railway up` desde la raíz; desde `server/` falla porque el Root Directory `/server` no existe en el fuente subido). Al bootear el deploy nuevo: migraciones + incremental + AR corren solos.
- Probar login en https://erp-web-final-gigli.vercel.app con `dueno@lodemarta.test` / `password123`.

### Registro de commits

```text
d304543 feat(server): seed AR demo tambien en boot con RUN_DEMO_SEED
8520745 fix(seed): cuentas demo .test siempre con password123 y reconciliacion
```

### Incidente: login demo fallaba en producción (resuelto)

- Síntoma: seed AR corría en prod con `+0` en todo pero `dueno@lodemarta.test` / `password123` → 401.
- Causa: `PASSWORD = ADMIN_PASSWORD ?? 'password123'` — en Railway `ADMIN_PASSWORD` existe, así que las 9 cuentas se hashearon con tu ADMIN_PASSWORD (un auto-deploy anterior las había creado antes de caerse la conexión GitHub).
- Fix: cuentas `.test` (RFC-reservadas, nunca reales) siempre con `password123` fijo + reconciliación en cada corrida (resetea hash + rol faltante solo en esas). Tradeoff explícito: quien adivine `*@*.test` + `password123` entra a tenants demo (datos falsos, aislados, sin permisos plataforma).
- Reparación: `railway run` NO sirve (el `DATABASE_URL` de Railway usa `mysql.railway.internal`, solo resuelve dentro de su red). Camino usado: redeploy con `railway up` desde la raíz → boot reparó solo (`users +9`).
- **Cierre verificado 2026-09-19**: login en producción `dueno@lodemarta.test` / `password123` → **200 OK** (`Kiosco Lo de Marta`, moneda ARS). ✅ Cerrado.

### Verificación

`server build` ✓ · health prod `200 {"status":"ok"}` ✓ · seed AR en prod pendiente de redeploy + flag (verificar con login)
- Front web verificado en vivo: bundle `index-DPaROJDI.js` contiene `BarcodeDetector` + storefront `/t/:slug` + `payments` → el QR y pagos reales están desplegados en https://erp-web-final-gigli.vercel.app (HTTPS, apto para cámara en el celu)

---

## Gating frontend por permisos (2026-09-19)

### Reporte (dueño, todas las cuentas)

Banner eterno "Algunos datos no se pudieron cargar" + todas las cuentas navegaban todo. Causa: `loadAll` pedía endpoints admin a todo el mundo (403 → banner) y Sidebar/App renderizaban sin mirar permisos. El backend siempre negó bien (fail-closed) — era solo ruido UX, no fuga.

### Qué se hizo (solo frontend, `3d19ce2`, por pushear)

- `loadAll` salta cada fetch sin permiso (`usuarios.leer` → users/roles, `auditoria.leer` → logs); el banner solo salta ante fallos reales.
- Sidebar filtra por permiso (misma tabla que los guards del backend); dashboard siempre visible; branch/health/usuario intactos.
- Guard central: vista sin permiso → panel "No tenés permiso para ver esta sección" con botón al Dashboard.
- Helper `can()` + tabla `VIEW_PERMISSIONS` en `auth.tsx`.
- Matriz: Super Admin todo igual sin banner; Encargado sin Usuarios/Roles/Admin/Auditoría/Config; Cajero solo Dashboard/Inventario/POS/Ventas/Pedidos sin banner.

### Verificación

`npm run lint` ✓ · `npm test` (19) ✓ · `npm run build` ✓

---

## Fix: productos invisibles por warehouses mal gateados (2026-09-19)

### Reporte (dueño)

"No se ven los productos" tras el gating por permisos.

### Causa (verificada empíricamente, no adivinada)

1. Datos OK: script Prisma temporal confirmó roles y permisos correctos (cajero 3, encargado 8, dueño 15, ana 16).
2. Backend OK: login + `/me` + `GET /api/products` como cajero → 20 productos con stock.
3. Bug real en frontend: `warehouses` se cargaba solo dentro de `loadPurchases` (gateado a `compras.leer`), pero lo consumen vistas de inventario. Cajero/Vendedor (sin `compras.leer`) quedaban con `warehouses = []` → `warehouseIdsForBranch([], sucursal)` = set vacío → tabla filtrada a cero. Productos invisibles.

### Qué se hizo (`ec4ce09`)

- `loadPurchases` vuelve a proveedores + documentos únicamente.
- Nuevo `loadWarehouses` gateado a `inventario.leer` (igual que el endpoint `/api/stock/warehouses`), sumado al `loadAll` + deps.
- Limpieza: eliminado script temporal de verificación.

### Verificación

`npm run lint` ✓ · `npm test` (19) ✓ · `npm run build` ✓ · cadena backend como cajero verificada a mano (login/permisos/20 productos con stock) ✓
- **Confirmado en campo por el dueño**: productos visibles de nuevo. ✅ Cerrado.
- Nota: `REMITO`/`FACTURA` siguen cargándose dentro de `loadPurchases` (compras) y `loadSales` (ventas) por separado — un usuario solo-ventas no ve FACTURAs en Ventas. Granularidad fina pendiente, no bloquea.

---

## Facturas por dirección: Ventas vs Compras (2026-09-19)

### Problema

Todas las FACTURAs se cargaban solo en `loadPurchases` (compras): un usuario solo-ventas jamás veía una factura de venta.

### Qué se hizo (`3b16b87`, solo `App.tsx`)

- `loadSales` suma `GET ?type=FACTURA` (el backend acepta `ventas.leer OR compras.leer`, verificado 200 como solo-ventas): facturas **con cliente** → lista de Ventas (vía `toFrontSale`, ya soportado por tests); `salesDocs` las incluye como documentos origen.
- `loadPurchases` filtra el merge a facturas **sin cliente** → Compras. Sin pérdida (las de nadie quedan en Compras) y sin duplicación entre vistas.
- Sin cambios de gates (ambos loaders ya eran OR) ni de backend.

### Verificación

`npm run lint` ✓ · `npm test` (19, incluye mapper de FACTURA) ✓ · `npm run build` ✓ · `GET ?type=FACTURA` como `ventas@tecnosur.test` → 200 ✓

---

## Pedidos hechos invisibles (2026-09-19) — no era bug de creación

### Reporte (dueño)

"No aparecen los pedidos hechos."

### Causa (verificada empíricamente)

1. DB: 2 PEDIDOs `Abierto` recién creados en lo-de-marta (los tests del dueño).
2. API como dueño: `GET /api/documents?type=PEDIDO` → los 2. API como `ana.silva` (otra empresa): 0 — tenancy correcto.
3. Conclusión: creación y scope perfectos. Causas posibles del lado visible: cuenta de otra empresa (ana ve 0 por diseño) o vista cargada antes del pedido (sin re-fetch).

### Qué se hizo (`511b2d1`)

- Re-fetch de pedidos públicos al entrar a la vista (gateado a `ventas/compras.leer`): pedidos hechos con la pestaña abierta aparecen solos.

### Verificación

`npm run lint` ✓ · `npm test` (19) ✓ · `npm run build` ✓ · API como dueño trae 2/2, como ana 0/0 ✓
- 2026-09-19: localhost tiene 2 PEDIDOs (tests del dueño), **producción tiene 0**. Localhost y web son DBs distintas: lo creado en una no aparece en la otra. Si no se ve nada, verificar primero en qué ambiente se creó vs. en cuál se mira.

---

## Seguimiento por WhatsApp (2026-09-19, reemplaza email)

### Decisión (dueño)

El seguimiento por email no hace falta; el seguimiento es por WhatsApp. Se elimina el tracking por email.

### Qué se hizo

- Tienda: fuera la card "Seguí tu pedido" + estados/handlers muertos; email del checkout queda (find-or-create) como opcional; éxito muestra n° de pedido + **"Enviar pedido por WhatsApp"** (`wa.me/?text=` modo share, cliente elige el chat; texto con tienda, n° y total); auto-dismiss eliminado (hacía inusable el botón) + "Hacer otro pedido".
- Dueño: botón `chat` por fila en Pedidos Públicos → `wa.me/<dígitos>?text=` con mensaje de estado; solo si teléfono ≥8 dígitos (sin inventar código país); tienda vía sesión.
- Backend (`ccca886`): `phone` agregado al select de cliente del listado (ya existía en Prisma y en el detalle; sin schema).

### Registro de commits

```text
ccca886 feat(server): incluir telefono del cliente en listado de documentos
92775c2 feat(front): seguimiento por WhatsApp en lugar de email
```

### Verificación

`npm run lint` ✓ · `npm test` (19) ✓ · `npm run build` ✓ · `server build` ✓ · `server test` (41 pass, 1 skip) ✓
- Nota histórica: `GET /store/:slug/orders?email=` seguía en backend sin llamadas; retirado en el lote local del 2026-09-23 (ver «Reanudación del lote interrumpido»).

---

## Fix lector: formatos 1D + marco de apuntado (2026-09-19)

### Reporte de campo (dueño, 3 dispositivos)

Cámara abría pero no detectaba códigos de barras; QR sí (con "código no encontrado" = pipeline OK).

### Causa

`new BarcodeDetector({ formats: ['qr_code'] })` — los 1D de productos reales (EAN-13/8, UPC, Code128) eran invisibles.

### Qué se hizo (`PosView.tsx`)

- 11 formatos candidatos (qr + ean_13/8, upc_a/e, code_128/39, itf, codabar, data_matrix, aztec) filtrados por `getSupportedFormats()` del navegador (Safari trae menos; sin el guard, el constructor revienta).
- Marco de apuntado sobre el video ("Apuntá el código dentro del marco") — antes no había feedback visual de dónde apuntar.

### Registro de commits

```text
8afdb26 fix(pos): lector con formatos 1D y marco de apuntado
```

### Verificación

`npm run lint` ✓ · `npm test` (19) ✓ · `npm run build` ✓ · pusheado (Vercel redeploya solo)

---

## Fix cámara: alta resolución + foco continuo (2026-09-19)

### Reporte de campo (dueño, 3 dispositivos)

Barras dentro del marco, la cámara nativa las lee, la web no. QR sí.

### Causa

Stream pedido sin resolución (muchos móviles negocian 640×480) y sin foco continuo: los módulos grandes del QR decodifican igual, las barras finas del EAN-13 no. La app nativa usa full-res + autofocus.

### Qué se hizo (`PosView.tsx`, `4a8d197`, pusheado)

- `getUserMedia` con `width/height: ideal 1920×1080`.
- `applyConstraints({ advanced: [{ focusMode: 'continuous' }] })` en try/catch (si el navegador no lo soporta, se sigue con foco por defecto).
- Si algún dispositivo sigue sin leer 1D (p. ej. iPhone con `BarcodeDetector` solo-QR), el paso siguiente es decodificador JS (ZXing) como fallback — avisar con modelo y versión iOS/Android.

### Verificación

`npm run lint` ✓ · `npm test` (19) ✓ · `npm run build` ✓
- **Confirmado en campo por el dueño (3 dispositivos)**: barras detectadas tras el fix. ✅ Cerrado.

### Tanda 1 — commits por unidades de trabajo

```text
6ef47d7 docs: informe de auditoria y roadmap actualizados
cf9d42f ci: automatizar verificaciones con GitHub Actions
c530364 fix(front): alta de productos, proveedores y finanzas coherentes con el backend
e735abd feat(server): indices FK para las consultas calientes
3b51f31 feat(server): soportar stock inicial al crear productos
01061aa fix(server): acotar el low-stock del dashboard al tenant
1d4af04 fix(server): ajuste de stock atomico con guarda de no-negativo
83fad8b fix(server): validar parametros de ruta y query
31f3b6a fix(server): verificar webhook de Mercado Pago sobre el body crudo
```

---

## Portal público completo (2026-09-19)

### Antes

Botones "Imprimir/Procesar" = `alert()` stubs; PEDIDOs en `Abierto` para siempre; sin seguimiento para el cliente.

### Qué se hizo

**Backend** (`31d7231`): `PATCH /api/documents/:id/status` — `{ status: En Proceso | Enviado | Anulado }` (zod enum). Transiciones validadas server-side: `Abierto → En Proceso/Anulado`, `En Proceso → Enviado/Anulado`, terminales no avanzan; no-PEDIDO → 400; fuera del tenant → 404; `ventas.escribir` + audit en transacción. Hallazgo: receive es solo-OC y pagos van en la creación → terminal = `Enviado`/`Anulado`, sin cambios de schema.

**Frontend** (`d1aaaa6`): Procesar avanza con label según acción ("Marcar en proceso/enviado", oculto en terminal) + Anular con confirm; Imprimir = modal detalle + `window.print()` con regla `@media print` (solo `.print-order`); mapeo de estados veraz en App (se mató el forzado a Nuevo/Pendiente); tienda pública con tarjeta "Seguí tu pedido" (email + estados reales).

### Registro de commits

```text
31d7231 feat(server): avance de estados de pedido con transiciones validadas
d1aaaa6 feat(front): procesar, imprimir y seguimiento real de pedidos publicos
```

### Verificación

`npm run lint` ✓ · `npm test` (19) ✓ · `npm run build` ✓ · `server build` ✓ · `server test` (41 pass — suite nueva pedido-status: checkout público → avance → visibilidad por email, saltos/terminales/cross-tenant/sin-auth bloqueados — 1 skip) ✓
- Gotchas de infra registrados: suites en paralelo sobre una DB (slug suite re-resuelve + reintenta), `register` concurrente en deadlock P2034 → fixture cross-tenant vía prisma + `signToken` directo.

---

## Entrada visible al portal (`c48145c`)

### Reporte (dueño)

Con cualquier cuenta logueada la URL queda siempre en `/` — la ruta del portal del negocio era invisible.

### Causa

El "Portal de Clientes" del menú navegaba in-app (routing por estado, sin URL). El link real solo vivía en Settings → Empresa.

### Qué se hizo

El botón ahora abre `/t/<slug-de-tu-empresa>` en pestaña nueva (icono `open_in_new`). Misma vista, con la ruta compartible en la barra + ejercita el path anónimo real.

### Verificación

`npm run lint` ✓ · `npm run build` ✓

---

## Fase E: cobro MP real (2026-09-19)

### Qué se hizo (`2c3ca65`)

**Backend**: `createMpPayment` (Checkout Pro preferences por REST, sin SDK) + `POST /api/billing/payments` (crea Payment `Pendiente` + preferencia, 503 honesto sin token, 409 si ya pagado) + `GET /api/billing/payments/:id` (local primero, consulta MP y aplica aprobado) + webhook extendido a pagos (`payment` → `markCollectionApproved` idempotente por `nexus:<company>:<doc>`). `GET /mp-config` dice si hay credenciales (sin exponer tokens).

**Frontend**: POS Tarjeta/QR con MP configurado → crea VENTA pendiente + modal con link/init_point + polling ~3s hasta aprobado/rechazado; sin MP → flujo manual idéntico a hoy + nota. Efectivo/Dividir/HID/cámara intactos.

### Tests

Nueva suite `mp-collection.test.ts` (6 tests: reference round-trip, mp-config con/sin token, 503 sin escritura, intent 201 + Pendiente, polling approved marca Pagado, webhook approved + replay duplicate + 409). Server total: **47 pass / 0 fail**.

### Incidente en la suite (resuelto, lección)

Los 5 tests con auth fallaban con 401 y payload perfecto: mi helper `api()` ya prefijaba `Bearer ` y yo pasaba el token prefijado → `Bearer Bearer ...`. Logins pasaban (sin header) y me hicieron perder 30 min persiguiendo secretos/duplicación de módulos. Regla: el helper pone el prefijo, los call sites pasan el token crudo.

### Pendiente del dueño (credenciales MP reales)

1. Crear credenciales de prueba en developers.mercadopago.com (Access Token de TEST).
2. Railway → servicio API → Variables: `MP_ACCESS_TOKEN=<test-token>` (+ opcional `FRONTEND_URL`, `MP_SUCCESS_URL`, `MP_FAILURE_URL`). Redeploy.
3. En MP: registrar webhook `https://erp-web-final-gigli-production.up.railway.app/api/billing/webhook` para tópicos de pagos.
4. Probar con tarjetas de prueba de MP (aprobada/rechazada/pendiente) desde el POS → ver Pagado automático.
5. Producción real: repetir con credenciales productivas cuando decidas cobrar de verdad.
- **Diferido por el dueño a otro día**: pasos 1-4 (credenciales TEST, variable, webhook, prueba con tarjetas). Sin credenciales el fallback manual sigue intacto.

---

## Reanudación del lote interrumpido — 2026-09-23

### Estado del árbol

Al iniciar la reanudación se revisaron 35 archivos modificados y dos helpers nuevos. Después se añadieron correcciones y pruebas a ese mismo árbol; **todo sigue sin commit ni despliegue**. No confundir lo descrito en esta sección con comportamiento disponible en la web. Los cambios previos de backend incluyen `parseBody` (27 usos), facturas de cliente como ingreso, paginación opt-in y `warehouseId` por línea; los de frontend incluyen formato monetario parcial y mejoras de inventario/UX. El conjunto aún requiere terminación y revisión antes de publicarse.

### Contratos corregidos en esta unidad (locales, pendientes de revisión de negocio)

| Contrato | Comportamiento actual en el árbol local | Evidencia |
| --- | --- | --- |
| POS y depósitos | `src/lib/branch.ts` elige por **cada línea** un depósito de la sucursal activa capaz de cubrir toda su cantidad. `src/App.tsx` envía esos `warehouseId` al backend. Productos distintos pueden venderse desde depósitos distintos dentro de la misma sucursal. Si una línea necesita sumar stock repartido o no alcanza, se frena la venta con un mensaje; no se carga contra un depósito arbitrario ni contra otra sucursal | `branch.test.ts` cubre ambas situaciones y el bloqueo por stock repartido/insuficiente |
| Etiquetado monetario | `formatMoney` usa es-AR/ARS por defecto y permite indicar moneda. El MRR de plataforma se presenta como USD; precios y confirmación de tienda usan `company.currency` sin mezclar «$ ARS» con una etiqueta USD. No hay conversión de importes | `format.test.ts` cubre ARS, USD, strings Decimal e input de moneda inválido |
| Ajustes de stock | El usuario selecciona un depósito con fila de stock existente en su sucursal; motivo y nota llegan al POST. Solo se informa éxito tras respuesta de la API y actualización del listado. Si falla la API se conserva el formulario; si falla el refresco se advierte que el movimiento pudo registrarse y se impide repetirlo a ciegas | `branch.test.ts` cubre depósitos habilitados; interacción de UI con error/éxito requiere prueba manual |
| Transferencias | La cantidad enviada se compara con el stock **del origen**, sin recorte silencioso; el mensaje de éxito indica exactamente la cantidad enviada. Origen/destino inválidos o iguales se rechazan | `branch.test.ts` cubre cantidad nula, excesiva, origen sin stock, depósitos inválidos e iguales |
| Control de sucursal en `/api/stock` | El servidor consulta `branchId` actual del usuario en la DB por petición. Para usuarios asignados, limita los listados a su sucursal y rechaza con 403 los ajustes/transferencias que apuntan fuera de ella. El descuento de transferencias es condicional y atómico: stock insuficiente → 409 sin movimiento ni auditoría | `server/test/stock-branch.test.ts`: acceso cruzado 403, propietario con acceso, insuficiencia 409 y rollback |
| Identidad del dueño | Solo el rol `Super Admin` perteneciente a **su empresa** concede acceso a todas las sucursales. `branchId = null` sin ese rol ya no equivale a ser dueño: operaciones de stock, documentos, dashboard, finanzas y cobros responden 403 hasta que se asigne una sucursal. `GET /me` y el selector del frontend reflejan la misma regla | `server/test/branch-boundaries.test.ts` comprueba dueño, asignado, no asignado y roles de otra empresa |
| Productos y documentos | El stock expuesto en productos se filtra a la sucursal asignada; crear stock inicial en otra devuelve 403. Lectura, creación y mutaciones de documentos/cobros validan sucursal de cabecera, depósito, líneas, destino y origen. Documentos históricos sin sucursal atribuible o con referencias contradictorias son solo para dueños. Dashboard y resultados documentales de finanzas se acotan a la sucursal | `server/test/branch-boundaries.test.ts` comprueba 403/404, lectura acotada, fuentes cruzadas y rechazo de un depósito público de otro tenant |

### Retiro de consulta pública de pedidos (local, sin despliegue)

- Eliminado `GET /api/public/store/:slug/orders?email=`: conocer un email permitía obtener el historial de pedidos de otra persona sin verificar su titularidad. `POST /api/public/store/:slug/orders` conserva el checkout; el seguimiento por WhatsApp de la tienda permanece.
- `server/test/api.smoke.test.ts` comprueba 404 para GET en una tienda existente; `server/test/pedido-status.test.ts` mantiene el checkout y verifica estados desde el endpoint autenticado de documentos. `docs/ROADMAP.md` refleja el contrato público vigente en el árbol local.
- **Pendiente en otra unidad:** pedidos públicos por WhatsApp sin reserva de stock, con verificación al confirmar una venta, y tienda vinculada a una sucursal. El límite de identidad y panel ECO inicial se documenta más abajo; la provisión backend se agrega después, sin canje ni interfaz. No se cambió stock ni datos en esta unidad. **No desplegado.**

### Límites conocidos y siguientes pasos

- El backend guarda el depósito elegido en `StockMovement`; **`DocumentItem` no tiene `warehouseId`**. Leer un ítem aislado no permite reconstruir su depósito sin consultar movimientos. No se cambió schema ni base de datos en esta unidad.
- El POS bloquea una línea cuyo stock esté repartido entre depósitos. Dividir automáticamente esa línea requeriría otro contrato y prueba end-to-end; se priorizó evitar una venta incorrecta.
- **Alcance del aislamiento:** el catálogo de productos es compartido por empresa; editar metadatos/precios sigue regido por `inventario.escribir` y afecta a toda la empresa. `/api/audit-logs` sigue mostrando información del tenant entero y el storefront anónimo publica stock agregado de la empresa: **no** afirmar aislamiento universal por sucursal. Documentos históricos sin depósito legible pueden quedar reservados al dueño; validar UX con datos reales.
- El lote **no está listo para publicar**: se actualizó `README.md` y se eliminaron entradas obsoletas del lockfile. Para corregir el rechazo previo de `npm ci`, se copiaron solo `package.json` y `package-lock.json` a un directorio temporal; allí `npm install --ignore-scripts --no-audit --no-fund` añadió al lockfile `@emnapi/wasi-threads@1.2.3` y `tslib@2.8.1` sin cambiar las versiones fijadas ni el manifiesto. `npm ci --dry-run --ignore-scripts --no-audit --no-fund` terminó correctamente tanto en el directorio temporal como en la raíz (código 0). La paginación aún carga todas las filas y hay otros cambios locales por terminar, probar y revisar.
- El orden de trabajo y las condiciones para avanzar figuran en el plan de fases al final de esta sección. Credenciales MP TEST permanecen diferidas por decisión del dueño.

### Verificación acotada

Para POS/moneda el implementador informó tests focalizados **10/10**, `npm run lint`, `npm test` **24/24**, `npm run build` y build del servidor. Tras ajuste/transferencia, el frontend informó **26/26** tests, lint y build correctos. El test focalizado de stock backend pasó **1/1** contra DB local con limpieza. Para límites de sucursal se informaron **2 tests focalizados aprobados** y suite del servidor con **49 aprobados, 1 skip, 0 fallidos**; build de servidor, lint raíz, tests raíz **26/26** y `git diff --check` correctos (solo avisos CRLF). Las pruebas crearon fixtures locales y comprobaron su limpieza. **No** se ejecutó venta multi-depósito real ni prueba automatizada de interacción de formularios con API fallida; tampoco se congeló/revisó el lote entero para despliegue.

Para el retiro del GET público, `npm run build` en `server/` y `git diff --check` terminaron correctamente. **No se ejecutaron las pruebas de API**: `server/test/setup.ts` solo desactiva límites de tasa/cuota; `api.smoke.test.ts` registra empresas y `pedido-status.test.ts` crea y borra registros sobre la base configurada, sin aislamiento local verificable en esta unidad. Queda pendiente ejecutarlas exclusivamente contra una base de pruebas desechable antes de publicar.

### Límite backend ECO (local, sin aplicar migración ni publicar)

- Se agregó `PlatformUser` en `usuarios_plataforma` mediante migración aditiva, sin crear cuentas. Los JWT empresariales existentes (incluidos los que no tienen tipo) siguen siendo válidos únicamente en rutas empresariales; los nuevos JWT de plataforma llevan tipo y audiencia propios, sin `companyId`. Ambos guards consultan el principal activo en su tabla. El overview global exige `requirePlatformAuth`: un rol empresarial con `billing.manage`, incluido el demo, ya no lo habilita. El catálogo, los roles y `/me` omiten ese permiso legado y la edición de roles no puede volver a otorgarlo. Login/registro empresarial y APIs de negocio conservan su contrato.
- **Corrección frontend local:** `AdminView.tsx` ya no muestra la pestaña Facturación ni consulta `/api/billing/admin/overview` (tampoco para contar empresas en el encabezado); conserva Usuarios, Roles y Permisos de la empresa. La referencia anterior al MRR en el frontend describe el estado previo a este retiro. El backend responde 403 a JWT empresarial válido (sin cerrar sesión) y 401 a token inválido.
- **Verificación sin DB:** `prisma validate` y `prisma generate` con `DATABASE_URL` ficticia, build TypeScript del servidor, `npm run lint:server`, `git diff --check` y `node --import tsx --test test/platform-boundary.unit.test.ts` (3/3) correctos; solo avisos de deprecación/CRLF. **No se aplicó migración ni se ejecutaron suites que escriben en la base**. Las pruebas HTTP usan mocks para colisión de ID, principal ausente/inactivo y overview con principal activo; falta probar la migración y los tests de integración contra una base desechable verificada.

### Acceso y panel inicial ECO (segunda unidad local, sin publicar)

- `POST /api/platform/login` valida credenciales de `PlatformUser`, aplica el límite de intentos por IP del login existente y responde igual ante email desconocido, contraseña incorrecta o cuenta inactiva; compara con un hash ficticio cuando no existe la cuenta. `GET /api/platform/me` exige el JWT de plataforma y revalida el estado activo en cada petición. No hay registro público ni provisión de cuentas.
- La ruta `/eco` carga un panel independiente antes de montar el proveedor de sesión empresarial: guarda el JWT ECO en una clave distinta, solo lo envía a `/api/platform/me` y al overview global, y al invalidarse limpia únicamente esa clave. Muestra el resumen de facturación global **solo lectura**, empresas sin suscripción, eventos recientes y cierre de sesión; no carga el sidebar, datos de empresa ni configuraciones empresariales. `/t/:slug` conserva su acceso público.
- **Estado histórico de esta segunda unidad:** aún no había alta, edición ni gestión general de empresas desde ECO. Las unidades backend posteriores agregan alta y activación, pero no su interfaz. No se provisionó ninguna cuenta ECO: aún no se puede ingresar con una cuenta real. La cuenta de Ana y su empresa permanecen intactas. Las migraciones aditivas **no se aplicaron en ninguna base**; no se ejecutaron seeds ni cambios de datos. Una migración o eliminación futura requiere identificar el entorno, respaldo y aprobación por separado.
- **Reversión de esta unidad:** quitar `server/src/routes/platform.routes.ts` y su montaje/límite en `server/src/app.ts`, la exposición de email validado en `server/src/middleware/auth.ts`, `src/components/views/EcoView.tsx` y la bifurcación en `src/main.tsx`; retirar su prueba y esta nota. Mantener aparte el límite backend anterior, la migración aditiva sin aplicar y los cambios empresariales preexistentes.
- **Verificación sin DB de esta unidad:** `node --import tsx --test test/platform-login.unit.test.ts` (1/1); junto a `platform-boundary.unit.test.ts` (4/4); `npm run lint`, `npm run lint:server`, `npm run build`, `npm run build:server` y `git diff --check` correctos (avisos del tamaño del bundle y CRLF). No se ejecutó ninguna suite con base de datos, migración, seed ni prueba manual de UI con una cuenta real.

### Empresas ECO: listado y detalle (tercera unidad local, solo lectura)

- `GET /api/platform/companies` y `GET /api/platform/companies/:id` exigen `requirePlatformAuth`: un token empresarial válido recibe 403; uno ausente o inválido, 401. ID inválido → 400; empresa inexistente → 404. El listado usa `page`/`limit` del helper existente, con 50 por defecto y máximo 200; Prisma aplica `skip`/`take` y orden por ID, sin leer todas las empresas en memoria. Responde `{ data, page, limit, total }`.
- Campos permitidos: listado `id`, `name`, `slug`, `currency`; detalle añade `legalName`, `timezone`, `createdAt`. **No se necesita email del dueño** para identificar ni revisar una empresa: no se consulta ni expone; tampoco hashes, bloqueos, usuarios, objetos de facturación ni tokens empresariales. `/eco` muestra lista paginada y detalle con el JWT ECO separado; errores de consulta de empresas no eliminan el resumen global. Si la sesión es rechazada, se borra únicamente el token ECO. La app empresarial no se monta en `/eco`.
- **Estado histórico de esta tercera unidad:** el listado y detalle eran solo lectura. Las unidades backend posteriores agregan provisión y canje; todavía falta la interfaz. No se aplicaron migraciones ni se accedió a una DB o a la cuenta de Ana.
- **Verificación sin DB:** `node --import tsx --import ./test/setup.ts --test test/platform-companies.unit.test.ts test/platform-login.unit.test.ts test/platform-boundary.unit.test.ts` en `server/`: **5/5**; `npm run lint`, `npm run lint:server`, `npm run build`, `npm run build:server` y `git diff --check`: correctos (avisos de tamaño de bundle y CRLF). Prueba con DB real / migración / interfaz con usuario real: **N/A en esta unidad**, porque no se accedió a ninguna base ni se provisionó cuenta de plataforma. La forma HTTP y los límites de acceso se verificaron con delegates Prisma simulados.
- **Reversión de esta unidad:** retirar solo los dos GET y sus imports de `server/src/routes/platform.routes.ts`, el listado/detalle de `src/components/views/EcoView.tsx`, `server/test/platform-companies.unit.test.ts` y esta nota/ajuste del plan. Mantener el login ECO, el overview y los cambios locales preexistentes.

### Provisión backend ECO (cuarta unidad local, sin canje ni publicación)

- `POST /api/platform/companies` exige `requirePlatformAuth` y valida nombre de empresa, nombres del dueño, email y moneda con el contrato del registro existente; acota el email a 150 caracteres y rechaza campos extra, incluida cualquier contraseña inicial. Un único `$transaction` crea empresa con slug único, catálogo global y rol `Super Admin` empresarial sin `billing.manage`, dueño `Pendiente` con hash bcrypt de valor aleatorio independiente, invitación ligada a empresa/dueño/actor ECO y evento de auditoría atribuido a `PlatformUser`. La invitación persiste solo SHA-256 del desafío aleatorio de 32 bytes y caduca a las 24 horas. El evento solo guarda acción y empresa objetivo. Colisiones `P2002` devuelven 409 genérico.
- La respuesta 201 entrega únicamente metadatos de empresa/dueño y `invitationToken` **una vez**, con `Cache-Control: no-store`; ni el listado ni el detalle muestran el desafío, hashes o invitación. No emite JWT empresarial. La interfaz futura construirá el enlace desde su propio origen con token en el fragmento URL; esta unidad no construye ni guarda enlaces. **Estado de la cuarta unidad:** todavía no había canje ni UI de alta. El canje backend se agregó en la unidad siguiente, pero el flujo aún carece de interfaz de entrega/activación. No desplegar esta funcionalidad parcial.
- **Reversión de esta unidad:** retirar únicamente el POST y los imports/exportaciones agregados para él en `platform.routes.ts` y `auth.routes.ts`, los dos modelos y relaciones nuevas en `schema.prisma`, la migración nueva `20260923231000_owner_invitation_platform_audit/` (sin aplicar), `platform-provisioning.unit.test.ts` y esta nota. Conservar `PlatformUser`, su migración previa y los GET/login ECO. Si una migración se aplicara después, su reversión requeriría un plan separado que preserve datos; no se ejecutó ninguna operación DB ahora.
- **Verificación sin DB:** `prisma validate` y `prisma generate` con URL ficticia, `npm run build` en `server/`, HTTP mocks (`platform-provisioning`, `platform-companies`, `platform-login`, `platform-boundary`: 6/6) y `git diff --check` correctos (avisos de CRLF/deprecación). El mock comprueba límites de acceso, validación, estado pendiente, permisos, hash y actor, respuesta única sin secretos persistidos ni en errores 409 y lecturas sin desafío. **No prueba rollback real:** migración, FKs, colisiones y atomicidad de MySQL requieren verificación posterior sobre una base desechable aislada antes de considerar publicación.

### Activación backend de dueño (quinta unidad local, sin interfaz ni DB)

- `POST /api/auth/activate-owner` es anónimo y acepta exclusivamente `{token,password}` en el cuerpo: desafío hexadecimal de 64 caracteres y contraseña de 8 a 100 caracteres (mismo contrato que el registro). Consulta la invitación mediante SHA-256, comprueba vencimiento, consumo y que el usuario pertenece a la empresa indicada. Tras calcular bcrypt, una transacción reclama la invitación con `updateMany` condicional (`tokenHash`, sin consumo y vencimiento posterior al instante de reclamo) y activa únicamente al usuario `Pendiente` de esa empresa; si cualquiera de los dos conteos no es 1, se aborta. Los desafíos inválidos, vencidos o usados reciben el mismo 400; no se emite JWT ni se atribuye la acción a un administrador ECO. El login empresarial ya rechazaba `Pendiente`.
- Límite anónimo independiente por IP: 5 intentos cada 15 minutos para activación, además del límite general `/api`, sin cambiar los límites de login/registro. Todas las respuestas de la ruta, incluidos errores del parser y de tasa, llevan `Cache-Control: no-store`. No hay canje por GET ni query, ni tokens crudos en la base o auditoría.
- **Verificación sin DB:** `node --import tsx --import ./test/setup.ts --test test/owner-activation.unit.test.ts test/platform-provisioning.unit.test.ts test/platform-login.unit.test.ts test/platform-boundary.unit.test.ts test/platform-companies.unit.test.ts` (**7/7**), `npm run build` en `server/` con URL ficticia y `git diff --check`. La prueba HTTP simula las operaciones Prisma y el rollback para cubrir éxito, vencimiento, formato incorrecto, replay, fallos condicionales y login pendiente; **no demuestra atomicidad ni bloqueo de carreras en MySQL**. Falta aplicar/probar la migración y ejecutar pruebas de integración/replay concurrente sobre una DB desechable antes de publicar. En esta quinta unidad aún faltaban las UI (agregadas localmente en la sexta, abajo); ninguna cuenta ECO fue creada.
- **Reversión de esta unidad:** retirar solo el handler y sus imports en `server/src/routes/auth.routes.ts`, el montaje del limitador y cabecera en `server/src/app.ts`, el limitador en `server/src/middleware/rateLimit.ts`, `server/test/owner-activation.unit.test.ts` y esta nota. Conservar el POST de alta, el schema/migración sin aplicar y el resto del árbol sucio.

### Interfaz ECO y activación de dueño (sexta unidad local, sin DB ni publicación)

- `/eco` permite crear empresa y dueño pendiente desde el JWT ECO independiente: nombre de empresa, nombre/apellido, email y código de moneda de tres letras. El POST envía solo esos cinco campos a `/api/platform/companies`; el backend devuelve el desafío en la respuesta 201 una sola vez. La UI construye el enlace con `window.location.origin` y `/activate-owner#token=<hex>` (sin query ni host del servidor). El enlace permanece solo en memoria mientras se muestra, se puede copiar y se elimina al cerrar sesión, iniciar otra alta o navegar por el listado/detalle. Se indica entregarlo manualmente por canal seguro: si se pierde no hay recuperación; una reemisión auditada requiere trabajo futuro. No se almacena en storage ni auditoría.
- `/activate-owner` es una pantalla pública independiente del panel ECO y de la sesión empresarial. `src/main.tsx` lee una sola vez el fragmento antes de montar React, exige exactamente 64 dígitos hexadecimales y lo retira inmediatamente de la barra con `history.replaceState` (también descarta la query de esa ruta). El formulario pide contraseña y confirmación, comprueba coincidencia y longitud 8–100 en cliente; el backend valida y consume la invitación al hacer POST JSON sin credenciales. Errores genéricos y éxito sin login automático, con enlace al login empresarial normal en `/`. `/t/:slug` y login/registro preexistentes conservan su entrada.
- **Límites:** ninguna migración fue aplicada ni hay cuentas ECO provisionadas; no se hicieron llamadas a bases de datos, seed, bootstrap ni pruebas manuales con cuentas reales. El alta/canje, rollback y concurrencia deben verificarse con una base desechable aislada antes de publicar. La UI no permite recuperar un enlace perdido ni reenviar una invitación.
- **Reversión de esta unidad:** retirar solo el formulario y visualización del enlace de `src/components/views/EcoView.tsx`, la rama `/activate-owner` de `src/main.tsx`, `src/components/views/ActivateOwnerView.tsx`, `src/lib/ownerActivation.ts`, su prueba y esta sección; conservar las rutas backend y migraciones locales sin aplicar, el panel ECO existente, `/t/:slug` y el resto de cambios del árbol sucio.
- **Verificación de esta unidad:** `npm run lint` correcto; `npm run build` correcto (aviso preexistente de chunk >500 kB); `npm test -- src/lib/ownerActivation.test.ts` **1/1** (fragmento válido y formas inválidas); `git diff --check` correcto (solo avisos CRLF); lectura estructural de `EcoView.tsx`, `ActivateOwnerView.tsx` y `main.tsx`. No se ejecutó servidor ni prueba manual de UI navegando con datos reales: no hay cuenta ECO provisionada y las migraciones permanecen sin aplicar. No se ejecutaron suites con DB.

### Edición ECO de empresas (séptima unidad local, sin DB ni publicación)

- `PATCH /api/platform/companies/:id` exige JWT ECO activo: token empresarial → 403, ausente/inválido → 401; ID/cuerpo inválidos → 400; empresa inexistente, incluso si desaparece durante el update → 404. Acepta exclusivamente `name` (2–120 caracteres), `legalName` (nulo o 1–200) y `timezone` (nulo o zona IANA de 1–50); recorta espacios y rechaza objetos vacíos y propiedades adicionales. No modifica slug, moneda, CUIT, facturación, dueño, roles ni elimina empresas. Lee solo campos del detalle; si los valores no cambian, devuelve el detalle sin auditar. En un único `$transaction`, actualiza campos cambiados y crea `PlatformAuditEvent` con actor ECO, empresa objetivo y `company.updated`; un fallo de auditoría cancela la actualización. No usa `AuditLog` empresarial. La respuesta contiene solo `id`, `name`, `slug`, `legalName`, `currency`, `timezone`, `createdAt`.
- El detalle `/eco` permite editar los tres campos con etiquetas y estado de éxito/error; refresca listado y detalle tras guardar. Errores normales conservan el JWT ECO. La navegación sigue borrando el enlace de activación efímero; si `navigator.clipboard` no existe, se indica seleccionar/copiar manualmente el enlace.
- **Verificación sin DB:** `node --import tsx --import ./test/setup.ts --test test/platform-company-edit.unit.test.ts test/platform-companies.unit.test.ts test/platform-provisioning.unit.test.ts` (3/3); `npm run lint`, `npm run lint:server`, `npm run build` (raíz y `server/`) y `git diff --check` correctos; avisos de chunk >500 kB y CRLF. La prueba HTTP usa delegates Prisma simulados para accesos, whitelist, selección, no-op, auditoría transaccional y fallos; el rollback se simula, **no se demuestra atomicidad real ni carreras en MySQL**. Pendientes: migraciones, ensayo de actualización/rollback en DB desechable y recorrido de UI con cuenta ECO antes de publicar.
- **Reversión de esta unidad:** retirar únicamente el PATCH/schema/select compartido de `server/src/routes/platform.routes.ts` (restaurando el select en GET), el formulario y su lógica de `src/components/views/EcoView.tsx` junto al ajuste del portapapeles, `server/test/platform-company-edit.unit.test.ts` y esta nota/ajuste del plan. Conservar todas las demás unidades locales y migraciones sin aplicar.

### Plan de fases pendiente (propuesta; no autoriza migraciones ni publicación)

| Fase | Trabajo acotado | Condición para avanzar |
| --- | --- | --- |
| 1. Gestión ECO | Listado/detalle, alta con dueño pendiente, activación de un solo uso y edición acotada con auditoría ECO implementados localmente; UI local de alta, entrega manual, activación y edición. Sin borrado; el desafío se entrega solo en la respuesta de alta. | Faltan prueba de interfaz con cuenta ECO, migración, rollback y carreras en DB desechable. No publicar antes de validar estos límites. |
| 2. Activación de la cuenta ECO | Probar la migración de la identidad existente en una base **desechable**, con copia de seguridad y revisión de sus relaciones; evitar que la misma persona conserve simultáneamente acceso empresarial y de plataforma. | Identificar la base y los datos afectados, validar el nuevo login y la revocación del acceso anterior. Activar o limpiar datos reales solo con aprobación específica; **no borrar automáticamente la empresa asociada**. |
| 3. Alcances por permiso | Distinguir permisos de sucursal, de toda la empresa y accesos parciales definidos por módulo; conservar `companyId` como límite obligatorio. Los documentos históricos sin sucursal verificable permanecen solo para el dueño. | Definir expresamente qué roles pueden leer auditoría transversal y qué campos son parciales; probar acceso permitido y denegado entre sucursales y empresas. |
| 4. Tienda de una sucursal | Asociar la tienda a una sucursal: selección automática si es única y configuración explícita si hay varias. Publicar disponibilidad sumando solo sus depósitos y guardar esa sucursal en el `PEDIDO`. El pedido pendiente por WhatsApp **no reserva stock**; al confirmar la venta se comprueba y asigna un depósito con stock suficiente. | Probar catálogo, checkout, sucursal correcta, stock repartido e insuficiente, y que no haya descuento prematuro ni acceso a depósitos de otra empresa. |
| 5. Verificación del lote | Ejecutar las suites de API que crean datos **solo** contra una base de pruebas desechable verificada; cubrir paginación, finanzas, órdenes de compra y el GET público retirado. Probar manualmente venta multidépósito y errores/refrescos de formularios; revisar el diff y los límites de permisos. | Evidencia de tests y revisión sobre los mismos cambios; resolver fallos antes de considerar entrega. |
| 6. Entrega controlada | Planear respaldo, aplicación de migración y reversión; separar cambios en unidades revisables. | Solo entonces, y con autorización expresa, preparar commits, despliegue y eventual limpieza de datos. Ninguna fase anterior implica acceso a producción. |

### Comprobación consolidada ECO — código local, sin base real

- Pasaron **8/8** pruebas HTTP de plataforma con Prisma simulado (`platform-boundary`, `platform-login`, `platform-companies`, `platform-provisioning`, `owner-activation`, `platform-company-edit`) y **1/1** prueba del parser de activación frontend. También pasaron lint y build de frontend/servidor y `git diff --check`; Vite avisó de un chunk superior a 500 kB y Git mostró avisos LF/CRLF, sin fallos.
- **No se probó MySQL ni se aplicaron migraciones:** las pruebas simuladas no demuestran rollback real, restricciones FK, carreras entre canjes o inicio de sesión con datos persistidos. Docker no está disponible en este entorno; las bases existentes pueden contener datos reales y no se usarán como desechables. Falta una base de pruebas aislada y un recorrido de interfaz con una cuenta ECO provisionada antes de considerar publicación.
- `docs/ROADMAP.md` registra alojamientos de API y frontend como activos; no se comprobó su uso actual. Estos cambios permanecen únicamente en el árbol local: no se tocaron cuentas ni datos existentes, no hubo commit, push ni despliegue. La edición ECO no permite cambiar slug, moneda, CUIT ni borrar empresas.

### Migraciones e integración ECO en CI — preparada, NO EJECUTADA

- `.github/workflows/ci.yml` añade un job **separado** con contenedor Node y servicio MySQL efímero, sin puertos publicados ni seed. Usa una URL fija hacia el host de servicio `mysql` y el esquema exclusivo `nexus_eco_ci_disposable`; genera el cliente Prisma y luego ejecuta `prisma migrate deploy` solo en ese job. El job servidor existente conserva su `db push`, seed y pruebas sin cambios. No se leen variables de base del repositorio: la URL está fijada en el job y `dotenv` apunta a `/dev/null`.
- `server/test/eco-migrations.integration.ts` queda fuera del glob habitual `test/*.test.ts`. Antes de importar app/Prisma exige las señales de GitHub Actions, el centinela y la URL exacta del servicio descartable. En CI creará un actor ECO aleatorio en esa base, comprobará relaciones FK reales, alta con dueño pendiente/invitación/auditoría, rollback de alta con email duplicado, PATCH auditado, rollback transaccional por FK de auditoría, dos canjes simultáneos con un único éxito, rechazo de repetición e inicio de sesión del dueño. El servicio se elimina al terminar el job.
- **Estado: CI test prepared NOT RUN; no MySQL proof.** No se aplicó migración local, no se ejecutó esta integración ni se tocó MySQL80 (posibles datos reales). No hay Docker/Podman ni WSL disponible para replicarla localmente. Solo un futuro job CI efectivamente ejecutado podrá acreditar migraciones, FKs, rollback y concurrencia; antes de eso permanecen pendientes.
- **Comprobaciones locales sin DB:** build y lint TypeScript del servidor, typecheck aislado del archivo de integración y `git diff --check` correctos (avisos CRLF). Invocación local del test con centinela inválido: falla intencionalmente antes de importar app/Prisma, con `ECO integration requires its isolated CI MySQL service`; no es un resultado de integración aprobado.
- **Reversión de esta unidad:** retirar únicamente el job `eco-migrations`, `server/test/eco-migrations.integration.ts` y esta sección del informe. Las rutas ECO, migraciones locales sin aplicar y el job servidor preexistente son unidades aparte.

---

## Paginación real (2026-10-07)

Los cinco listados tenant (`/api/documents`, `/api/products`, `/api/clients`, `/api/suppliers`, `/api/users`) paginaban en memoria: leían todas las filas y cortaban el array después del `findMany`. Ahora `page`/`limit` pasan como `skip`/`take` a la query y el sobre incluye `total` con el conteo real (mismo `where`) vía `Promise.all(2 queries)`.

### Qué se hizo

| Archivo | Cambio |
|---|---|
| `server/src/lib/params.ts` | `parsePagination` valida overflow de `skip` (MySQL Int, máx. 2^31-1) y devuelve 400 antes de llegar a Prisma; `paginateResponse(data, pagination, total)` ya no corta en memoria — recibe el slice paginado y el conteo real |
| `server/src/routes/clients.routes.ts`, `suppliers.routes.ts`, `products.routes.ts`, `users.routes.ts`, `documents.routes.ts` | `findMany` con `skip`/`take` solo cuando hay parámetros (sin parámetros: array completo, como antes); `count({ where })` con el mismo filtro; `Promise.all` paralelo. En `documents` la página se corta antes del mapeo de pendientes y del query de hijos; en `users` el `shape` mapea la página, sin afectar `total` |
| `server/test/pagination-tenant.test.ts` | **Nuevo** e2e: sobre paginado en clients y documents (data = límite, total = filas sin paginar, página 2 ≠ página 1), sin parámetros devuelve array completo, `page=0`/overflow/`limit` inválido → 400 |

`platform.routes.ts` ya hacía esto desde antes y no se tocó (su guard de overflow ahora es redundante pero inofensivo).

### Evidencia

Server `tsc` 0; batería serial **87/85/1/1** (+4 tests; único fail: preexistente `branch-boundaries.test.ts:141`, ajeno). Frontend: sin cambios — ningún cliente de UI envía `page`/`limit`, así que el comportamiento para la web es idéntico.

### Límite

Paginación sin cursor: con `createdAt`/`name` duplicados la página N+1 puede recortar/duplicar filas entre páginas. Suficiente para los volúmenes actuales; un cursor estable por id sería el siguiente paso si algún listado pasa de miles de filas.---

## Formato monetario (2026-10-07)

La fila afirmaba «4 locales distintos + ~40 `toFixed` sueltos». La verificación muestra que ese estado ya no existe: el lote del 2026-09-23 unificó el formato y esta unidad solo audita y cierra la deuda.

### Verificación

| Chequeo | Resultado |
|---|---|
| Helpers de formato | **1 solo**: `src/lib/format.ts` — `formatMoney(amount, currency = 'ARS')` con `Intl.NumberFormat('es-AR', { style: 'currency' })`, `minimumFractionDigits: 2` y fallback a ARS si la moneda es inválida (`RangeError`) |
| Uso | ~25 vistas y componentes (`PosView`, `SalesView`, `ReportsView`, `FinanceView`, `DashboardView`, `PurchasesView`, `InvoicePrintModal`, etc.) importan y usan el helper; no quedan formateadores locales duplicados |
| `toFixed` sueltos | **1 en todo `src/`**: `src/lib/qrPayload.ts` (importe AFIP para el QR, decimal puro de la especificación, no es dinero visible y no debe localizarse) |
| Moneda por contexto | ARS por defecto; MRR (`EcoView`) pasa `'USD'`; la tienda pública (`PublicClientStoreView`) pasa la moneda real de la empresa |
| Tests | `src/lib/format.test.ts` cubre ARS, USD, número↔string y moneda inválida → fallback |

### Evidencia

`npx vitest run`: **48/48** (8 archivos). Sin cambios de código en esta unidad — la fila se cierra por verificación, no por refactor.

### Límite

`formatMoney` no recibe opciones (fracciones fijas a 2, sin compactación). Si algún día se quiere `$ 1,2 M` en KPIs o fracciones variables, extender el helper — hoy todos los montos van con 2 decimales y eso es lo correcto para facturación.---

## Dependencias sin imports (2026-10-07)

La fila pedía remover 7 dependencias del manifiesto del frontend y renombrar `"react-example"`. La verificación muestra que el trabajo ya está hecho (commit `1ddaa68`, lote 2026-09-23) y esta unidad solo audita y cierra.

### Verificación

| Chequeo | Resultado |
|---|---|
| Manifiesto raíz | `package.json` ya no lista `lucide-react`, `motion`, `@google/genai`, `express`, `dotenv`, `autoprefixer` ni `esbuild`; solo `react`/`react-dom`/`qrcode` + toolchain |
| Lock raíz | Sin entradas top-level de ninguna de las 7 — `esbuild` aparece únicamente como dependencia transitiva de Vite (la usa el build, es esperado) |
| Imports en `src/` | **0** — grep de `from 'lucide-react' | 'motion' | '@google/genai' | 'express' | 'dotenv' | 'autoprefixer' | 'esbuild'` no encuentra nada |
| `express`/`dotenv` | Legítimos en `server/package.json` (framework HTTP + carga de env); no eran deuda del frontend |
| `"react-example"` | El nombre del paquete ya es `nexus-erp` en `package.json` y el lock; `react-example` solo aparece en este informe |
| `vite` | Ya está en `devDependencies` (fila 93) |

### Evidencia

Sin cambios de código en esta unidad; no se tocaron manifiestos. Gates: frontend vitest **48/48** y `tsc --noEmit` intactos (verificados en unidades previas del día).---

## parseBody y simplificaciones (2026-10-07)

La fila agrupaba cinco propuestas. Verificación item por item:

### Verificación

| Ítem | Estado |
|---|---|
| `parseBody` | **Ya existe** — `server/src/lib/parseBody.ts`: `safeParse` → 400 `{ error, details }` o dato tipado. **27 usos** en 11 routers (auth, billing, branches, clients, company, documents, platform, products, public, sale-points, stock, suppliers, users) |
| `getUserPermissions` reutilizable | **Ya existe** — `server/src/middleware/auth.ts:153`, usado por `requirePermission` vía middleware y directamente en documents/users |
| CRUD factory clients/suppliers | **Se rechaza (YAGNI)**: son dos recursos ~120 líneas con where/select/schema/orderBy propios y que divergen (search por taxId, permisos, validaciones). Un factory con config object por recurso termina tan largo como las rutas y agrega indirección; con 2 instancias no paga el costo |
| line-math | **Se rechaza (churn)**: quedan 3 copias de 2 expresiones (`lineTotal = gross − discount`, `taxAmount = lineTotal * taxRate / 100`) en create, receive y public. La lógica pesada (weightedUnitPrice, descuento proporcional por recepción, overrides heredados) ya está centralizada en los caminos de derivación. Extraer 2 expresiones ahorra ~4 líneas netas tocando los caminos de dinero con más tests — no vale la pena |
| doc-number padding | Server no formatea números; el frontend usa `String(v.number).padStart(4, '0')` inline en 2-3 vistas — un helper compartido no reduce nada material |

### Evidencia

Sin cambios de código en esta unidad. Gates del día intactos: server serial **87/85/1/1** (fail único preexistente `branch-boundaries.test.ts:141`) y frontend vitest **48/48**.---

## loadAll y gating de navegación (2026-10-07)

La fila describía dos problemas que ya están resueltos desde `3d19ce2` («feat(front): gating por permisos en carga, sidebar y vistas»). Verificación sin cambios de código:

### Verificación

| Afirmación del AUDIT | Estado real |
|---|---|
| «`loadAll` pide 3 endpoints (users/roles/audit) a todo usuario autenticado → banner de error para no-admins» | `App.tsx:383-419` gatea **cada** fetch con `can(p, ...)` (usuarios → `usuarios.leer`, auditoría → `auditoria.leer`, productos/stock/taxes → `inventario.leer`, etc.). El fetch salteado resuelve `true`: no cuenta como error, así que un usuario restringido **nunca** ve el banner por datos que no puede ver. El banner solo aparece si algo pedido falla de verdad (o falta `branchId` al dueño) |
| «navegación sin gating de permisos» | `Sidebar.tsx:129` y `:150` filtran los ítems de navegación y del grupo Sistema con `can(permissions, VIEW_PERMISSIONS[path])`; `VIEW_PERMISSIONS` vive en `src/lib/auth.tsx:221` |
| Defensa en profundidad | `App.tsx:809` y `:919-930`: si el usuario llega a una vista sin permiso (URL directa, estado viejo), se muestra el panel «No tenés permiso para ver esta sección» con botón a Dashboard — nunca tablas vacías + banner de error |

### Evidencia

Gate del día intacto: frontend vitest **48/48** (este trabajo es frontend; corrió tras los commits de hoy).

## Navegación única (2026-10-07)

### Qué se hizo

`src/lib/navigation.ts` es ahora la **única fuente de verdad** de la navegación del admin shell:

- `NAV_SECTIONS` (9 secciones del Sidebar) y `ADMIN_SECTIONS` (Administración) — el Sidebar los importa en lugar de sus listas inline.
- `QUICK_NAV_ITEMS` (19 pantallas del quick-nav del Header, incluidas las sub-pantallas: ajuste/transferencia/nuevo producto, pedido manual, nueva orden de compra, registrar remito, nuevo usuario, log de auditoría, auth-login).

Agregar una pantalla = editar el registro; nunca más dos listas a mano (174 líneas de botones inline eliminadas del Header: 137 borradas, 25 insertadas).

### Cierre de hueco de la fila 42

El quick-nav del Header **no estaba gateado** (mostraba las 19 pantallas a cualquier sesión; recién el panel «No tenés permiso» lo frenaba). Ahora filtra con la misma regla que el Sidebar: `can(permissions, VIEW_PERMISSIONS[path])`. El único ítem `external` (Portal de Clientes, abre `window.open` con el slug) conserva su comportamiento y queda visible para todos porque `VIEW_PERMISSIONS['portal-clientes']` es `null`.

### Evidencia

- Commit `be2f9a6` "refactor(ui): registro unico de navegacion para sidebar y quick-nav del header".
- Gates: `tsc --noEmit` 0, vitest **48/48**, `git diff --check` limpio (solo warnings LF/CRLF preexistentes).