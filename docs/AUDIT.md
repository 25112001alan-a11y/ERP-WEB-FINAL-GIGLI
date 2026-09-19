# Nexus ERP — Informe de auditoría

> Fecha: 2026-09-19 · Alcance: `src/` (frontend React 19 + Vite + Tailwind 4), `server/` (Express 5 + Prisma + Zod, MySQL), `server/prisma/schema.prisma`
> Método: revisión de código por agentes de exploración (buenas prácticas, coherencia frontend↔backend, duplicación) + verificación cruzada del diff.
> Estado: hallazgos marcados ✅ (resuelto), ⏳ (pendiente deliberado), ⚠️ (requiere decisión del usuario).

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
| Alta de producto: tasas de IVA hardcodeadas `[16,12,8,0]` → creación fallaba con tasas distintas | ✅ Resuelto: el selector usa el catálogo real de impuestos cargado en App ([`AddProductView.tsx`](../src/components/views/AddProductView.tsx)) y envía `taxId` directo |
| Alta de producto: descartaba Stock Inicial y Almacén Principal (producto nacía sin stock, silenciosamente) | ✅ Resuelto: `POST /api/products` acepta `stockInicial` + `warehouseId` (ambos o ninguno) y crea la fila `Stock` en la misma transacción (`server/src/routes/products.routes.ts`); el frontend los envía cuando corresponden |
| Proveedores: el frontend forzaba `email/phone/taxId = ''` pese a que el backend los devuelve | ✅ Resuelto: mapeo 1:1 en `src/App.tsx`, render con `?? ''` en `PurchasesView.tsx`, tipos ajustados en `src/types.ts` |
| Finanzas: todo status no-'Conciliado' se mostraba como "Completado" (mentira visual) | ✅ Resuelto: passthrough del status real del backend (`src/App.tsx`) |

### Pendientes ⏳ / requieren decisión ⚠️

| Hallazgo | Estado |
| --- | --- |
| Sin paginación en listas ilimitadas (documents/products/clients/suppliers/users) | ⏳ Pendiente — cambia el contrato de API y el frontend; requiere tanda propia |
| Scaffold de formulario repetido en 8 vistas (`FormScaffold` + `useSubmitFlow`, ~-250 líneas) | ⏳ Pendiente — refactor de UI con riesgo de regresión visual; tanda propia |
| `formatMoney`: 4 locales distintos + ~40 `toFixed` sueltos (el mismo monto se ve distinto según vista) | ⚠️ Pendiente — requiere decidir moneda/locale canónicos (hoy la base graba USD para todo tenant) |
| `parseBody` (zod-safeParse→400 repetido 15+ veces), CRUD factory clients/suppliers, line-math, doc-number padding, `getUserPermissions` reutilizable | ⏳ Pendiente — simplificaciones seguras de tanda propia |
| -7 dependencias sin imports en el frontend (`lucide-react`, `motion`, `@google/genai`, `express`, `dotenv`, `autoprefixer`, `esbuild`) y rename de `"react-example"` | ⏳ Pendiente — mecánico, sin riesgo |
| `currency`/`exchangeRate` siempre USD al persistir documentos, ignorando la moneda de la empresa | ⚠️ Requiere decisión de negocio (moneda por tenant en documentos) |
| `loadAll` pide 3 endpoints (users/roles/audit) a todo usuario autenticado → banner de error para no-admins; navegación sin gating de permisos | ⏳ Pendiente — UX (el backend ya falla cerrado, no es riesgo de seguridad) |
| Datos inventados en UI: KPIs de InventoryView, ReportsView (+18.4%), gráficos de Purchases/Pedidos, "v2.4.0 Enterprise Cloud" en sidebar | ⏳ Pendiente — reemplazar literales por datos reales o quitar; requiere decisión de alcance por vista |
| Endpoints vivos sin UI: `/api/clients`, edit/delete de products/suppliers | ⏳ Pendiente — producto (¿traer las vistas o quitarlas de la API?) |
| `imageUrl` renderizado sin columna en el schema | ⏳ Pendiente — o se agrega el campo o se quita de la UI |
| Test de webhook MP con fixture grabado (body + firma reales) | ⚠️ Recomendado antes de depender de producción — hoy la suite ejerce el path con firmas sintéticas |
| `trust proxy 1` | ✅ Verificado por topología: la API corre en Railway tras exactamente un proxy TLS; no es un defecto en ese despliegue |
| Webhook `eventId` fallback `evt-${Date.now()}` rompe idempotencia si faltan ambos IDs | ⚠️ Menor — decidir si rechazar el evento en vez de inventar ID |

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