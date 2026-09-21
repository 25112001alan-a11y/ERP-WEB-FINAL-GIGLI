# Nexus ERP — Informe de auditoría

> Fecha: 2026-09-19 · Última actualización: 2026-09-19 (Seed AR en boot de producción)
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
| Sin paginación en listas ilimitadas (documents/products/clients/suppliers/users) | ⏳ Pendiente — cambia el contrato de API y el frontend; requiere tanda propia |
| Scaffold de formulario repetido en 8 vistas (`FormScaffold` + `useSubmitFlow`, ~-250 líneas) | ⏳ Pendiente — refactor de UI con riesgo de regresión visual; tanda propia |
| `formatMoney`: 4 locales distintos + ~40 `toFixed` sueltos (el mismo monto se ve distinto según vista) | ⏳ Desbloqueado en tanda 2 (moneda canónica decidida: **ARS, locale es-AR**) — falta aplicar el helper unificado como parte de la tanda de duplicación |
| `parseBody` (zod-safeParse→400 repetido 15+ veces), CRUD factory clients/suppliers, line-math, doc-number padding, `getUserPermissions` reutilizable | ⏳ Pendiente — simplificaciones seguras de tanda propia |
| -7 dependencias sin imports en el frontend (`lucide-react`, `motion`, `@google/genai`, `express`, `dotenv`, `autoprefixer`, `esbuild`) y rename de `"react-example"` | ⏳ Pendiente — mecánico, sin riesgo |
| `loadAll` pide 3 endpoints (users/roles/audit) a todo usuario autenticado → banner de error para no-admins; navegación sin gating de permisos | ⏳ Pendiente — UX (el backend ya falla cerrado, no es riesgo de seguridad) |
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
| POS envía todo el carrito a UN warehouse (falla checkout multi-warehouse) | ⏳ Pendiente (lógica de negocio: asignación de warehouse por línea) |
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
| Money formatting en 4 locales + ~40 `toFixed` → `formatMoney()` | ⚠️ Pendiente (ver §1, requiere decisión de moneda) |
| `clients.routes.ts` y `suppliers.routes.ts` estructuralmente idénticos → CRUD factory | ⏳ Pendiente |
| `safeParse`→400 repetido 15+ veces → `parseBody()` | ⏳ Pendiente |
| Line-math de items en 5 vistas y 3 handlers; doc-number `padStart(4,'0')` en 10+ sitios; side-effects de stock en 3 handlers | ⏳ Pendiente (helpers compartidos) |
| Flatten de permisos en 3 lugares (ya existe `getUserPermissions`) | ⏳ Pendiente |
| Header con 19 botones hardcodeados vs `navItems` del Sidebar (una sola fuente) | ⏳ Pendiente |
| Carrito mobile + summary duplicados en POS y PublicClientStore | ⏳ Pendiente |
| Dependencias sin imports (`lucide-react`, `motion`, `@google/genai`, `express`, `dotenv`, `autoprefixer`, `esbuild`) | ⏳ Pendiente — verificadas por grep; renombrar además `"react-example"` y mover `vite` a devDependencies |

---

## Comandos pendientes para el mantenedor

```bash
# Aplicar los índices en la DB (schema ya actualizado y validado)
cd server && npx prisma migrate dev --name add_fk_indexes
```

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

### Condición (requiere acción del dueño en Railway)

1. Verificar que la variable `RUN_DEMO_SEED=true` exista en el servicio de Railway; si no, agregarla.
2. El push a `main` ya dispara el redeploy (Vercel front + Railway API). Al bootear, migraciones + seed AR corren solos.
3. Probar login en https://erp-web-final-gigli.vercel.app con `dueno@lodemarta.test` / `password123`.

### Registro de commits

```text
d304543 feat(server): seed AR demo tambien en boot con RUN_DEMO_SEED
```

### Verificación

`server build` ✓ · health prod `200 {"status":"ok"}` ✓ · seed AR en prod pendiente de redeploy + flag (verificar con login)
- Front web verificado en vivo: bundle `index-DPaROJDI.js` contiene `BarcodeDetector` + storefront `/t/:slug` + `payments` → el QR y pagos reales están desplegados en https://erp-web-final-gigli.vercel.app (HTTPS, apto para cámara en el celu)

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