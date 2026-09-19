# Nexus ERP — Roadmap

> Estado: **8/8 fases completadas + Fase A (captura de documento del proveedor) + cadena AFIP** — producto en producción (Railway API + Vercel front). Las secciones "Próximo" son ampliaciones planificadas, no deudas.

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
                   dashboard, finance, users, audit-logs, company, public
  src/lib/         prisma, jwt, auth (middleware + RBAC), audit (logAudit transaccional)
src/               React 19 + Vite + Tailwind 4 (frontend SPA)
  lib/api.ts       apiFetch con token (auth: true/false), apiUpload
  lib/auth.ts      Context de sesión + permisos
  lib/mappers.ts   Mappers API -> vista (unit-tested)
  components/views Panel admin completo + portal público
docs/              Documentación
```

- **Multi-tenancy**: cada fila lleva `companyId`; los queries usan `tenantWhere(req)`; los tokens JWT llevan `sub`, `companyId` y `email`.
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
| `GET /api/public/products` | — | Catálogo público |
| `POST /api/public/orders` · `GET /api/public/orders?email=` | — | Checkout público + seguimiento |

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
npm test               # Vitest — mappers del front (13 tests)
npm test               # server — node:test + tsx: smoke API, cadena OC->REMITO->FACTURA, voucher (15 tests, 14 pass + 1 skip)
```

## Próximo — Plan de fases v2 (desde Fase A cerrada)

- **Fase B — Consolidación y deuda de seguridad**
  - ROADMAP v2 documentado (este documento).
  - Rotar password MySQL de Railway (variable expuesta en sesiones previas).
  - Split del panel SuperAdmin: navegación/vistas de administración (Usuarios, Roles, Auditoría) separadas de la configuración operativa de empresa (Empresa, Impuestos) — sin cambios de backend (RBAC ya existe).
- **Fase C — Facturación electrónica real (AFIP WSFE)**: conectar a los webservices de AFIP (WSAA/WSFE) en vez de capturar datos estáticos; cola de comprobantes y estado (aprobado/rechazado/pendiente) reflejado en invoiceData.
- **Fase D — Portal público B2B multi-tenant**: parametrizar el portal por tenant (hoy usa la primera empresa demo) con subdominio/ruta y catálogo propio.
- **Fase E — Pagos online (Mercado Pago)** en el checkout público: preferencia MP, webhook de confirmación → PEDIDO pagado.
- **Fase F — Notificaciones por email**: emitir remitos, confirmar pedidos, recuperación de cuenta.
- **Fase G — Ingeniería**: ~~CI en GitHub Actions (`npm test` + tests server)~~ ✅ CI añadido (`.github/workflows/ci.yml` — frontend lint+tests, server type-check+tests con MySQL service), observabilidad (logs estructurados + métricas en `/api/health`), backups automáticos de MySQL + restore documentado, gestión de tenants a nivel plataforma.
- **Hardening 2026-09** ✅: webhook MP firma sobre body crudo, ajuste de stock atómico, params validados (400 en vez de 500), low-stock scoped por tenant, alta de producto con stock inicial + impuesto real, 14 índices FK (migración pendiente: `cd server && npx prisma migrate dev --name add_fk_indexes`). Detalle completo en [AUDIT.md](./AUDIT.md).

## Historial de despliegue

| Entorno | URL | Estado |
| --- | --- | --- |
| API (Railway) | `https://erp-web-final-gigli-production.up.railway.app` | Activa |
| Front (Vercel) | `https://erp-web-final-gigli.vercel.app` | Activa, auto-deploy desde `main` |