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
| U5 | Maestros fiscales (condición IVA, domicilio, provincia, PV) | **Sí** | **Completada** — slices 1–5 (migraciones `20261006221000` + `20261007090000` + `20261007120000` + `20261007130000` + `20261007140000`) |
| U6 | Moneda y tipo de cambio desde `Company` | No | **Completada** (2026-10-07) — create lee `Company.currency`; Zod ya no descarta `currency`/`exchangeRate`; columna `exchangeRate` verificada contra la base (siempre 1) — ver §7decies |

---

## 2. Compras — qué se pide a mano hoy

| Dato | Origen correcto | Estado | Nota |
|---|---|---|---|
| Proveedor | Selector | Automatizado | `NewPurchaseOrderView.tsx:158-169`; nunca texto libre |
| CUIT del proveedor | `Supplier.taxId` | **Manual en el comprobante** | `SupplierVoucherModal.tsx:222-230` texto libre sin validar, pese a que `App.tsx:159` ya lo carga y `PurchasesView.tsx:355` ya lo muestra |
| Razón social del proveedor | `Supplier.name` | **Manual en el comprobante** | `SupplierVoucherModal.tsx:233-241` la vuelve a pedir; el modal recibe el número de orden como etiqueta en vez del nombre (`PurchasesView.tsx:270`) |
| Subtotal / IVA / Total del comprobante | `Document.subtotal/totalTax/total` | **Manual y sin conciliar** | `SupplierVoucherModal.tsx:246-278`; el total de la OC ya está calculado y visible en la misma fila (`PurchasesView.tsx:228`) |
| Fecha de emisión, Nº de comprobante | Externo | Correcto manual | No son datos nuestros |
| Almacén de recepción | La OC / sucursal | **Precargado desde U5 slice 4** | Recepción y remito prefieren el depósito por defecto de la sucursal; sin default, el primer depósito de la sucursal. Sigue editable por documento — ver §7octies |
| Costo unitario | `Product.costPrice` | Autocompletado pero **editable** | `NewPurchaseOrderView.tsx:61` lo precarga, `:251-259` lo deja editar |
| Condición IVA, domicilio, provincia, IIBB, condiciones de pago | Maestro | **Sí desde U5** | slice 1 (domicilio, provincia, condición IVA) + slice 3 (IIBB, condiciones de pago, alias de pago) — ver §7quinquies y §7septies |

## 3. Ventas — qué se pide a mano hoy

| Dato | Origen correcto | Estado | Nota |
|---|---|---|---|
| Cliente | Maestro `Client` | **Texto libre en 3 lugares** | `PosView.tsx:416-421`, `NewManualOrderView.tsx:162-168`, `RegistrarFacturaView.tsx:379-386`; envían `clientName` y el servidor crea por nombre (`documents.routes.ts:544-557`) |
| CUIT, domicilio, teléfono, email del cliente | Maestro `Client` | **Sí desde U5 slice 2** | `PosView` abre alta rápida (`POST /api/clients`, campos fiscales incluidos); `ApiDocument.client` expone `{id, name, type, phone, taxId, address, province, postalCode, taxCondition}` |
| Precio unitario | `Product.salePrice` | Autocompletado pero **editable** | `NewManualOrderView.tsx:224-230` precarga, `:250-256` deja editar. El patrón correcto ya existe: `RegistrarFacturaView.tsx:458` lo deshabilita |
| Descuento | Modelo | Correcto, pero no obvio | `NewManualOrderView.tsx:16` guarda un **porcentaje** (`discountPct`, `max="100"`); el cálculo es `gross * discountPct / 100` (`:49`, `:54`, `:60`, `:217`) y sólo la salida al API en `:93` convierte a monto absoluto. **El rótulo "% Desc." es correcto** |
| Documento de origen | `REMITO` o `VENTA` | Automatizado, pero **el default es manual** | `RegistrarFacturaView.tsx:337-341` ofrece "Sin origen" como primera opción; ése es el motivo principal de que el camino manual se use |
| Venta seleccionada al navegar | Contexto | **Se descarta** | `SalesView.tsx:9` define `onOpenRegistrarFactura: () => void` sin argumento; `:256` y `:263` navegan sin contexto, hay que reseleccionar |
| Tipo de comprobante, CAE, punto de venta | Fiscal | PV desde U5 slice 5; CAE manual | El punto de venta sale del maestro `puntos_venta` (serie del comprobante); el CAE sigue siendo externo (simulación) — ver §7novies |

## 4. Lo que falta en todas las cabeceras

| Dato | Existe en el maestro | Llega al documento |
|---|---|---|
| Razón social y CUIT de la empresa | `Company.legalName`, `Company.taxId` | **Sí, desde U4** — instantánea al crear |
| Moneda de la empresa | `Company.currency` | **Sí, desde U6** — el create resuelve `currency` del maestro cuando el cliente no la envía (§7decies) |
| Nombre y dirección de sucursal | `Branch.name`, `Branch.address` | **Sí, desde U4** — instantánea al crear |
| Identidad del proveedor / cliente en documentos históricos | Foreign key | **Sí, desde U4** — instantánea al crear; la relación viva queda sólo como fallback para el histórico previo |

### Instantáneas (resuelto en U4)

`Document` ya **no** lee la cabecera en vivo. Congela `companyName`, `companyTaxId`, `clientName`, `clientTaxId`, `clientAddress`, `clientProvince`, `clientPostalCode`, `clientTaxCondition`, `supplierName`, `supplierTaxId`, `supplierAddress`, `branchName`, `branchAddress`, y desde U5 slice 1 también `companyAddress`, `companyProvince`, `companyPostalCode`, `companyTaxCondition`, `supplierProvince`, `supplierPostalCode`, `supplierTaxCondition`; y `DocumentItem` congela `sku` y `taxName`. Ver §7quater, §7quinquies y §7sexies.

Todas las columnas son nullable: las filas anteriores a U4 no tienen instantánea, así que los lectores aplican **instantánea primero, relación viva como fallback** (`withHeaderSnapshot`). El histórico sigue mostrándose exactamente igual que antes.

Desde U5 slice 1 (proveedor) y slice 2 (cliente) ambos maestros tienen domicilio, provincia, código postal y condición frente al IVA; los documentos legacy se hidratan de la relación viva y los nuevos congelan los 13 campos de la cabecera (§7quinquies, §7sexies).

---

## 5. El bloqueo de fondo

`DOCUMENT_FLOW_PENDING.md` fases F2.1 y F2.2 cubren esto. El punto que hay que entender: **la automatización fiscal pedida está bloqueada aguas arriba por datos maestros que nunca se cargaron.**

- `Branch` tiene `name` y `address`. Nada más.
- ~~`Supplier` no tiene dirección, condición IVA, IIBB, alias de pago ni condiciones de pago.~~ — **resuelto.** Dirección, provincia, código postal y condición IVA (U5 slice 1, §7quinquies); IIBB, alias de pago y condiciones de pago (U5 slice 3, §7septies).
- `Client` no tiene `condicionIVA` ni domicilio fiscal; su `type` es un texto libre de 20 caracteres que ningún documento consulta.
- `Company` tiene `legalName`, `taxId`, `currency`, `timezone`.
- **Cero ocurrencias en todo el repositorio:** `condicion IVA`, `domicilio fiscal`, `IIBB`, `provincia`, `vencimiento de pago`, `imputación`, `retenciones`. (Auditoría al 2026-10-06; desde U5 slices 1–3 ya existen provincia, IIBB y condiciones de pago en los maestros.)

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
- ~~Revivir el botón "Nuevo Cliente" de `PosView.tsx`~~ — **implementado en U5 slice 2 (2026-10-07).** Modal inline de alta rápida: formulario (nombre, CUIT/NIF, email, teléfono, domicilio fiscal, provincia, código postal, condición frente al IVA), `POST /api/clients`, prefill del nombre en el carrito y recarga del maestro. Ver §7bis y §7sexies.
- Cambiar el default "Sin origen" de `RegistrarFacturaView.tsx:337-341`.
- Propagar el documento seleccionado desde `SalesView` hacia factura y remito.

### U4 — Instantánea de cabecera (**completada 2026-10-06**)

Ejecutada. Ver §7quater para el detalle y la evidencia.

Especificación original: columnas en `Document` (`companyName`, `companyTaxId`, `clientName`, `clientTaxId`, `clientAddress`, `supplierName`, `supplierTaxId`, `supplierAddress`, `branchName`, `branchAddress`) más `DocumentItem.sku` y `DocumentItem.taxName`; poblar al confirmar y dejar de leer los maestros en vivo.

**Corregido 2026-10-06:** la migración `20260929100000_document_item_lineage` (F1.1) **sí estaba aplicada**. El bootstrap reporta `12 migrations found … No pending migrations to apply` sobre la base local `nexus_erp`, y hay exactamente 12 carpetas en `server/prisma/migrations/`. La afirmación previa de que "no corrió en ninguna base" era falsa: corría contra mi memoria, no contra la base. Queda pendiente sólo verificar el entorno de Railway cuando vuelva a estar arriba.

### U5 — Maestros fiscales (**requiere migración y backfill**)

Condición IVA, domicilio fiscal, provincia, código postal, punto de venta como entidad, depósito por defecto por sucursal, condiciones de pago y alias. Es lo que realmente desbloquea la automatización fiscal. **Completada con U5 (slices 1–5, §7quinquies a §7novies).**

**Slice 1 aplicado (2026-10-06) — empresa y proveedor.** Columnas `address`, `province`, `postalCode`, `taxCondition` en `Company` y `Supplier`; `Document` suma 7 columnas de instantánea (`companyAddress`, `companyProvince`, `companyPostalCode`, `companyTaxCondition`, `supplierProvince`, `supplierPostalCode`, `supplierTaxCondition`). Ver §7quinquies.

**Slice 2 aplicado (2026-10-07) — cliente y alta rápida.** Columnas `province`, `postalCode`, `taxCondition` en `Client`; `Document` suma 3 instantáneas de cliente (`clientProvince`, `clientPostalCode`, `clientTaxCondition`); el botón "Nuevo Cliente" de POS revive con modal de alta. Ver §7sexies.

**Slice 3 aplicado (2026-10-07) — pago de proveedor.** Columnas `iibb`, `paymentAlias`, `paymentTerms` en `Supplier` y sus campos en el modal "Nuevo proveedor". Ver §7septies.

**Slice 4 aplicado (2026-10-07) — depósito por defecto por sucursal.** Columna `defaultWarehouseId` en `Branch`; ruta `PATCH /api/branches/:id` (valida que el depósito pertenezca a la sucursal); tab "Sucursales" en Configuración; recepción y remito de salida precargan el default. Ver §7octies.

**Slice 5 aplicado (2026-10-07) — punto de venta como entidad.** Modelo `SalePoint` (`puntos_venta`) con backfill de un PV por empresa; rutas CRUD `/api/sale-points`; tab "Puntos de venta" en Configuración; la factura usa el PV como serie (`0004`) y valida pertenencia a la sucursal. Ver §7novies. **U5 queda completa.**

### U6 — Moneda (sin migración, Verificar contra la base)

**Completada (2026-10-07)** — ver §7decies. Resumen:

- `Document.currency` ahora se resuelve del maestro: si el cliente no envía `currency`, el create lee `Company.currency` (antes siempre ganaba el default de columna y una empresa USD emitía comprobantes ARS).
- `currency` y `exchangeRate` entraron al schema Zod de `documentSchema` (antes Zod los descartaba en silencio y el comprobante caía a ARS/1 sin aviso).
- **Verificado contra la base**: de 95 comprobantes, 80 ARS + 15 USD (todos del seed, ninguno creado por la API) y `exchangeRate` = 1 en el 100%. La columna estaba muerta: sigue viva y ahora sincera (1 salvo que el caller mande uno — no hay fuente de tipo de cambio en el sistema todavía).
- `status` e `idempotencyKey` quedan **deliberadamente fuera** de `documentSchema`: el status lo deriva el servidor (un cliente no debe poder crear un 'Pagado'/'Anulado' a voluntad) y la idempotencia es exclusiva del flujo de recepción (`receiptSchema`, `z.uuid()`).

---

## 7bis. U3 — Cliente como entidad (completada 2026-10-06)

Cinco de cinco bullets implementados. El tercero (botón "Nuevo Cliente") se completó en U5 slice 2 (2026-10-07) — ver abajo y §7sexies.

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

- **"Nuevo Cliente" implementado (U5 slice 2, 2026-10-07).** Formulario inline en `PosView` (8 campos, nombre obligatorio), `POST /api/clients`, `onClientCreated` → recarga del maestro, nombre prefilled en el carrito. El alta queda acotada a POS; las demás vistas siguen con selector + find-or-create.
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
- Lado cliente resuelto en slice 2 (2026-10-07) con la alta rápida de POS (§7sexies).

---

## 7sexies. U5 slice 2 — Cliente fiscal + alta rápida "Nuevo Cliente" (aplicado 2026-10-07)

Columnas `province`, `postalCode`, `taxCondition` en `Client`; el documento congela 3 campos nuevos de cliente (`clientProvince`, `clientPostalCode`, `clientTaxCondition`) con instantánea-primero, relación viva como fallback. El botón muerto de POS vuelve a la vida con un modal de alta que persiste contra `/api/clients`.

| Archivo | Cambio |
|---|---|
| `server/prisma/schema.prisma` | `Client` +3 columnas fiscales, `Document` +3 instantáneas de cliente. Todas nullable, camelCase sin `@map` |
| `server/prisma/migrations/20261007090000_client_fiscal_identity/` | **Nueva**, aplicada (`clientes`, `comprobantes`). Sin backfill: el histórico queda NULL y se hidrata por fallback |
| `server/src/lib/headerSnapshots.ts` | Select/mapeo/tipos con los 3 campos de cliente; `HeaderSnapshotSource` y `withHeaderSnapshot` ganan el fallback a la relación viva |
| `server/src/routes/clients.routes.ts` | `clientSchema` +3 campos opcionales (máx 100/20/40); `clientUpdateSchema = partial()` los hereda |
| `server/test/documents-header-snapshot.unit.test.ts` | Mocks con las columnas nuevas; aserciones frozen-wins y legacy-fallback para los 3 campos de cliente |
| `src/types.ts` | `DocumentHeaderSnapshot` +3 campos de cliente |
| `src/lib/clientSelection.ts` | `ClientOption` +3 campos fiscales opcionales |
| `src/lib/mappers.ts` | `ApiDocument.client` +3 campos, snapshot +3, `headerSnapshotOf` +3 con fallback vivo |
| `src/components/views/PosView.tsx` | Prop `onClientCreated?`, estado `clientModal`, `openClientModal`/`closeClientModal`/`handleCreateClient`, botón "Nuevo Cliente" con `onClick`, modal inline (8 campos: Nombre obligatorio, CUIT/NIF, Email, Teléfono, Domicilio Fiscal, Provincia, Código Postal, Condición frente al IVA) |
| `src/App.tsx` | `<PosView onClientCreated={() => void loadClients()}>` |

### Evidencia

Batería (orquestador): frontend `vitest` **42/42**, `tsc` 0, `build` 0; server **68 tests / 66 pass / 1 fail / 1 skip** en serie (`--test-concurrency=1`; único fallo = preexistente `branch-boundaries.test.ts:141`), `tsc` server 0.

Vivo (API local :3001): `POST /api/clients` crea id 298 con provincia/código postal/condición IVA; `GET /api/clients` los hidrata; `PATCH /api/clients/298` persiste (`postalCode` → 5001). El id 299 (creado para la prueba de acentos) se eliminó; el 298 queda como fixture "Cliente Fiscal Test" con el nombre normalizado. La prueba de acentos (payload UTF-8 real por archivo, `HEX(province)` = `43C3B372646F6261`) confirma que el stack guarda acentos correctamente; el primer intento con acento se corrompió en la codepage de la consola de Windows **antes** de entrar al API, no en el servidor.

### Decisiones

- `taxCondition` sigue siendo **texto libre** en la UI de cliente, igual que proveedor (sin enum fijo).
- El alta vive dentro de POS (modal inline, mismo patrón que cash/split): no se agrega una pantalla CRUD de clientes ni se reutiliza `Modal.tsx`; el scope era revivir el botón muerto, no construir un mantenedor.
- Tras crear, el nombre queda prefilled en el carrito (`setClientName`) y `onClientCreated` recarga el maestro para que el selector matchee por id en la próxima venta.
- No tocar `branch-boundaries.test.ts:141` (400 !== 404) — sigue como único fallo preexistente.

---

## 7septies. U5 slice 3 — Pago de proveedor (aplicado 2026-10-07)

Columnas `iibb`, `paymentAlias` y `paymentTerms` en `Supplier`, con sus campos en el modal "Nuevo proveedor". Datos operativos de pago (no fiscal de cabecera): **no** se congelan en `Document` — la instantánea sigue siendo identidad + domicilio + condición IVA.

| Archivo | Cambio |
|---|---|
| `server/prisma/schema.prisma` | `Supplier` +3 columnas: `iibb` (VARCHAR 80), `paymentAlias` (VARCHAR 50), `paymentTerms` (VARCHAR 80). Nullable, camelCase sin `@map` |
| `server/prisma/migrations/20261007120000_supplier_payment/` | **Nueva**, aplicada (`proveedores`). El bootstrap del server la auto-aplicó al reiniciar (`migrate deploy` en arranque), confirmado en `_prisma_migrations` |
| `server/src/routes/suppliers.routes.ts` | `supplierSchema` +3 campos opcionales nullable; `supplierUpdateSchema = partial()` los hereda |
| `src/types.ts` | `Supplier` +3 campos |
| `src/components/views/PurchasesView.tsx` | Modal "Nuevo proveedor": estado + POST + reset + 3 inputs (IIBB, Alias de Pago, Condiciones de Pago) |

### Evidencia

Batería (orquestador): frontend `vitest` **42/42**, `tsc` 0, `build` 0, `tsc` server 0; server **68 tests / 66 pass / 1 fail / 1 skip** en serie (`--test-concurrency=1`; único fallo = preexistente `branch-boundaries.test.ts:141`).

Vivo (API local :3001): `POST /api/suppliers` crea id 73 con `iibb=Exento`, `paymentAlias=proveedor.test.mp`, `paymentTerms=Contado / 30 dias`; `GET /api/suppliers/73` los hidrata; `PATCH /api/suppliers/14` persiste `iibb=Convenio Multilateral` y `paymentTerms=Contado / 30 / 60 / 90 dias`.

### Decisiones

- Los tres campos son **texto libre** (mismo criterio que `taxCondition`), con longitudes acotadas. No hay enum de plazos ni validación de formato de alias/CVU por ahora.
- No se agregan a la instantánea de `Document`: condiciones de pago y alias son datos de operación con el proveedor, no identidad fiscal congelada en la cabecera. Si mañana se quieren en el comprobante, es un slice aparte.
- Fixture live: id 73 "Proveedor Pago Test" queda en la base de dev junto a 14 y 63.

---

## 7octies. U5 slice 4 — Depósito por defecto por sucursal (aplicado 2026-10-07)

Cadena `Branch.defaultWarehouseId` → `Warehouse` (`depositos`), con prefill en recepción y despacho.

| Archivo | Cambio |
|---|---|
| `server/prisma/schema.prisma` | `Branch.defaultWarehouseId` (Int?, FK a `Warehouse`, `ON DELETE SET NULL`, relación `"BranchDefault"`); `Warehouse.defaultForBranches` |
| `server/prisma/migrations/20261007130000_branch_default_warehouse/` | **Nueva**, aplicada (auto por el bootstrap) |
| `server/src/routes/branches.routes.ts` | **Nuevo**: `PATCH /api/branches/:id` `{ defaultWarehouseId: int \| null }`, permiso `configuracion.escribir`, tenancy + validación de pertenencia del depósito a la sucursal |
| `server/src/routes/stock.routes.ts` | `GET /api/stock/warehouses` incluye `branch.defaultWarehouseId` (el frontend deriva sucursales de acá) |
| `src/types.ts` | `WarehouseOption.branch` y `BranchOption` llevan `defaultWarehouseId` |
| `src/lib/branch.ts` | `deriveBranches` propaga el default; nuevo `defaultWarehouseForBranch(warehouses, branchId)` |
| `src/components/views/SettingsView.tsx` | Tab **Sucursales**: por sucursal, selector de depósito por defecto (o "Sin depósito") |
| `src/components/views/GoodsReceiptView.tsx` | Prefill: default de la sucursal de la OC; sin default, el primer depósito de la sucursal (comportamiento previo) |
| `src/components/views/RemitoSalidaView.tsx` | Prefill del despacho diferido (PEDIDO sin depósito) con el default de la sucursal |

### Evidencia

Batería (orquestador): frontend `vitest` **44/44** (incluye 2 casos nuevos de `defaultWarehouseForBranch`), `tsc` 0, `build` 0, `tsc` server 0; server **69 tests / 67 pass / 1 fail / 1 skip** en serie (`--test-concurrency=1`; único fallo = preexistente `branch-boundaries.test.ts:141`). Nuevo `server/test/branches-default-warehouse.test.ts`: 403 sin permiso, 404 tenancy, 400 depósito inexistente, 400 depósito de otra sucursal, set + exposición en catálogo + clear.

Vivo (API local :3001, ana): `PATCH /api/branches/4` → `{defaultWarehouseId: 7}` 200 y `GET /api/stock/warehouses` expone `branch.defaultWarehouseId=7`; depósito de otra sucursal → 400; `{defaultWarehouseId: null}` → 200 y queda null.

### Decisiones

- **Default ≠ lock.** Las vistas precargan el default pero el operador puede cambiarlo por documento; es una mejora del flujo existente, no un forzado.
- **POS queda fuera a propósito**: `posSaleLines` ya elige depósito por línea dentro de la sucursal seleccionada (primer depósito con stock suficiente), así que un default de sucursal no le aplica.
- Permiso: `configuracion.escribir`, mismo nivel que el PATCH de empresa. Sin `requireAssignedBranch`: un usuario con ese permiso puede configurar cualquier sucursal del tenant (consistente con la configuración de empresa).
- En `NewPurchaseOrderView` no se precarga: la OC puede llevarse a recepción, y ahí (GoodsReceiptView) el default sí aplica sobre la sucursal de la OC — el orden natural del flujo de compras.

---

## 7novies. U5 slice 5 — Punto de venta como entidad (aplicado 2026-10-07)

`SalePoint` (`puntos_venta`) es el maestro fiscal de puntos de venta: la factura deja de pedir un número libre y usa un PV registrado, con su número como serie del comprobante.

| Archivo | Cambio |
|---|---|
| `server/prisma/schema.prisma` | Modelo `SalePoint` (companyId, branchId, number, name; `@@unique([companyId, number])`); relaciones en `Company` y `Branch` |
| `server/prisma/migrations/20261007140000_sale_point/` | **Nueva**, aplicada; backfill: un PV 0001 por empresa (MIN de sus sucursales) |
| `server/src/routes/sale-points.routes.ts` | **Nuevo**: `GET /api/sale-points` (lectura con `configuracion.leer`\|`compras.leer`\|`ventas.leer` — alimenta Configuración y el form de factura), `POST`/`PATCH`/`DELETE` con `configuracion.escribir`, 409 duplicado por número, tenancy |
| `server/src/routes/app.ts` | Mount `/api/sale-points` |
| `server/src/routes/documents.routes.ts` | FACTURA: `series` = PV zero-padded (`0004`) cuando llega `invoice.puntoVenta` (folio reservado por PV vía `reserveNextNumber`); validación: si el comprobante tiene sucursal, el PV debe pertenecerle (400) |
| `src/types.ts` | `SalePointOption` |
| `src/App.tsx` | `loadSalePoints` + `handleAddSalePoint`/`handleDeleteSalePoint`; props a Configuración y RegistrarFacturaView |
| `src/components/views/SettingsView.tsx` | Tab **Puntos de venta**: alta (sucursal + número + nombre opcional), listado con borrado |
| `src/components/views/RegistrarFacturaView.tsx` | El input manual de PV → select de PVs de la sucursal activa (o de toda la empresa sin sucursal) |

### Evidencia

Batería (orquestador): frontend `vitest` **44/44** (sin helpers nuevos), `tsc` 0, `build` 0; server `tsc` 0; server **72 tests / 70 pass / 1 fail / 1 skip** en serie (único fallo = preexistente `branch-boundaries.test.ts:141`). Nuevos: `server/test/sale-points.test.ts` (CRUD, 403 sin permiso, 400 sucursal ajena, 409 duplicado, tenancy 404, delete 204) y `server/test/documents-invoice-sale-point.unit.test.ts` (series `0004` + snapshot PV; PV de otra sucursal → 400, sin crear documento).

Vivo (API local :3001, ana): `GET /api/sale-points` 1 PV (backfill); `POST` PV 2 en la sucursal 4 → 201; duplicado → 409; `PATCH` nombre → 200; `DELETE` → 204 y el GET vuelve a 1.

### Decisiones

- **Snapshots, no FK**: `InvoiceData.puntoVenta` sigue siendo `Int?` libre (congelado en la emisión). Borrar/reubicar un PV nunca invalida comprobantes ya emitidos — consistente con la filosofía de instantáneas de cabecera del repo.
- **Número único por empresa** (no por sucursal): la serie del comprobante se deriva del número del PV; si dos sucursales pudieran tener PV 0001, `(companyId, type, series, number)` colisionaría. AFIP real obliga por sucursal; acá un PV por sucursal se logra con números distintos.
- **Folio por PV**: la numeración ya existía (`reserveNextNumber` con `FOR UPDATE`); al derivar la serie del PV, el folio se reserva por PV automáticamente. La emisión "0001-00000042" queda consistente. La impresión fiscal simulada se implementó después como fase F slice 1 (ver §7undecies).
- **Edición = borrar y recrear** en la UI (PATCH existe en la API y se prueba, pero la tab sólo ofrece alta/borrado; renombrar = borrar y crear).
- **POS sin cambios**: `puntoVenta` no participa de `posSaleLines`; el PV es identidad fiscal del comprobante FACTURA, no del punto de venta operativo.
- El gate de lectura es ancho a propósito: la misma lista alimenta Configuración (`configuracion.leer`) y el formulario de factura (`compras`/`ventas`), y un operador de compras no tiene permisos de configuración.

---

## 7decies. U6 — Moneda y tipo de cambio desde `Company` (aplicado 2026-10-07)

| Archivo | Cambio |
|---|---|
| `server/src/routes/documents.routes.ts` | `documentSchema` gana `currency` (`z.string().length(3)`) y `exchangeRate` (`z.coerce.number().positive().max(1e9)`); el POST resuelve `effectiveCurrency = data.currency ?? Company.currency ?? 'ARS'` antes de la transacción; el create persiste `currency`/`exchangeRate` |

### Qué se verificó contra la base (persistente, MySQL `nexus_erp`)

- **95 comprobantes**: 80 ARS + 15 USD. Los 15 USD salieron todos del seed (`seed.ts`/`seed-ar-demo.ts` fijan `currency: 'USD'` explícitamente); **ninguno fue creado por la API** — el endpoint siempre dejaba ganar el default de columna (`'ARS'`). Bug confirmado: la empresa demo (`Nexus Enterprise Corp`, `currency: 'USD'`) emitía comprobantes ARS.
- **`exchangeRate` = 1 en el 100%** de la tabla: no existe ningún tipo de cambio real en el sistema. La columna estaba muerta — hoy queda viva y sincera: 1 salvo que el caller la envíe. Cuando exista una fuente de cotización real (fase de moneda completa), el create debería resolverla igual que la moneda.

### Decisiones

- **El maestro gana por defecto**: si el cliente envía `currency`, se respeta; si no, se lee `Company.currency` (el default de columna ya no decide nada). Un cliente API puede emitir en USD con `exchangeRate: 350` y hoy se persiste (antes: ARS/1 silencioso).
- **`status` queda fuera del schema a propósito**: el servidor deriva el estado del comprobante; admitirlo del cliente permitiría crear un `Pagado`/`Anulado` falso. **`idempotencyKey` también**: la idempotencia existe sólo en el flujo de recepción (`receiptSchema` exige `z.uuid()`); agregarla al POST genérico es la deuda ya anotada en la sección 8 (doble clic duplica documento) — pendiente de unidad propia.
- La UI **no cambió**: ningún form actual envía moneda en el create (la moneda operativa se edita en Configuración y el POS formatea con `Company.currency`). Esto fue corrección de servidor para consumidores de API y para cuando la UI necesite emitir en USD.

### Evidencia

Server `tsc` 0; unit tests del create **4/4** en el archivo extendido `server/test/documents-invoice-sale-point.unit.test.ts` (los 2 de PV + 2 nuevos: sin `currency` → maestro `USD`; con `currency: 'USD'` + `exchangeRate: 350` → el create los recibe). Batería completa en el commit. Verificación viva de creación de comprobante **no realizada a propósito**: el billing guarda las FACTURA y una COMPRA de prueba dejaría un comprobante basura consumiendo folio en la base de desarrollo — la prueba unitaria cubre exactamente la frontera del create.

---

## 7undecies. Fase F (slice 1) — Impresión fiscal simulada con QR AFIP (aplicado 2026-10-07)

Sin backend: `GET /api/documents/:id` ya devuelve todo lo necesario (contraparte, ítems, pagos, `invoiceData` y snapshot de cabecera). La impresión de facturas vive en **Compras** (`PurchasesView` filtra `PurchasesView` por `type: 'FACTURA'`; `SalesView` no lista facturas).

**Decisión de privacidad**: el QR se genera **localmente** (`qrcode`, sin red). Nada del comprobante sale del navegador; ningún servicio externo de QR ve una factura.

| Archivo | Cambio |
|---|---|
| `package.json` / `package-lock.json` | `qrcode` 1.5.4 + `@types/qrcode` (solo adiciones, +319 líneas de lockfile) |
| `src/lib/qrPayload.ts` | Builder puro del payload AFIP + `afipTipoCmp` (A=1, B=6, C=11, M=51) + `afipTipoDocRec` (80 si el id tiene 11 dígitos, 96 si no) |
| `src/lib/qrPayload.test.ts` | 4 tests vitest: roundtrip base64 del payload, formatos (totales 2 decimales sin separador de miles, moneda mayúscula), mapeos de letra y detección CUIT/DNI |
| `src/components/FacturaPrintModal.tsx` | Modal de impresión fiscal: cabecera empresa/folio, emisor/receptor con snapshot, tabla de ítems, totales, watermark «SIMULACIÓN» y chip «SIMULACIÓN — SIN VALIDEZ FISCAL»; QR solo si hay CAE y CUITs emisor/receptor con ≥8 dígitos |
| `src/components/views/PurchasesView.tsx` | Botón **Imprimir** (icono `print`) solo en filas `FACTURA`; `GET /api/documents/:id` al abrir |
| `src/index.css` | `@media print` ahora incluye `.print-fiscal` junto a `.print-order` (solo el detalle llega al papel) |

### Formato del QR (forma AFIP real, simulación)

`https://www.afip.gob.ar/fe/qr/?p=<base64(JSON)>` con `ver, fecha, cuit, ptoVta, tipoCmp, nroCmp, importe, moneda, ctz, tipoDocRec, nroDocRec, cae, imptoTotal, imptoTotConc, imptoTrib, imptoIVA`. Importes con `toFixed(2)` (nunca separador de miles); `ctz` como string; moneda en mayúsculas. `tipoDocRec` se resuelve tras quitar caracteres no numéricos: **80 (CUIT)** si quedan 11 dígitos, **96 (DNI)** si no — los CUIT de proveedores se guardan con guiones (`30-30112233-4`).

### Decisiones

- **El QR es identificación, no validación**: se dibuja cuando el comprobante tiene CAE simulado (`InvoiceData`) y ambos CUITs alcanzan la forma mínima. Si falta cualquiera de los dos, el modal muestra «Código QR no disponible» y habilita imprimir igual.
- **Emisor/receptor por dirección**: ingreso → emisor es el proveedor (`invoiceData.supplierCuit ?? supplier.taxId`), receptor la empresa; egreso → emisor la empresa, receptor el cliente.
- **Se mantiene el watermark**: aunque la forma es la de ARCA, esta factura no pasó por AFIP; la simulación queda explícita en pantalla y en papel.

### Evidencia

Frontend `tsc` 0; vitest **48/48** (44 previos + 4 `qrPayload.test.ts`); `npm run build` 0. **Verificación viva**: con el servidor levantado se leyó `GET /api/documents/45` (FACTURA A real de la base, USD 4957.84, CAE `70123456789654`, PV 4, 2 ítems) y se ejecutó el pipeline completo en Node: builder real + `qrcode` local produce `data:image/png` (8110 chars) con el payload AFIP decodificado correcto. Con los CUITs reales del seed (`30-30112233-4` -> `30301122334`, receptor `76.543.210-K` -> DNI `76543210`) el payload quedó `ver:1, tipoCmp:1, importe:'4957.84', moneda:'USD'`. El documento 45 tiene CUITs falsos (`A-12345678`) → el modal muestra correctamente «QR no disponible».

---

## 7duodecies. Deuda §8 — Anulación de OC (resuelto 2026-10-07)

`PATCH /api/documents/:id/status` era exclusivo de PEDIDO (`ventas.escribir` fijo). Ahora enruta por tipo y permite **OC: Abierto → Anulado**.

| Archivo | Cambio |
|---|---|
| `server/src/routes/documents.routes.ts` | Ruta con `requireAnyPermission('ventas.escribir', 'compras.escribir')`; dentro, permiso por dominio del documento (`DOCUMENT_PERMISSION[type]`, 403 si falta); `OC_TRANSITIONS = { Abierto: ['Anulado'] }`; guard de derivados: un PEDIDO con REMITO o una OC con **cualquier** documento derivado se rechazan con 409; audit con módulo Compras/Ventas según tipo |
| `server/test/oc-status.test.ts` | E2E (patrón de `pedido-status.test.ts`): Abierto→Anulado 200; Anulado terminal 400; 'En Proceso' rechazado 400; OC con REMITO derivado (insertado directo, sin efectos de stock) → 409. Cleanup de documentos creados |
| `src/types.ts`, `src/lib/mappers.ts` | `PurchaseOrder.status` expone el estado crudo (hasta acá el mapper derivaba y perdía `Anulado` → la fila mostraba "Pendiente", mentira de UI) |
| `src/lib/mappers.test.ts` | +1 assertion: `status: 'Anulado'` pasa intacto |
| `src/components/views/PurchasesView.tsx` | Chip "Anulado" en el estado de recepción; item **Anular** en el menú (solo OC no anuladas) con confirm y reload, estilo `PublicOrdersView` |

### Reglas

- **Anulado es terminal** y aparece solo para OC sin derivados: recibir (REMITO) o facturar bloquea la anulación con 409. El guard de PEDIDO se conserva idéntico (solo REMITO); el de OC mira cualquier hijo porque una OC puede derivar recepciones hoy y facturas mañana.
- **Permiso por dominio**: una ruta compartida no otorga `compras.escribir` a un usuario solo de ventas: el handler exige el permiso del tipo del documento tras cargarlo.
- La UI muestra el estado real (`Anulado` en rojo) y no ofrece anular dos veces.

### Evidencia

Server `tsc` 0; batería serial **75/73/1/1** (+1 test `oc-status.test.ts`, el único fail sigue siendo el preexistente `branch-boundaries.test.ts:141`, de `/receive`, ajeno a este cambio). Frontend `tsc` 0, vitest 48/48, build 0. El test e2e corre contra DB real y borra lo que crea.

---

## 7tredecies. Deuda §8 — Idempotencia del POST genérico y overrides en derivados (resuelto 2026-10-07)

Dos deudas del create: (5) el POST genérico no admitía `idempotencyKey` → doble clic duplica comprobante; (6) un cliente API podía mandar `unitPrice`/`discount` sobre un documento derivado y recibía 200 **con datos equivocados** porque el servidor los descartaba en silencio.

| Archivo | Cambio |
|---|---|
| `server/src/routes/documents.routes.ts` | `documentSchema` + `idempotencyKey: z.uuid().optional()`; al inicio de la transacción de creación, si la key ya existe para la empresa → **replay**: devuelve el documento original (200) sin consumir folio ni efectos secundarios; la key se persiste en el create; el índice `@@unique([companyId, idempotencyKey])` ya estaba (de `/receive`) y la carrera concurrente resuelve en el `.catch(P2002)` re-fetching el original |
| `server/src/routes/documents.routes.ts` (guard de overrides) | `itemSchema.discount` deja de tener `default(0)` (un 0 explícito debe distinguirse de la ausencia); en la resolución de líneas, un `unitPrice` o `discount` que no coincide (tolerancia 0.005) con el valor heredado del origen lanza **400** antes de cualquier efecto de stock |
| `server/test/documents-create-idempotency.test.ts` | **Nuevo**, e2e contra DB real: mismo comando + misma key → 200 con el mismo id (count = 1); clave reusada con otro body → 200 con el original (at-most-once, gana el primero); REMITO egreso derivado de PEDIDO con `unitPrice` override → 400; sin override → 201 e ítem hereda `unitPrice` del origen. Cleanup con restauración exacta de stock y movimientos |
| `server/test/documents-derived-integrity.unit.test.ts` | La pin vieja "source price must override the request" ahora es "rechaza override (400) y la herencia gana cuando el request no envía"; el fixture `delivery()` deja de mandar `unitPrice: 999` |

### Reglas

- **At-most-once, sin huella**: a diferencia de `/receive` (que hashea el comando y responde 409 ante contenido distinto), el POST genérico no fingerprintea el payload: reusar la key siempre devuelve el primer documento. Es la garantía anti-duplicación que necesita un doble clic o un retry de transporte; un cliente que reusa la key con otra intención recibe el original, nunca un segundo comprobante.
- **La herencia manda**: una línea derivada no puede sobreescribir precio/descuento; un override que no coincide con el origen es un 400 explícito, no un 200 mentiroso. La UI ya cooperaba (solo manda `sourceDocumentItemId` + `quantity`).
- **Sin migración**: columnas/índice de `idempotencyKey` ya existían (migración `20260927120000_receipt_idempotency`).

### Evidencia

Server `tsc` 0; batería serial **77/75/1/1** (+2 tests de `documents-create-idempotency.test.ts`; único fail: preexistente `branch-boundaries.test.ts:141`, de `/receive`, ajeno). `documents-derived-integrity.unit.test.ts` actualizado al contrato nuevo y verde. Frontend: sin cambios.

---

## 7quattuordecies. Deuda §8 — Validaciones de frontera en la creación (resuelto 2026-10-07)

Tres deudas del create: (2) `COTIZACION` con `sourceDocumentId` derivaba sin que ningún bloque la validara (los checks direccionales estaban condicionados a `isDirectionalType`); (3) un comprobante no direccional aceptaba `clientId` y `supplierId` simultáneos; (4) `series` aceptaba cualquier texto ≤10 caracteres y creaba serie de contador nueva sin control.

| Archivo | Cambio |
|---|---|
| `server/src/routes/documents.routes.ts` (schema) | `series` ahora se recorta y valida `^[A-Za-z0-9-_]{1,10}$` (400 `Serie inválida`); el `salePointSeries` de FACTURA (`0001`-style) y los `'A'` de la UI/camino público cumplen |
| `server/src/routes/documents.routes.ts` (mix) | El rechazo 400 `Un comprobante no puede mezclar cliente y proveedor` deja de estar condicionado a tipos direccionales: aplica a todo documento |
| `server/src/routes/documents.routes.ts` (derivación) | Para tipos no direccionales: `sourceDocumentId` → 400 `Solo los REMITO y las FACTURA se crean derivados de otro comprobante`; cualquier `sourceDocumentItemId` en las líneas → 400 `Solo los documentos derivados indican líneas de origen` (antes se ignoraba en silencio) |
| `server/test/documents-create-validations.test.ts` | **Nuevo**, e2e contra DB real: OC con cliente+proveedor → 400; `COTIZACION` derivada de una OC → 400; `VENTA` con línea de origen → 400; series `'C 1'` (espacio) y `'É'` (no-ASCII) → 400; serie `' B '` → 201 y queda `'B'` (trim). Cleanup de los documentos creados |
| `server/test/documents-header-snapshot.unit.test.ts` | El fixture del POST genérico usaba OC con cliente+proveedor a la vez para congelar ambos lados en un solo create; ahora es `PEDIDO` con cliente (el lado proveedor sigue cubierto por el test de `/receive`). El mock de permisos pasa a `ventas.escribir` |

### Reglas

- **Una contraparte por comprobante**: cliente y proveedor son mutuamente excluyentes en toda la clase documento; la instantánea de cabecera cubre ambos lados en caminos distintos (ventas vs compras), nunca en el mismo documento.
- **La derivación es privilegio de los direccionales**: `REMITO` y `FACTURA` tienen la cadena completa (lock, contraparte única, ramas, saldos, herencia de precios). Fuera de ellos, nombrar un origen es un 400 explícito.
- **Sin migración**: validaciones de entrada, no cambios de esquema.

### Evidencia

Server `tsc` 0; batería serial **78/76/1/1** (+1 test; único fail: preexistente `branch-boundaries.test.ts:141`, de `/receive`, ajeno). Frontend: sin cambios.

---

## 8. Deuda observada, fuera de alcance

Registrada para no perderla. No corregir sin una unidad propia.

| Hallazgo | Ubicación |
|---|---|
| `OC` creada por endpoint genérico sin `unitPrice` también cae a `salePrice`; es la misma clase de bug que el fix 3 de U1 | `documents.routes.ts:944` |
| `COTIZACION` con `sourceDocumentId` no valida nada: el bloque de trazabilidad está condicionado a `isDirectionalType`, que es `false` para ese tipo | Resuelto (2026-10-07) — fuera de los direccionales el origen es un 400 explícito; ver §7quattuordecies |
| Tipos no direccionales aceptan `clientId` y `supplierId` simultáneamente sin rechazo | Resuelto (2026-10-07) — 400 en toda la clase documento; ver §7quattuordecies |
| `series` nunca se valida: cualquier texto de ≤10 caracteres crea una serie de contador nueva | Resuelto (2026-10-07) — trim + `^[A-Za-z0-9-_]{1,10}$`; ver §7quattuordecies |
| `/receive` es el único camino con idempotencia; el POST genérico descarta `idempotencyKey` porque no está en el schema Zod → doble clic duplica documento | Resuelto (2026-10-07) — `POST /api/documents` acepta `idempotencyKey` (uuid opcional) con replay y carrera cubierta por el índice único; ver §7tredecies |
| `unitPrice`, `taxRate` y `discount` enviados sobre un documento derivado se **ignoran en silencio**; la UI coopera, pero un cliente API incorrecto recibe 200 con datos equivocados | Resuelto (2026-10-07) — un override que no coincide con el valor heredado es 400; ver §7tredecies |
| `PATCH /:id/external` fabrica `invoiceType: 'X'` si la factura no tiene `InvoiceData`, e ignora la contradicción con el maestro de proveedor | `documents.routes.ts:1654`, `:1754` |
| `externalNumber` es mutable después de la confirmación, contra la decisión 5 de `DOCUMENT_FLOW_PENDING.md` | `documents.routes.ts:1643-1647` |
| `OC` no tiene endpoint de anulación; `PATCH /:id/status` es sólo de `PEDIDO`. El estado `Anulado` figura en la UI sin camino de escritura | Resuelto (2026-10-07) — `PATCH /:id/status` ahora acepta OC (Abierto→Anulado) con guard de derivados y permiso `compras.escribir`; ver §7duodecies |
| `Payment.cashBoxId` existe y `CashBox` existe por sucursal, pero ningún camino de creación lo escribe | `schema.prisma:469` |
| `POST /api/public/store/:slug/orders` fija `discount: 0` en toda línea y `client.type: 'Mayorista'`, en contraste con el default `'Persona'` | `public.routes.ts:118`, `:132` |