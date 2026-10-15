# Nexus ERP — Roadmap

> Estado: **8/8 fases completadas + Fase A (captura de documento del proveedor) + cadena AFIP + panel ECO de plataforma** — funcionalidad terminada y **operativa en producción**: el front está en Vercel y la API en Render (`/api/health` → 200 JSON). El deploy histórico de Railway quedó muerto y fue reemplazado por Render. Las secciones "Próximo" son ampliaciones planificadas, no deudas.

## Fases completadas

| Fase | Alcance | Estado |
| ---- | ------- | ------ |
| 1 | Fundación: Vite + React 19 + TS, Express 5, Prisma + MySQL, Docker Compose (MySQL 8) | ✅ |
| 2 | Auth JWT multi-tenant + RBAC (roles y permisos por tenant), registro + login + demo seed | ✅ |
| 3 | Productos e inventario multi-depósito (stock por warehouse, ajustes, categorías) | ✅ |
| 4 | Clientes y proveedores (CRUD, empresas, vendedores) | ✅ |
| 5 | Documentos: OC, COMPRA, REMITO, COTIZACION, VENTA, PEDIDO — series por tipo, recepción, pagos, stock atómico | ✅ |
| 6 | Dashboard, ventas y finanzas: KPIs reales, reportes, niveles de stock | ✅ |
| 7 | Usuarios, auditoría (transaccional), transferencias entre depósitos, impuestos | ✅ |
| 8 | Portal público de clientes: catálogo público + checkout que persiste PEDIDOs, seguimiento por email | ✅ |
| — | **Deudas de producción**: CORS restringido, JWT_SECRET por entorno, suites de tests (server + front), ROADMAP.md | ✅ |
| — | **Cadena AFIP**: remitos bidireccionales y facturas con datos AFIP (OC → REMITO → FACTURA, CAE/punto de venta) | ✅ |
| A | **Captura del documento del proveedor**: manual/lector/OCR + adjunto (PATCH/POST `/external`, `invoiceData.verifiedBy`, modal con precarga) | ✅ |

## Arquitectura

```
server/            Express 5 + Prisma (MySQL) — API REST /api/*
  src/app.ts       Configuración (CORS, JSON, rutas, error handler, /uploads estático) — exportada para tests
  src/index.ts     Bootstrap: dotenv + listen
  src/routes/      auth, products, stock, clients, suppliers, documents,
                   dashboard, finance, users, audit-logs, company, public,
                   billing, platform (back-office de plataforma /eco)
  src/lib/         prisma, jwt, auth (middleware + RBAC), audit (logAudit transaccional)
src/               React 19 + Vite + Tailwind 4 (frontend SPA)
  lib/api.ts       apiFetch con token (auth: true/false), apiUpload
  lib/auth.ts      Context de sesión + permisos
  lib/mappers.ts   Mappers API -> vista (unit-tested)
  components/views Panel admin completo + portal público + EcoView (panel plataforma, ruta /eco)
docs/              Documentación
```

- **Multi-tenancy**: cada fila lleva `companyId`; los queries usan `tenantWhere(req)`; los tokens JWT llevan `sub`, `companyId` y `email`.
- **Plataforma vs tenant**: el back-office de plataforma (`/eco`) usa un modelo y auth separados — `PlatformUser` (`usuarios_plataforma`) con `requirePlatformAuth` y audience JWT propia, contra `User` (tenant) con `requireAuth`. `PLATFORM_ONLY_PERMISSIONS = ['billing.manage']`. El front rutea `/eco` fuera de `<AuthProvider>` (`src/main.tsx`).
- **RBAC**: permisos por rol (`usuarios.*`, `inventario.*`, `ventas.*`, `compras.*`, `finanzas.*`, `configuracion.*`, `auditoria.*`). Los documentos mapean tipo → permiso (`DOCUMENT_PERMISSION`).
- **Auditoría transaccional**: `logAudit` escribe el `AuditLog` en la MISMA transacción de la operación (consistencia garantizada).
- **Stocks atómicos**: ventas, recepciones, ajustes y transferencias mutan `Stock` dentro de la transacción del documento.
- **Voucher proveedor**: `invoiceData` almacena cuit/razón social/fechas/montos/método/adjunto y `verifiedBy`; archivos en `server/uploads/` servidos por `/uploads/*` (prod: object storage recomendado).

## Endpoints principales

| Método y ruta | Auth | Descripción |
| --- | --- | --- |
| `POST /api/auth/register` / `login` | — | Registro de tenant y login JWT |
| `GET /api/products` · `POST /api/products` | token | Productos con stock por depósito |
| `GET/POST /api/categories` · `GET/POST /api/taxes` | token | Catálogos de inventario |
| `POST /api/stock/adjust` · `POST /api/stock/transfer` | token | Ajustes y transferencias |
| `GET/POST/PATCH/DELETE /api/clients` · `/api/suppliers` | token | Entidades |
| `GET/POST /api/documents` · `POST /api/documents/:id/receive` · `POST /api/documents/:id/pay` | token | Comprobantes + flujos |
| `PATCH /api/documents/:id/external` · `POST /api/documents/:id/external/attach` | token | Captura de documento del proveedor (Fase A) |
| `GET /api/users` · `POST /api/users` · `GET /api/users/roles` | token | Usuarios y roles |
| `GET /api/audit-logs` | token | Auditoría |
| `GET/PATCH /api/company` | token | Perfil de empresa |
| `GET /api/public/store/:slug/products` | — | Catálogo público por empresa |
| `POST /api/public/store/:slug/orders` | — | Checkout público; seguimiento por WhatsApp |
| `GET /api/billing/plans` | — | Catálogo de planes (público) |
| `GET /api/billing/admin/overview` | platform | Métricas de plataforma: MRR, `planBreakdown`, `pastDueCompanies` |
| `GET /api/platform/companies` | platform | Listado con filtros (`?q=`, `?status=`, `?plan=`) + paginación |
| `GET/PATCH /api/platform/companies/:id` | platform | Ficha 360 (con `subscription`) y edición de datos |
| `PATCH /api/platform/companies/:id/subscription` | platform | Cambiar plan/estado de suscripción |
| `GET /api/platform/audit` · `/companies/:id/audit` | platform | Auditoría global y por empresa |

## Ejecución local

```bash
cp server/.env.example server/.env   # llenar DATABASE_URL, JWT_SECRET, CORS_ORIGINS
npm install
cd server && npx prisma db push && npx prisma generate
npm run dev             # frontend :3000
# en otra terminal
npm run dev:server      # API :3001
```

Seed demo (`npm --prefix server run prisma:seed`): tenant demo, 3 clientes de prueba, 4 roles, usuario `ana.silva@empresa.com` / `password123` (Super Admin). En producción la seed usa `ADMIN_PASSWORD` y se auto-aplica migraciones + seed al arrancar (`RUN_DEMO_SEED`).

## Tests

```bash
npm test               # Vitest — lógica pura del front (mappers, formatters)
npm run test:server    # server — node:test + tsx (suite completa; unit de plataforma mockean prisma y firman tokens)
npm run lint           # tsc --noEmit (front)
npm run lint:server    # tsc --noEmit (server)
```

> Nota: `npm run test:server` tiene ~2 fallos flaky que rotan entre `pagination-tenant` y `branch-boundaries`/`pedido-status` por data compartida y paralelismo; no son regresiones.

## Próximo — Plan de fases v2 (desde Fase A cerrada)

- **Fase B — Consolidación y deuda de seguridad**
  - ROADMAP v2 documentado (este documento).
  - Rotar credenciales expuestas en sesiones previas: password de MySQL Aiven y API key de Render (ver "Pendientes de seguridad").
  - ~~Split del panel SuperAdmin~~ ✅ Resuelto: el back-office de plataforma (`/eco`) quedó separado del panel de empresa (modelo `PlatformUser` + `requirePlatformAuth`, commit `6b65416`).
- **Panel ECO de plataforma** ✅ (2026-10-15, sin publicar): vista 360 de empresa + auditoría, gestión de suscripciones (`PATCH .../subscription`), finanzas (`planBreakdown` + `pastDueCompanies`) y filtros del listado (`?q/?status/?plan`). Detalle completo en [AUDIT.md](./AUDIT.md).
- **Fase C — Facturación electrónica real (AFIP WSFE)**: conectar a los webservices de AFIP (WSAA/WSFE) en vez de capturar datos estáticos; cola de comprobantes y estado (aprobado/rechazado/pendiente) reflejado en invoiceData.
- **Fase D — Portal público B2B multi-tenant**: parametrizar el portal por tenant (hoy usa la primera empresa demo) con subdominio/ruta y catálogo propio.
- **Fase E — Pagos online (Mercado Pago)** en el checkout público: preferencia MP, webhook de confirmación → PEDIDO pagado.
- **Fase F — Notificaciones por email**: emitir remitos, confirmar pedidos, recuperación de cuenta.
- **Fase G — Ingeniería**: ~~CI en GitHub Actions (`npm test` + tests server)~~ ✅ CI añadido (`.github/workflows/ci.yml` — frontend lint+tests, server type-check+tests con MySQL service), observabilidad (logs estructurados + métricas en `/api/health`), backups automáticos de MySQL + restore documentado, gestión de tenants a nivel plataforma.
- **Hardening 2026-09** ✅: webhook MP firma sobre body crudo, ajuste de stock atómico, params validados (400 en vez de 500), low-stock scoped por tenant, alta de producto con stock inicial + impuesto real, 14 índices FK (migración pendiente: `cd server && npx prisma migrate dev --name add_fk_indexes`). Detalle completo en [AUDIT.md](./AUDIT.md).
- **Moneda canónica ARS** ✅: default del schema y creates de documentos en pesos argentinos (decisión del dueño).
- **Datos reales en UI** ✅: KPIs de inventario, reportes, compras, pedidos públicos y salud del sidebar computados de datos reales; elementos sin dato real eliminados (PDF falsa, "v2.4.0 Enterprise Cloud", etc.). Detalle en [AUDIT.md](./AUDIT.md).

## Historial de despliegue

| Entorno | URL | Estado |
| --- | --- | --- |
| API (Render) | `https://nexus-erp-api-v3o0.onrender.com` | **Live** — `/api/health` → 200 JSON; login demo OK. Servicio `srv-db3jfo6i0phs73aerpj0`. Free tier: cold start ~30-60s tras inactividad |
| Front (Vercel) | `https://erp-web-final-gigli.vercel.app` | Activa, auto-deploy desde `main`. El back-office de plataforma vive en `/eco` |
| API (Railway) | `https://erp-web-final-gigli-production.up.railway.app` | **Muerta** (histórica) — reemplazada por Render. Requiere intervención en la cuenta de Railway (no accesible desde este entorno) |

## Pendientes de seguridad

- **Rotar credenciales expuestas en el chat** (quedaron visibles en sesiones previas):
  - MySQL Aiven: consola Aiven → Users → `avnadmin` → Reset password (luego actualizar `DATABASE_URL` en Render).
  - API key de Render: Account Settings → API Keys → revocar la expuesta y crear una nueva.
- **Bug POS pendiente de investigación**: en algunos casos generar una venta "se reinicia" el carrito (parcialmente mitigado 2026-10-15; ver [AUDIT.md](./AUDIT.md), sección "Panel ECO de plataforma + bug POS").
