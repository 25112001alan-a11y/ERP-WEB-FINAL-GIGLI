# Nexus ERP — Roadmap

> Estado: **8/8 fases completadas** — producto usable en producción local (single-tenant demo). Las secciones "Próximo" son ampliaciones, no deudas.

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

## Arquitectura

```
server/            Express 5 + Prisma (MySQL) — API REST /api/*
  src/app.ts       Configuración (CORS, JSON, rutas, error handler) — exportada para tests
  src/index.ts     Bootstrap: dotenv + listen
  src/routes/      auth, products, stock, clients, suppliers, documents,
                   dashboard, finance, users, audit-logs, company, public
  src/lib/         prisma, jwt, auth (middleware + RBAC), audit (logAudit transaccional)
src/               React 19 + Vite + Tailwind 4 (frontend SPA)
  lib/api.ts       apiFetch con token (auth: true/false)
  lib/auth.ts      Context de sesión + permisos
  lib/mappers.ts   Mappers API -> vista (unit-tested)
  components/views Panel admin completo + portal público
docs/              Documentación
```

- **Multi-tenancy**: cada fila lleva `companyId`; los queries usan `tenantWhere(req)`; los tokens JWT llevan `sub`, `companyId` y `email`.
- **RBAC**: permisos por rol (`usuarios.*`, `inventario.*`, `ventas.*`, `compras.*`, `finanzas.*`, `configuracion.*`, `auditoria.*`). Los documentos mapean tipo → permiso (`DOCUMENT_PERMISSION`).
- **Auditoría transaccional**: `logAudit` escribe el `AuditLog` en la MISMA transacción de la operación (consistencia garantizada).
- **Stocks atómicos**: ventas, recepciones, ajustes y transferencias mutan `Stock` dentro de la transacción del documento.

## Endpoints principales

| Método y ruta | Auth | Descripción |
| --- | --- | --- |
| `POST /api/auth/register` / `login` | — | Registro de tenant y login JWT |
| `GET /api/products` · `POST /api/products` | token | Productos con stock por depósito |
| `GET/POST /api/categories` · `GET/POST /api/taxes` | token | Catálogos de inventario |
| `POST /api/stock/adjust` · `POST /api/stock/transfer` | token | Ajustes y transferencias |
| `GET/POST/PATCH/DELETE /api/clients` · `/api/suppliers` | token | Entidades |
| `GET/POST /api/documents` · `POST /api/documents/:id/receive` · `POST /api/documents/:id/pay` | token | Comprobantes + flujos |
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

Seed demo (`npm --prefix server run prisma:seed`): tenant demo, 3 clientes de prueba, 4 roles, usuario `ana.silva@empresa.com` / `password123` (Super Admin).

## Tests

```bash
npm test               # Vitest — mappers del front (9 tests)
npm run test:server    # node:test + supertest-free — smoke completo de la API (9 tests)
```

## Próximo (ampliaciones)

- **Portal B2B multi-tenant**: que cada tenant publique su propio catálogo público (hoy el portal usa la primera empresa demo).
- **Pagos online / mercadopago** en el checkout público.
- **Notificaciones por email** (emitir remitos, confirmar pedidos).
- **Cobertura de tests**: casos de negocio (recepciones, pagos, transferencias, RBAC por rol).
- **CI**: correr `npm test` + `npm run test:server` en GitHub Actions.
- **Observabilidad**: logs estructurados y métricas (healthcheck ya integrado en `/api/health`).
- **Backups automáticos de MySQL** y procedimiento de restore documentado.