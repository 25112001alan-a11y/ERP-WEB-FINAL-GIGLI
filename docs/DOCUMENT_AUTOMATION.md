# Automatización de documentos — inventario vivo

Matriz de referencia: qué dato de cada documento (facturas, OC, remitos, pedidos, compras) se autocompleta hoy, qué se pide a mano, y de dónde debería venir. Complementa [`DOCUMENT_FLOW_PENDING.md`](./DOCUMENT_FLOW_PENDING.md), que registra integridad y trazabilidad; este archivo registra el **origen de datos y autocompletado**.

> Alcance: simulación operativa y fiscal argentina. Sin integración fiscal real, todo CAE, punto de venta, QR o autorización se identifica como **SIMULACIÓN — SIN VALIDEZ FISCAL**.

## Convención de actualización

Al cerrar cada unidad que toque esta matriz: actualizar la fila correspondiente, la tabla de estado de unidades y el registro de cierre. Informar al usuario **qué se completó y cómo se verificó, qué falta, cuál es la próxima unidad y qué modelo/esfuerzo conviene**. No marcar una tarea como terminada sólo porque compila; distinguir implementación, prueba y despliegue.

## Fuentes de verdad

Tres orígenes, en orden de autoridad:

1. **Documento origen** — la OC, el remito o el pedido del que deriva el documento.
2. **Maestro de contraparte** — `Supplier` / `Client`.
3. **Maestro de empresa y sucursal** — `Company` / `Branch`.

Regla heredada de `DOCUMENT_FLOW_PENDING.md`: **los borradores se autocompletan; los documentos confirmados se congelan.** Hoy esa regla está implementada a medias — ver "Instantáneas" más abajo.

---

## 1. Estado por unidad

| Unidad | Alcance | Migración | Estado |
|---|---|---|---|
| U1 | Bugs de plata en recepción y creación | No | **Completada** |
| U2 | Derivar de maestros lo que ya existe | No | **Completada** |
| U3 | Cliente como entidad en el frontend | No | **Completada** |
| U4 | Instantánea de cabecera en `Document` | **Sí** | **Completada** |
| U5 | Maestros fiscales (condición IVA, domicilio, provincia, PV) | **Sí** | **En curso** — slice 1 aplicado (empresa + proveedor, migración `20261006221000`) |
| U6 | Moneda y tipo de cambio desde `Company` | No | Documentada, no ejecutada |

---

## 2. Compras — qué se pide a mano hoy

| Dato | Origen correcto | Estado | Nota |
|---|---|---|---|
| Proveedor | Selector | Automatizado | `NewPurchaseOrderView.tsx:158-169`; nunca texto libre |
| CUIT del proveedor | `Supplier.taxId` | **Manual en el comprobante** | `SupplierVoucherModal.tsx:222-230` texto libre sin validar, pese a que `App.tsx:159` ya lo carga y `PurchasesView.tsx:355` ya lo muestra |
| Razón social del proveedor | `Supplier.name` | **Manual en el comprobante** | `SupplierVoucherModal.tsx:233-241` la vuelve a pedir; el modal recibe el número de orden como etiqueta en vez del nombre (`PurchasesView.tsx:270`) |
| Subtotal / IVA / Total del comprobante | `Document.subtotal/totalTax/total` | **Manual y sin conciliar** | `SupplierVoucherModal.tsx:246-278`; el total de la OC ya está calculado y visible en la misma fila (`PurchasesView.tsx:228`) |
| Fecha de emisión, Nº de comprobante | Externo | Correcto manual | No son datos nuestros |
| Almacén de recepción | La OC | **Manual, sin filtro de sucursal** | `GoodsReceiptView.tsx:71` toma `warehouses[0]`; `mappers.ts` ya expone `warehouseId` de la OC |
| Costo unitario | `Product.costPrice` | Autocompletado pero **editable** | `NewPurchaseOrderView.tsx:61` lo precarga, `:251-259` lo deja editar |
| Condición IVA, domicilio, provincia, IIBB, condiciones de pago | Maestro | **No existe** | `Supplier` no los tiene — ver sección 5 |

## 3. Ventas — qué se pide a mano hoy

| Dato | Origen correcto | Estado | Nota |
|---|---|---|---|
| Cliente | Maestro `Client` | **Texto libre en 3 lugares** | `PosView.tsx:416-421`, `NewManualOrderView.tsx:162-168`, `RegistrarFacturaView.tsx:379-386`; envían `clientName` y el servidor crea por nombre (`documents.routes.ts:544-557`) |
| CUIT, domicilio, teléfono, email del cliente | Maestro `Client` | **No cargable** | El frontend nunca llama a `/api/clients`; `ApiDocument.client` sólo expone `{id, name, type, phone}` |
| Precio unitario | `Product.salePrice` | Autocompletado pero **editable** | `NewManualOrderView.tsx:224-230` precarga, `:250-256` deja editar. El patrón correcto ya existe: `RegistrarFacturaView.tsx:458` lo deshabilita |
| Descuento | Modelo | Correcto, pero no obvio | `NewManualOrderView.tsx:16` guarda un **porcentaje** (`discountPct`, `max="100"`); el cálculo es `gross * discountPct / 100` (`:49`, `:54`, `:60`, `:217`) y sólo la salida al API en `:93` convierte a monto absoluto. **El rótulo "% Desc." es correcto** |
| Documento de origen | `REMITO` o `VENTA` | Automatizado, pero **el default es manual** | `RegistrarFacturaView.tsx:337-341` ofrece "Sin origen" como primera opción; ése es el motivo principal de que el camino manual se use |
| Venta seleccionada al navegar | Contexto | **Se descarta** | `SalesView.tsx:9` define `onOpenRegistrarFactura: () => void` sin argumento; `:256` y `:263` navegan sin contexto, hay que reseleccionar |
| Tipo de comprobante, CAE, punto de venta | Fiscal | Manual | Legítimamente externo; hoy no hay nada de dónde derivarlo |

## 4. Lo que falta en todas las cabeceras

| Dato | Existe en el maestro | Llega al documento |
|---|---|---|
| Razón social y CUIT de la empresa | `Company.legalName`, `Company.taxId` | **Sí, desde U4** — instantánea al crear |
| Moneda de la empresa | `Company.currency` | **No** — el documento siempre toma el default de la columna (U6) |
| Nombre y dirección de sucursal | `Branch.name`, `Branch.address` | **Sí, desde U4** — instantánea al crear |
| Identidad del proveedor / cliente en documentos históricos | Foreign key | **Sí, desde U4** — instantánea al crear; la relación viva queda sólo como fallback para el histórico previo |

### Instantáneas (resuelto en U4)

`Document` ya **no** lee la cabecera en vivo. Congela `companyName`, `companyTaxId`, `clientName`, `clientTaxId`, `clientAddress`, `supplierName`, `supplierTaxId`, `supplierAddress`, `branchName`, `branchAddress`, y desde U5 slice 1 también `companyAddress`, `companyProvince`, `companyPostalCode`, `companyTaxCondition`, `supplierProvince`, `supplierPostalCode`, `supplierTaxCondition`; y `DocumentItem` congela `sku` y `taxName`. Ver §7quater y §7quinquies.

Todas las columnas son nullable: las filas anteriores a U4 no tienen instantánea, así que los lectores aplican **instantánea primero, relación viva como fallback** (`withHeaderSnapshot`). El histórico sigue mostrándose exactamente igual que antes.

Queda pendiente lo que depende de maestros que todavía no existen: `Client` no tiene columnas de provincia, código postal ni condición frente al IVA (U5 slice 2, atada al flujo "Nuevo Cliente" diferido — §7bis). El lado proveedor ya no es NULL: desde U5 slice 1 `Supplier.address/province/postalCode/taxCondition` existen y los documentos legacy se hidratan de la relación viva (§7quinquies).

---

## 5. El bloqueo de fondo

`DOCUMENT_FLOW_PENDING.md` fases F2.1 y F2.2 cubren esto. El punto que hay que entender: **la automatización fiscal pedida está bloqueada aguas arriba por datos maestros que nunca se cargaron.**

- `Branch` tiene `name` y `address`. Nada más.
- `Supplier` no tiene dirección, condición IVA, IIBB, alias de pago ni condiciones de pago.
- `Client` no tiene `condicionIVA` ni domicilio fiscal; su `type` es un texto libre de 20 caracteres que ningún documento consulta.
- `Company` tiene `legalName`, `taxId`, `currency`, `timezone`.
- **Cero ocurrencias en todo el repositorio:** `condicion IVA`, `domicilio fiscal`, `IIBB`, `provincia`, `vencimiento de pago`, `imputación`, `retenciones`.

Consecuencia práctica: un documento hoy puede autopoblarse con empresa, sucursal, contraparte, domicilio, teléfono, email, SKU, descripción, precio, costo e impuesto. **No** puede autopoblarse con nada fiscal.

---

## 6. U1 — Bugs de plata (completada 2026-10-06)

Cinco defectos verificados y corregidos en `server/src/routes/documents.routes.ts`. Todos son casos en que el camino de recepción discrepaba del camino genérico.

| # | Defecto | Corrección |
|---|---|---|
| 1 | `/receive` fijaba `discount: 0` e ignoraba el descuento en `lineTotal`, por lo que `subtotal`/`totalTax`/`total` contradecían el neto de la OC | Reparto proporcional `(ocLine.discount / ocLine.quantity) * cantidadRecibida`, misma fórmula que el camino genérico; `lineTotal = gross - discount` |
| 2 | `/receive` escribía el nombre vivo del producto en `DocumentItem.description` | Usa la `description` congelada de la línea OC |
| 3 | `COMPRA` por endpoint genérico caía a `Product.salePrice` | Cae a `costPrice`; `VENTA` sigue usando `salePrice` |
| 4 | `COMPRA` forzaba `status = 'Recibido'` **después** del cálculo por pago: una compra pagada nunca leía como pagada pero igual escribía su `Payment` | Sólo se fuerza si el estado no es ya `'Pagado'` |
| 5 | `mappers.ts` derivaba los badges de recepción y de pago del mismo `status`. El fix 4 dejaba una `COMPRA` pagada con recepción "Pendiente" | Una `COMPRA` **es** la recepción física (genera movimientos `ENTRADA`): su badge va en `Recibido`; el pago se lee aparte |

### Evidencia

- Prueba enfocada `server/test/documents-receive-discount.unit.test.ts`, Prisma simulado, **cero acceso a base**. Recibe 4 de 10 unidades de una línea de 100 con descuento de 50: `discount 20`, `lineTotal 380`, `subtotal 380`, `totalTax 95`, `total 475`.
- La prueba **falla si se revierte el fix 1** (`0 !== 20`) **o el fix 2** (`400 !== 380`). Comprobado revirtiendo y restaurando.
- `npm run lint`, `npm test` (**37/37**), `npm run build`, `npm run lint:server`, `npm run build:server`: correctos.
- Suite del servidor: 62 / 59 pass / **2 fail** / 1 skip. Los 2 fallos son **preexistentes y ajenos**: `branch-boundaries.test.ts:141` (400 vs 404; el body del test omite el `idempotencyKey` que ahora exige `receiveSchema`) y `billing.test.ts:193` (contaminación de estado entre tests del plan de billing).
- Sin migración, sin cambio de esquema, sin acceso a base de datos.

### Consecuencia a vigilar

Una OC con descuento ya recibida por `/receive` **antes** de este fix generó remitos cuyo `subtotal`/`total` no cuadran con el neto de la OC. Los datos históricos no se tocaron y no hubo backfill. Si se importa o concilia documentación de proveedor vieja, esos importes están sobrevalidados y habría que corregirlos a mano.

### Falso positivo registrado

`weightedUnitPrice` (`documents.routes.ts:837`) parece un precio promedio, pero se construye como `unitPrice * quantity` y el consumidor lo divide por el mismo `quantity` (`:942`): **se reduce a la identidad**. Nunca hubo bug de promediado. No volver a reportarlo sin verificar la aritmética primero.

---

## 6bis. U2 — Derivar de maestros (completada 2026-10-06)

Seis de siete bullets implementados; el séptimo era un falso positivo (arriba, en la tabla 3).

| Archivo | Cambio |
|---|---|
| `server/src/routes/documents.routes.ts` | Al crear una `FACTURA`, un lookup de `Supplier` (`findFirst`, `{name, taxId}`) pobla `invoiceData.supplierCuit` y `supplierName` antes de crearse. Dos columnas que nunca se escribían ahora vienen del maestro. Un extra `read` sólo en creación de `FACTURA` |
| `server/test/documents-invoice-supplier-identity.unit.test.ts` | **Nuevo**, Prisma simulado, **cero acceso a base**. Verificado por mutación: revertidas las dos líneas del payload, falla (`null !== '30-30112233-4'`); restauradas, pasa |
| `src/components/SupplierVoucherModal.tsx` | Los cuatro prefills usan actualizador funcional `(prev) => persisted ?? prev`, así que un fetch de detalle fallido ya no puede vaciar un valor del maestro. Aviso de diferencia entre total externo y total del documento, en centavos |
| `src/components/views/PurchasesView.tsx` | El label del modal pasó de número de orden a razón social; prefilla CUIT, razón social y totales desde el documento cargado |
| `src/components/views/GoodsReceiptView.tsx` | Depósitos filtrados por sucursal, expresión copiada de `RemitoSalidaView.tsx:54-55`, con reset si el depósito actual no está en el conjunto filtrado |
| `src/components/views/NewPurchaseOrderView.tsx` | Costo unitario `disabled` (precedente: `RegistrarFacturaView.tsx:458`) |
| `src/components/views/NewManualOrderView.tsx` | Precio unitario `disabled` |
| `src/types.ts` (fuera de la lista) | `PurchaseOrder` +`subtotal`/`+totalTax`; `PurchaseDocument` +`branchId` |
| `src/lib/mappers.ts` (fuera de la lista) | Mapea los dos campos recién agregados. **Editado sólo con la herramienta de edición; 197 líneas, no 0** |

Los dos archivos fuera de la lista eran inevitables: `PurchaseDocument` no tenía `branchId` (sin esto el filtro por sucursal es imposible) y `PurchaseOrder` no tenía `subtotal`/`totalTax` (sin esto el prefill de totales es imposible). `ApiDocument` ya los traía; sólo faltaba la proyección al frente.

### Evidencia

`npm run lint` (exit 0), `npm test` **37/37**, `npm run build`, `npm run lint:server`, `npm run build:server`, `git diff --check`: todos limpios. El árbol sólo agregó el test nuevo — ningún archivo ajeno se tocó ni se removió. Sin migración, sin acceso a base.

### Riesgos abiertos (no corregidos)

- `GET /api/documents` sólo selecciona `supplier: {id, name}` (`documents.routes.ts:186`), sin `taxId`, así que `PurchasesView` resuelve el CUIT **emparejando por nombre**. Dos proveedores homónimos en el mismo tenant resuelven al primero. Añadir `taxId` a ese select convertiría esto en lookup exacto por id.
- `PATCH /:id/external` sigue permitiendo sobrescribir el `supplierCuit`/`supplierName` derivados del maestro, y sigue ignorando la contradicción con el maestro. U2 hace que el *prefill* sea correcto, no que la *escritura* esté guardada.
- Documentos creados **antes** de este cambio tienen `supplierCuit/supplierName` en `NULL` y no hay backfill: el modal muestra el valor del maestro en la sesión, pero sólo se persiste si el usuario guarda.
- El modal sólo inicializa `useState(data…)` en el primer mount (`PurchasesView` no le pasa `key`); si el fetch de detalle falla, abrir doc A y después doc B puede conservar los importes de A. Es una forma preexistente, hoy más visible al haber prefill.

---

## 7. Unidades pendientes

### U2 — Derivar de maestros lo que ya existe (sin migración)

- Poblar `InvoiceData.supplierCuit` y `supplierName` desde `Supplier.taxId` / `Supplier.name`. Hoy son dos copias del mismo hecho que nunca se cruzan.
- `SupplierVoucherModal`: precargar desde el proveedor y desde los totales del propio documento, sin depender del fetch asíncrono (`:83-109`) que si falla deja los campos en blanco.
- Etiqueta del modal = razón social del proveedor, no número de orden.
- Si el usuario edita los importes externos, avisar la diferencia contra el total del documento.
- `GoodsReceiptView`: filtrar depósitos por sucursal, replicando `RemitoSalidaView.tsx:54-55`.
- Bloquear costo y precio, como ya hace `RegistrarFacturaView.tsx:458`.
- ~~Corregir el rótulo "% Desc." de `NewManualOrderView.tsx:208`~~ — **falso positivo.** El campo es porcentaje (`discountPct`, `max="100"`); el label es correcto y cambiarlo a un monto introduce un bug de plata. Verificado antes de implementar U2.

### U3 — Cliente como entidad (sin migración)

- `loadClients` en `App.tsx`, espejo de `loadPurchases` (`:144-177`), contra `/api/clients`.
- Reemplazar los 3 `clientName` de texto libre por selector con búsqueda; enviar `clientId`.
- ~~Revivir el botón "Nuevo Cliente" de `PosView.tsx:410-412`, que no tiene `onClick`.~~ — **diferido.** `POST /api/clients` ya existe y `src/components/Modal.tsx` es un modal genérico reutilizable, pero el frontend no tiene ningún flujo de alta de cliente: levantar el botón exige formulario + validación + recarga del maestro + selección, es decir construir el flujo completo. Ver 7bis.
- Cambiar el default "Sin origen" de `RegistrarFacturaView.tsx:337-341`.
- Propagar el documento seleccionado desde `SalesView` hacia factura y remito.

### U4 — Instantánea de cabecera (**completada 2026-10-06**)

Ejecutada. Ver §7quater para el detalle y la evidencia.

Especificación original: columnas en `Document` (`companyName`, `companyTaxId`, `clientName`, `clientTaxId`, `clientAddress`, `supplierName`, `supplierTaxId`, `supplierAddress`, `branchName`, `branchAddress`) más `DocumentItem.sku` y `DocumentItem.taxName`; poblar al confirmar y dejar de leer los maestros en vivo.

**Corregido 2026-10-06:** la migración `20260929100000_document_item_lineage` (F1.1) **sí estaba aplicada**. El bootstrap reporta `12 migrations found … No pending migrations to apply` sobre la base local `nexus_erp`, y hay exactamente 12 carpetas en `server/prisma/migrations/`. La afirmación previa de que "no corrió en ninguna base" era falsa: corría contra mi memoria, no contra la base. Queda pendiente sólo verificar el entorno de Railway cuando vuelva a estar arriba.

### U5 — Maestros fiscales (**requiere migración y backfill**)

Condición IVA, domicilio fiscal, provincia, código postal, punto de venta como entidad, depósito por defecto por sucursal, condiciones de pago y alias. Es lo que realmente desbloquea la automatización fiscal. **Desbloqueada: U4 ya está aplicada (§7quater).** Lo que falta no es código, son columnas en los maestros más su backfill.

**Slice 1 aplicado (2026-10-06) — empresa y proveedor.** Columnas `address`, `province`, `postalCode`, `taxCondition` en `Company` y `Supplier`; `Document` suma 7 columnas de instantánea (`companyAddress`, `companyProvince`, `companyPostalCode`, `companyTaxCondition`, `supplierProvince`, `supplierPostalCode`, `supplierTaxCondition`). Ver §7quinquies.

**Pendiente (slice 2 y siguientes):** `Client` sin columnas fiscales — atado al flujo "Nuevo Cliente" diferido (§7bis, §7quinquies). Además: punto de venta como entidad (hoy `puntoVenta` ya existe en `InvoiceData`; es normalización, no creación), depósito por defecto por sucursal, condiciones de pago y aliases.

### U6 — Moneda (sin migración, Verificar contra la base)

- `Document.currency` nunca lee `Company.currency`: siempre gana el default de la columna. Corregir el default de `schema.prisma` no sirve si el valor no viene del maestro.
- `currency` y `exchangeRate` **no están en el schema Zod** de `documentSchema`, así que si un cliente los envía, Zod los descarta en silencio y el documento cae al default. Igual pasa con `status` e `idempotencyKey`.
- Confirmar en la base persistente si existe un tipo de cambio real. Si no existe, `exchangeRate` es una columna muerta y conviene decidirlo explícitamente en vez de dejarla creada silenciosamente.

---

## 7bis. U3 — Cliente como entidad (completada 2026-10-06)

Cuatro de cinco bullets implementados; el tercero (botón "Nuevo Cliente") queda diferido, ver abajo.

| Archivo | Cambio |
|---|---|
| `src/lib/clientSelection.ts` | **Nuevo.** `resolveClientSelection(query, clients)`: vacío → `{clientName:''}`; match exacto (trim + `toLowerCase`, equivalente a la collation CI de MySQL) → `{clientId, clientName}` canónico; sin match → `{clientName}` libre. El find-or-create del servidor (`documents.routes.ts:544-557`) sigue siendo el fallback |
| `src/lib/clientSelection.test.ts` | **Nuevo.** 5 casos: vacío, exacto, mayúsculas/espacios, sin match, homónimos → primera fila (igual que el `findFirst` del servidor) |
| `src/App.tsx` | `loadClients` espejo de `loadPurchases` contra `GET /api/clients`, gate `branchReady && ventas.leer`, `setClients([])` en logout, `clients` a las tres vistas. `CompleteSalePayload` + `clientId?`, enviado en el `POST /api/documents`. Estado `sourceDocId` + `openRegistrarFactura(direction, docId?)` + `openRemitoSalida(docId)` |
| `src/components/views/PosView.tsx` | `<input list>` + `<datalist id="pos-client-options">` en la raíz del return: el `cartBody` se renderiza dos veces (desktop y mobile), un solo datalist evita id duplicado. Los tres `onCompleteSale` envían `...resolveClientSelection(...)` |
| `src/components/views/NewManualOrderView.tsx` | `<datalist id="manual-order-clients">` + `...resolveClientSelection(...)` en el body del `PEDIDO` |
| `src/components/views/RegistrarFacturaView.tsx` | `<datalist id="factura-clients">`; la rama manual de `egreso` envía `clientId` cuando matchea. El `useMemo` de `sourceDocs` sube encima de los `useState` para que el inicializador pueda leerlo; `sourceId` arranca en el documento elegido por Ventas si sigue elegible, si no en el más nuevo elegible, si no en `''`. "Sin origen" deja de ser el default |
| `src/components/views/RemitoSalidaView.tsx` | +`initialSourceId`; arranca en el documento elegido **sólo si** `deliverySourceDocuments` lo ofrece. Sin cambio de default (el bullet 4 nombra sólo a `RegistrarFacturaView`) |
| `src/components/views/SalesView.tsx` | `onOpenRegistrarFactura(docId)` / `onOpenRemitoSalida(docId)`; los dos botones pasan `selectedSale.id`. El de remito dejó de llamar a `onNavigate('remito-salida')` directamente |

### Evidencia

`npm run lint` (exit 0), `npm test` **42/42** en 7 archivos (+5 de `clientSelection.test.ts`; baseline 37/37 en 6), `npm run build`, `npm run lint:server`, `npm run build:server`, `git diff --check` exit 0 (38 warnings LF→CRLF preexistentes por `core.autocrlf`, ninguno en whitespace propio). `git status --short`: **92 = 90 del inicio de sesión + los 2 archivos nuevos**; ningún archivo ajeno modificado. Sin migración, sin cambio de esquema, sin tocar `server/`.

### Riesgos y decisiones abiertas

- **"Nuevo Cliente" diferido** (arriba, en §7). No hay flujo de alta de cliente en el frontend en ningún lado; `Modal.tsx` sólo aporta el cascarón.
- El selector es `<input list>` + `<datalist>` nativo: autocompletado del navegador, sin navegación por teclado tipo combobox. Sin dependencias nuevas — una lib de select se agrega sólo si el nativo se queda corto.
- Si `GET /api/clients` falla o no hay `ventas.leer`, `clients` queda `[]` → todo cae al camino `clientName`, idéntico al de antes. Cero regresión.
- Homónimos: matchea el primero (`find`), igual que el `findFirst` del servidor. Dos clientes con el mismo nombre se resuelven al mismo id.
- `sourceDocId` vive en App y no se limpia al navegar; ambos puntos de entrada lo fijan antes de entrar, así que no puede envejecer. Comentario en el propio estado.
- La línea de tiempo de `RegistrarFacturaView` cambió de orden de hooks (el `useMemo` subió). Los hooks se declaran siempre en el mismo orden en cada render, así que es estable; fue necesario porque el inicializador de `sourceId` necesita `sourceDocs`.

---

## 7ter. Cómo levantar en local (verificado 2026-10-06)

Lo que funciona y lo que no, porque cuesta varios intentos descubrirlo.

| Paso | Comando | Nota |
|---|---|---|
| Frontend | `npm run dev` (raíz) | Vite en `:3000` |
| API | `cd server && npm run dev` | `tsx watch src/index.ts`, escucha en `:3001` |

**El API tiene que arrancar con `cwd = server/`.** El script de la raíz `npm run dev:server` ejecuta `tsx watch server/src/index.ts` con cwd en la raíz y **falla**: `bootstrap.ts:10` resuelve `node_modules/prisma` contra el cwd, y Prisma sólo está en `server/node_modules` (175 paquetes en la raíz, 0 con Prisma). El error es `MODULE_NOT_FOUND` sobre `node_modules/prisma/build/index.js`.

**Configuración:** el `.env` real es `server/.env` (`DATABASE_URL` → `localhost:3306/nexus_erp`, `JWT_SECRET` propio). `.gitignore:8` es `.env*` con excepción `!.env.example`, así que queda fuera del commit. `VITE_API_URL` no está definida, y `src/lib/api.ts:3` cae al default `http://localhost:3001` — por eso el front local ya habla con el API local sin configurar nada.

**Arranque automático** (`server/src/bootstrap.ts`): `runMigrations()` corre `prisma migrate deploy` (idempotente), y `ensureSeeded()` sólo siemtea **cuando la base está vacía**. Si hay datos, lo salta. Si está vacía y no hay `ADMIN_PASSWORD`, **falla a cerrado** y se niega a sembrar con la contraseña demo (`bootstrap.ts:40-45`) — hay que setear `ADMIN_PASSWORD` o `SKIP_SEED=true`.

**Credenciales:** el seed por defecto (`server/prisma/seed.ts:108-113`) crea `ana.silva@empresa.com` (Super Admin), `c.perez@empresa.com` y `m.rodriguez@empresa.com`, todos con el `PASSWORD` de ese archivo. Verificado con `bcrypt.compare` contra el hash almacenado y con un `POST /api/auth/login` real que devolvió token y user.

**Estado local confirmado:** MySQL en `:3306`, 12 migraciones aplicadas, **233 empresas**, API en `:3001` con `/api/health` → `200 {"status":"ok"}`.

---

## 7quater. U4 — Instantánea de cabecera (completada 2026-10-06)

`Document` y `DocumentItem` ahora congelan la identidad de cabecera al crear. Se leen instantánea-primero con la relación viva como fallback, así que el histórico previo se muestra igual que siempre.

| Archivo | Cambio |
|---|---|
| `server/prisma/schema.prisma` | +10 columnas nullable en `Document` (`companyName`, `companyTaxId`, `clientName`, `clientTaxId`, `clientAddress`, `supplierName`, `supplierTaxId`, `supplierAddress`, `branchName`, `branchAddress`), +`sku` y `taxName` en `DocumentItem` |
| `server/prisma/migrations/20261006144121_document_header_snapshots/` | **Nueva.** `ALTER TABLE comprobantes` / `comprobante_items`. Todas nullable: sin backfill, el histórico queda en NULL |
| `server/src/lib/headerSnapshots.ts` | **Nuevo.** `buildHeaderSnapshot(tx, ids)` lee los maestros una vez dentro de la transacción de creación, scoped por `companyId`; un maestro faltante o cross-tenant da NULL en vez de romper la escritura. `withHeaderSnapshot(doc)` aplica instantánea-primero con fallback a la relación viva |
| `server/src/routes/documents.routes.ts` | Población en `POST /api/documents` y `POST /api/documents/:id/receive`; lectura con `withHeaderSnapshot` en list y detail |
| `server/src/routes/public.routes.ts` | Ídem en `POST /api/public/store/:slug/orders` |
| `src/types.ts`, `src/lib/mappers.ts` | `DocumentHeaderSnapshot`; `headerSnapshotOf` aplicado en los 4 mappers, misma regla instantánea-primero |
| `server/test/documents-header-snapshot.unit.test.ts` | **Nuevo.** 4 casos DB-free: mapeo de campos, población en POST genérico, población en `/receive`, preferencia/fallback + fila legacy — cada uno con chequeo de mutación |

### Caminos de creación cubiertos

Los tres, verificados por grep de `document.create` / `documentItem.create` en todo `server/src`:

1. `POST /api/documents`
2. `POST /api/documents/:id/receive`
3. `POST /api/public/store/:slug/orders`

Los seeds quedan intencionalmente afuera.

### Evidencia

Corrida por el orquestador, no reportada por el ejecutor: `npm test` **42/42** en 7 archivos; `npm run lint`, `npm run build`, `npm run lint:server`, `npm run build:server`, `git diff --check` — todos exit 0. Server: **67 tests / 65 pass / 1 fail / 1 skip**, donde el único fallo es el preexistente `branch-boundaries.test.ts:141` (`400 !== 404`). `git status --short`: **97 = 94 previos + 3 nuevos** (helper, test, carpeta de migración).

### Riesgos y decisiones abiertas

- **`supplierAddress` era siempre NULL** → **resuelto en U5 slice 1 (2026-10-06).** El maestro `Supplier` no tenía columna de dirección; ahora `Supplier` y `Company` tienen domicilio + provincia + código postal + condición IVA, y los documentos legacy se hidratan con la relación viva (§7quinquies). Documentado, no inventado.
- **Lecturas en vivo: sólo una era un leak, y quedó corregida (2026-10-06).** De los cuatro sitios listados originalmente, tres no son bugs: `RegistrarFacturaView.tsx:369` y `RemitoSalidaView.tsx:179` son etiquetas de un `<select>` de documentos candidatos (ahí el nombre actual es el correcto para identificar la contraparte); `RemitoSalidaView.tsx:210` describe la venta que estás por despachar (operación actual); y `documentDerivation.ts:72` alimenta la creación de un documento nuevo, que de todos modos congela su propia instantánea al crearse. El único histórico real era `PublicOrdersView.tsx:357` — el modal de impresión de un pedido ya hecho, que leía `printDetail.client?.name` en vivo; ahora prefiere `printDetail.clientName` (instantánea) con fallback a la relación viva. Verificado por grep de `.client?.name` / `.supplier?.name` en todo `src/`: el resto de los matches son el tenant actual (`user.company.name`), no documentos históricos.
- **Sin backfill.** El histórico queda con instantáneas NULL y se resuelve por fallback en cada lectura. Congelar también el pasado sería una migración de datos aparte, y destructiva: escribiría las identidades **actuales** sobre documentos viejos.
- **`billing.test.ts:193` pasó a verde sin ser editado** (`git diff --name-only` lo confirma intacto). Era contaminación de estado, dependiente del orden. El baseline de fallos preexistentes baja a **1**.
- Añadir lecturas de maestros dentro de la transacción de creación **rompió 4 tests unitarios existentes** cuyos mocks de `tx` no tenían `company`/`branch`/`supplier`: devolvían 500 hasta agregarlos.

---

## 7quinquies. U5 slice 1 — Maestros fiscales empresa + proveedor (aplicado 2026-10-06)

Columnas `address`, `province`, `postalCode`, `taxCondition` en `Company` y `Supplier`; el documento congela además 7 campos nuevos copiados de esos maestros.

| Archivo | Cambio |
|---|---|
| `server/prisma/schema.prisma` | `Company` +4 columnas fiscales, `Supplier` +4, `Document` +7 instantáneas (`companyAddress`, `companyProvince`, `companyPostalCode`, `companyTaxCondition`, `supplierProvince`, `supplierPostalCode`, `supplierTaxCondition`). Todas nullable, campos camelCase sin `@map` |
| `server/prisma/migrations/20261006221000_company_supplier_fiscal_identity/` | **Nueva**, aplicada (`empresas`, `proveedores`, `comprobantes`). Sin backfill: el histórico queda NULL y se hidrata por fallback en cada lectura |
| `server/src/lib/headerSnapshots.ts` | Select/mapeo de los 7 campos nuevos; `supplierAddress` deja de ser un stub `?? null` y cae al fallback de la relación viva |
| `server/src/routes/company.routes.ts`, `server/src/routes/suppliers.routes.ts` | Schema Zod (patch), select y whitelist ampliados: `PATCH /api/company` y `POST/PATCH /api/suppliers` aceptan y persisten los 4 campos |
| `server/test/documents-header-snapshot.unit.test.ts` | Mocks con las columnas nuevas; test nuevo "copies the supplier address instead of hardcoding it to null" |
| `src/types.ts` | `DocumentHeaderSnapshot` +7 campos; `Supplier` +4 campos |
| `src/lib/mappers.ts` | `ApiDocument` (campos + relación `supplier`) y `headerSnapshotOf` con los 7 campos nuevos (instantánea-primero, fallback vivo) — los 4 mappers heredan el cambio vía `...snapshot` |
| `src/components/views/SettingsView.tsx` | Formulario de empresa: 4 inputs nuevos (Domicilio Fiscal, Provincia, Código Postal, Condición frente al IVA), carga y guardado vía `PATCH /api/company` |
| `src/components/views/PurchasesView.tsx` | Modal "Nuevo proveedor": 4 campos nuevos en estado, `POST /api/suppliers` y reset |

### Evidencia

Batería (orquestador): frontend `vitest` **42/42** (7 archivos), `tsc` y `build` 0; server **68 tests / 66 pass / 1 fail / 1 skip** (único fallo = preexistente `branch-boundaries.test.ts:141`), `tsc` server 0; `git diff --check` exit 0.

Vivo (API local :3001): `GET /api/company` devuelve los 4 campos; `PATCH /api/company` persiste y el GET siguiente lo confirma. `POST /api/suppliers` persiste los 4 (id 63). `PATCH /api/suppliers/14` persiste y `GET /api/documents/619` (OC legacy, anterior a la columna) **hidrata** `supplierAddress`, `supplierProvince`, `supplierPostalCode`, `supplierTaxCondition` desde la relación viva. La escritura congelada en documentos nuevos no se probó en vivo porque el guard de billing (plan Gratuito, 20 documentos/mes) bloquea la creación; está cubierta por el test unitario de snapshot.

### Decisiones

- `taxCondition` es **texto libre** en la UI, no un `<select>` con enum fijo (decisión de slice aparte).
- `platform.routes.ts` `editCompanySchema` queda estricto a propósito (sólo name/legalName/timezone) — no se toca.
- Lado cliente (slice 2) queda atado al flujo "Nuevo Cliente" diferido (§7bis), porque `Client` no tiene pantalla de alta.

---

## 8. Deuda observada, fuera de alcance

Registrada para no perderla. No corregir sin una unidad propia.

| Hallazgo | Ubicación |
|---|---|
| `OC` creada por endpoint genérico sin `unitPrice` también cae a `salePrice`; es la misma clase de bug que el fix 3 de U1 | `documents.routes.ts:944` |
| `COTIZACION` con `sourceDocumentId` no valida nada: el bloque de trazabilidad está condicionado a `isDirectionalType`, que es `false` para ese tipo | `documents.routes.ts:684` |
| Tipos no direccionales aceptan `clientId` y `supplierId` simultáneamente sin rechazo | `documents.routes.ts:439` |
| `series` nunca se valida: cualquier texto de ≤10 caracteres crea una serie de contador nueva | `documents.routes.ts:1029`, `numbering.ts:26-45` |
| `/receive` es el único camino con idempotencia; el POST genérico descarta `idempotencyKey` porque no está en el schema Zod → doble clic duplica documento | `documents.routes.ts:347` |
| `unitPrice`, `taxRate` y `discount` enviados sobre un documento derivado se **ignoran en silencio**; la UI coopera, pero un cliente API incorrecto recibe 200 con datos equivocados | `documents.routes.ts:941-947` |
| `PATCH /:id/external` fabrica `invoiceType: 'X'` si la factura no tiene `InvoiceData`, e ignora la contradicción con el maestro de proveedor | `documents.routes.ts:1654`, `:1754` |
| `externalNumber` es mutable después de la confirmación, contra la decisión 5 de `DOCUMENT_FLOW_PENDING.md` | `documents.routes.ts:1643-1647` |
| `OC` no tiene endpoint de anulación; `PATCH /:id/status` es sólo de `PEDIDO`. El estado `Anulado` figura en la UI sin camino de escritura | `documents.routes.ts:349` |
| `Payment.cashBoxId` existe y `CashBox` existe por sucursal, pero ningún camino de creación lo escribe | `schema.prisma:469` |
| `POST /api/public/store/:slug/orders` fija `discount: 0` en toda línea y `client.type: 'Mayorista'`, en contraste con el default `'Persona'` | `public.routes.ts:118`, `:132` |