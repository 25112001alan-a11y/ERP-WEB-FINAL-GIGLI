# Pendientes del flujo documental operativo

Este archivo conserva el contexto y el orden de trabajo para llevar compras, ventas, remitos, facturas, stock y pagos desde la demo transaccional actual hacia una simulación empresarial coherente.

> Alcance: simulación operativa y fiscal argentina. Mientras no exista integración fiscal real, todo CAE, punto de venta, QR o autorización debe identificarse como **SIMULACIÓN — SIN VALIDEZ FISCAL**.

## Seguimiento por iteración

Al cerrar cada unidad de trabajo, actualizar esta sección y el registro de avance. Informar al usuario: **qué se completó y cómo se verificó, qué falta, cuál es la próxima unidad y qué modelo/esfuerzo conviene**. No marcar una tarea como terminada sólo porque el código compila; distinguir implementación, prueba y despliegue.

> Companion: [`DOCUMENT_AUTOMATION.md`](./DOCUMENT_AUTOMATION.md) registra el **origen de datos y autocompletado** de cada documento (qué campo debería venir de qué maestro). Este archivo registra integridad y trazabilidad. U1–U3 viven en la matriz del companion; U4–U6 requieren migración.

**Cierre anterior — 2026-09-30 (F1.1):** trazabilidad por línea implementada; API y formularios muestran saldo pendiente; migración y concurrencia de recepciones verificadas en MySQL local descartable. Dos recepciones simultáneas de 5 unidades produjeron 201/409, un remito, un movimiento y stock 5. La migración conservó líneas históricas sin vínculo. Ninguna base persistente fue modificada.

**Iteración actual — F1.2, cierre de estado logístico (implementada; verificación unitaria y de compilación):** el último `REMITO` derivado de `PEDIDO` marca «Enviado» dentro de la misma transacción que crea el documento y descuenta stock. Un remito parcial conserva el estado previo. `PATCH /api/documents/:id/status` ya no admite «Enviado» manual y serializa los cambios con el despacho; tampoco permite «Anulado» si existe un remito. La interfaz retiró «Marcar enviado». El test backend sin base cubrió entrega parcial y final, rechazo manual y anulación tras entrega; pasaron 2/2 tests backend enfocados y 15/15 frontend relacionados, lint y ambas compilaciones. `git diff --check` pasó. No se repitió en esta iteración la prueba MySQL descartable de F1.2; ninguna base persistente fue modificada.

**Falta ahora:** los `PEDIDO` históricos que ya estaban marcados manualmente «Enviado» no se modificaron. Pueden seguir mostrando ese estado sin remitos suficientes; auditar los registros comparando cada línea del pedido con sus remitos derivados antes de decidir una corrección de datos. También falta planificar por separado las migraciones F0.2/F1.1 en el entorno persistente, con destino y respaldo definidos. Siguen pendientes F1.3/F1.4 y las fases fiscales/financieras simuladas. La prueba de compilación no equivale a un despliegue.

**Próxima unidad recomendada:** auditar los estados «Enviado» históricos contra remitos y saldos por línea, informar inconsistencias sin reescribirlas automáticamente y definir una remediación aprobada; después continuar con F1.3 (proyecciones sin doble conteo). **Modelo: GPT-6 Sol; esfuerzo: alto** para la auditoría y F1.3. Para documentación aislada, GPT-6 Luna con esfuerzo medio alcanza. Son recomendaciones de complejidad, no requisitos del sistema.

## Estado actual

El sistema ya tiene una base valiosa:

- persistencia multiempresa;
- transacciones para documentos, stock y auditoría;
- numeración interna con control de concurrencia;
- recepción de OC con creación de remito de ingreso;
- líneas documentales que congelan descripción, precio e impuesto;
- carga de datos y adjuntos de comprobantes de proveedor.

Todavía no representa un ERP operativo completo. Los documentos derivados ya validan su origen y saldo por línea, pero faltan comandos específicos para el despacho y la facturación, además de proyecciones que separen órdenes, logística, fiscalidad y pagos sin duplicar importes.

## Decisiones que deben conservarse

1. **Una sola autoridad por hecho.** Una recepción, un despacho, una factura y un pago se crean mediante operaciones específicas; no deben competir varios caminos genéricos.
2. **Los borradores se autocompletan; los documentos confirmados se congelan.** Empresa, cliente, proveedor, domicilios, condición fiscal, moneda e impuestos deben guardarse como snapshot histórico.
3. **La trazabilidad es por línea.** Copiar productos no alcanza: cada línea derivada debe conocer su línea origen, cantidad procesada y saldo pendiente.
4. **Stock, fiscalidad y dinero son eventos diferentes.** La recepción/despacho mueve stock; la factura genera deuda; el pago cancela saldo.
5. **Las correcciones son compensatorias.** Un documento confirmado no se edita ni borra; se revierte mediante devolución, nota de crédito/débito o evento equivalente.
6. **La simulación fiscal debe ser explícita.** No aparentar integración con ARCA mientras sólo se persistan datos ingresados manualmente.

## Flujo objetivo

### Compras

```text
Solicitud interna (opcional)
→ Orden de compra
→ Recepción física / remito del proveedor
→ Conciliación de cantidades
→ Captura de factura del proveedor
→ Conciliación OC / recepción / factura
→ Cuenta por pagar
→ Pago y retenciones, si corresponden
```

### Ventas

```text
Presupuesto o pedido
→ Reserva de stock
→ Preparación
→ Despacho / remito de salida
→ Salida física de stock
→ Factura
→ Cuenta por cobrar
→ Cobro
```

### Devoluciones

```text
Recepción física o devolución al proveedor
→ Movimiento compensatorio de stock
→ Nota de crédito vinculada
```

## Plan por unidades breves

### Fase 0 — Integridad inmediata

- [x] **F0.1 — Rechazar productos repetidos en una recepción.**
  - Evitar que dos líneas de la misma petición consuman el mismo saldo pendiente.
  - Agregar prueba enfocada de rechazo y conservar el happy path.
- [x] **F0.2 — Proteger recepciones concurrentes e idempotentes (implementación).**
  - La recepción exige un UUID estable por intento lógico, único por empresa y persistido en el remito.
  - La clave queda vinculada a un fingerprint SHA-256 calculado en backend sobre la OC y el payload canónico; cambiar depósito, ítems o metadatos con la misma clave devuelve conflicto.
  - Un replay con clave y payload idénticos devuelve el remito existente sin repetir stock ni auditoría; reutilizar la clave en otra operación devuelve conflicto.
  - La OC se bloquea con `SELECT ... FOR UPDATE` antes de releer estado, hijos y saldos pendientes.
  - Una clave nueva no puede crear otro remito cuando la OC ya quedó totalmente recibida.
  - **Evidencia MySQL:** dos recepciones simultáneas con claves distintas y cantidad total 5 devolvieron 201/409; quedó un remito, un movimiento y stock 5. Prueba en instancia local descartable, sin tocar datos persistentes.
- [x] **F0.3 — Validar coherencia del documento origen.**
  - [x] Recepción de OC: empresa y contraparte se derivan de la OC; depósito y sucursal deben coincidir con su alcance.
  - [x] Backend de FACTURA/REMITO derivados: contraparte, empresa, sucursal, depósito y dirección se validan y derivan del origen.
  - [x] Backend: el saldo de FACTURA/REMITO derivados se controla por línea origen bajo lock; rechaza duplicados, productos ajenos, ambigüedad de origen y excesos.
  - [x] Backend: una VENTA con REMITO sólo se factura desde el REMITO, y una VENTA facturada directamente no admite un REMITO posterior.
  - [x] Backend: el POST genérico no puede reproducir OC → REMITO de ingreso; debe usarse `/api/documents/:id/receive`.
  - [x] Frontend: ofrece sólo tipos de origen compatibles, reemplaza/bloquea la contraparte derivada, congela productos/precios y no reenvía una segunda verdad.
  - **Estado actual:** F1.1 expone el saldo por línea en API/UI y el backend vuelve a validarlo al guardar. La concurrencia se probó en MySQL descartable; falta aplicar la migración en el entorno persistente.
- [x] **F0.4 — Corregir permisos y sucursal.**
  - [x] Backend: REMITO/FACTURA de egreso exige Ventas; REMITO/FACTURA de ingreso exige Compras.
  - [x] Backend: documentos derivados rechazan contradicciones de sucursal/depósito y heredan esos datos del origen.
  - [x] Frontend: envía dirección explícita y no permite editar ni reenviar contraparte, sucursal o depósito derivados.
- [x] **F0.5 — Honestidad de interfaz (alcance UI completado; capacidades no implementadas).**
  - [x] Menú de Compras: retirar Ver, Editar y Anular mientras no tengan implementación válida; conservar Duplicar.
  - [x] Detalle de Ventas: retirar Imprimir; no se implementó impresión.
  - [x] Captura de comprobantes: sólo manual; los valores históricos OCR/Lector se muestran como legado, no prueban procesamiento y no se sobrescriben al guardar.
  - [x] Facturación: identificar la operación como simulada y sin validez fiscal en los accesos y el formulario.
  - **Fuera de alcance/no implementado:** anulación, impresión, OCR/Lector real e integración ARCA. Son capacidades futuras; no se ejecutan ni se simulan con estos cambios.

### Fase 1 — Trazabilidad y proyecciones

- [x] **F1.1 — Identidad de línea origen (wire-through implementado; migración pendiente de aplicar).**
  - [x] `DocumentItem.sourceDocumentItemId` nullable con FK autorreferente; migración creada, no aplicada.
  - [x] Nuevas FACTURA/REMITO derivados validan producto, cantidad y saldo por línea bajo el lock existente del documento origen; si el producto aparece en varias líneas, el cliente debe enviar el id exacto.
  - [x] Recepciones OC guardan la línea OC de origen; consumos vinculados se restan por línea y los históricos sin vínculo se reservan conservadoramente por producto, en orden de líneas.
  - [x] API: GET de documentos expone `pendingQuantity` por renglón, descontando consumos vinculados y asignando legados no vinculados de forma conservadora.
  - [x] La asignación de consumos históricos en GET usa el mismo orden de ID de línea que los POST, sin reordenar la respuesta; prueba HTTP con líneas invertidas y consumos vinculados/legados.
  - [x] UI: factura, remito de salida y recepción muestran cada renglón, envían `sourceDocumentItemId` y limitan la cantidad al saldo calculado; el backend sigue siendo autoridad.
  - [x] Probar las 12 migraciones en MySQL local descartable y la concurrencia real de recepciones; prueba opt-in en `server/test/f11-receipt.integration.ts`.
  - **Repetición de la prueba:** no integra `npm test`; requiere MySQL local aislado con datadir temporal `f11-<12hex>/data`, base `nexus_f11_<12hex>` y las variables `DATABASE_URL`, `F11_DISPOSABLE_DB` y `F11_LOCAL_DATADIR` concordantes. El test comprueba `@@datadir` antes de escribir.
  - [x] Probar upgrade con datos históricos: 11 migraciones previas, líneas existentes sin vínculo, migración de linaje y nuevo vínculo; las líneas históricas conservaron `sourceDocumentItemId = NULL`.
  - [ ] Aplicar migración `20260929100000_document_item_lineage` en el entorno.
  - **Rollback:** revertir proyección/API y formularios junto con el código de línea; la columna nueva es nullable y documentos históricos siguen siendo legibles.
- [ ] **F1.2 — Recepciones y despachos parciales reales.**
  - [x] Recepción y remitos derivados proponen y validan cantidad parcial por línea (F1.1).
  - [x] Semántica operativa confirmada: `VENTA` inmediata de POS versus `PEDIDO` con entrega diferida.
  - [x] `PEDIDO` → `REMITO` egreso descuenta stock en la transacción del remito y crea una `SALIDA` por línea; `VENTA` → `REMITO` no vuelve a descontar. El remito hereda depósito del pedido o exige elegir uno compatible con su sucursal.
  - [x] Pruebas HTTP sin base: entregas parciales, saldo agotado, depósito faltante/incompatible, stock insuficiente aun con `allowOversell`, ausencia de segundo descuento de POS y lock de origen antes de toda lectura no bloqueante. El GET proyecta el pendiente de `PEDIDO` y el formulario ofrece sólo pedidos con saldo.
  - [x] Probar concurrencia y rollback reales con dos remitos sobre el mismo pedido en MySQL local descartable; prueba HTTP opt-in `server/test/f12-dispatch.integration.ts`, 1/1 pasada tras 12 migraciones en una instancia temporal nueva.
  - **Repetición de la prueba:** requiere una instancia MySQL local nueva con datadir `f12-<12hex>/data` bajo el directorio temporal del SO, base `nexus_f12_<12hex>`, puerto loopback distinto de 3306 y variables concordantes `DATABASE_URL`, `F12_DISPOSABLE_DB`, `F12_LOCAL_DATADIR`. El test valida `@@datadir` antes de crear fixtures; no integra `npm test` ni debe ejecutarse sobre una base existente.
  - [x] Vincular `PEDIDO` «Enviado» con el despacho completo; el cambio manual ya no puede anticipar un remito y la anulación no oculta entregas parciales. Los estados históricos requieren auditoría separada.
- [ ] **F1.3 — Proyecciones sin doble conteo.**
  - Separar órdenes, movimientos logísticos, comprobantes fiscales y pagos.
  - Dashboard y reportes reconocen una sola vez cada hecho económico.
- [ ] **F1.4 — Comandos operativos específicos.**
  - `receive-purchase-order`, `dispatch-sale` e `invoice-from-sources` pasan a ser la autoridad.
  - El POST genérico queda limitado a borradores compatibles o uso interno.

### Fase 2 — Datos maestros y fiscalidad simulada

- [ ] **F2.1 — Perfil fiscal versionado de empresa.**
  - Razón social, CUIT ficticio/real, domicilios, condición IVA, IIBB, inicio de actividad y vigencia.
- [ ] **F2.2 — Perfil fiscal de clientes y proveedores.**
  - Domicilio fiscal y de entrega, condición tributaria y datos de contacto.
- [ ] **F2.3 — Snapshots automáticos.**
  - Congelar emisor, contraparte, moneda, cotización e impuestos al confirmar.
- [ ] **F2.4 — Motor de reglas fiscales.**
  - Proponer clase de factura según emisor, receptor, operación y vigencia.
  - Una factura de compra registra lo emitido por el proveedor; no lo inventa.
- [ ] **F2.5 — Simulador fiscal intercambiable.**
  - Autorizaciones y rechazos simulados, numeración por punto/tipo/clase y QR interno.
  - Marca visible **SIN VALIDEZ FISCAL**.
- [ ] **F2.6 — Notas de crédito y débito.**
  - Referencia obligatoria al documento original y efecto compensatorio.

### Fase 3 — Stock y logística

- [ ] **F3.1 — Reservas de stock por pedido.**
- [ ] **F3.2 — Salida física al confirmar despacho/remito.**
- [ ] **F3.3 — Entrada física al confirmar recepción.**
- [ ] **F3.4 — Picking, diferencias, faltantes y devoluciones.**
- [ ] **F3.5 — Eliminar caminos paralelos de COMPRA/REMITO que dupliquen stock.**

### Fase 4 — Cuentas corrientes y tesorería

- [ ] **F4.1 — Cuentas por cobrar y pagar con vencimientos y saldo.**
- [ ] **F4.2 — Pagos/cobros parciales y asignaciones a documentos.**
- [ ] **F4.3 — Recibos, retenciones y conciliación.**
- [ ] **F4.4 — Reportes financieros derivados del ledger, no del total documental.**

### Fase 5 — Integraciones reales opcionales

- [ ] **F5.1 — Adaptador ARCA WSAA/WSFE.** Requiere contribuyente, puntos de venta y credenciales reales.
- [ ] **F5.2 — OCR real con proveedor explícito y revisión humana.**
- [ ] **F5.3 — Reglas provinciales de IIBB, percepciones y traslado.** Configurables por jurisdicción y actividad.

## Pruebas de aceptación prioritarias

- [x] Dos recepciones concurrentes no superan la cantidad de la OC (MySQL descartable: 201/409, un remito y stock 5 de 5).
- [ ] Una recepción con el mismo producto repetido es rechazada sin mover stock.
- [ ] Una factura no puede cambiar la contraparte del documento origen.
- [ ] Una línea no puede facturarse o remitirse por encima de su saldo.
- [ ] Cambiar un proveedor no modifica documentos históricos confirmados.
- [ ] Las métricas no suman OC + remito + factura como tres gastos.
- [ ] Una devolución repone stock y genera un documento compensatorio.
- [ ] El modo simulado nunca genera un comprobante con apariencia de validez fiscal real.

## Registro de avance

| Fecha | Unidad | Estado | Evidencia |
|---|---|---|---|
| 2026-09-27 | Auditoría operativa y legal inicial | Completada | Revisión backend, frontend y normativa oficial; sin cambios de datos ni migraciones |
| 2026-09-27 | F0.1 — Rechazo de productos repetidos en recepción | Completada | Validación HTTP previa a la transacción y prueba enfocada sin acceso a base de datos |
| 2026-09-27 | F0.2 + recepción de F0.3 — Idempotencia, serialización y coherencia | Implementación completada; concurrencia MySQL probada el 2026-09-30 | UUID único por empresa, replay sin efectos, lock de OC previo a saldos, validación sucursal/depósito y prueba MySQL con dos claves distintas. Migración no aplicada en DB persistente |
| 2026-09-29 | F0.3/F0.4 backend — Integridad de FACTURA y REMITO derivados | Backend completado; frontend pendiente | Permiso por dirección, lock del origen, identidad derivada, saldo por producto, ramas incompatibles y pruebas HTTP/mocks sin DB |
| 2026-09-29 | F0.3/F0.4 frontend — Formularios derivados | Completada | Fuentes filtradas por dirección, contraparte reemplazada/bloqueada, líneas derivadas sin alta ni precio editable y direction explícita; tests Vitest del helper puro |
| 2026-09-29 | F0.5 — Honestidad de interfaz | Alcance UI completado; capacidades futuras | Se retiraron acciones sin implementación, se explicitaron captura manual y facturación simulada; no se implementaron anulación, impresión, OCR/Lector ni integración ARCA |
| 2026-09-29 | F1.1 — Identidad de línea origen | Wire-through implementado; migración pendiente de aplicar | FK nullable, saldo por línea en GET, IDs/pendientes en tres formularios, consumo legado conservador; migración no aplicada |
| 2026-09-30 | F1.1 — Verificación y orden del saldo legado | Tests enfocados y build correctos | 5 tests frontend, 2 backend y 1 regresión GET pasaron; build frontend, validación Prisma, lint y build server correctos. GET y POST asignan legados por ID de línea; prueba MySQL en la unidad siguiente |
| 2026-09-30 | F1.1 — Migración y concurrencia MySQL descartable | Pruebas completadas; despliegue pendiente | MySQL local 8.0.46: 12 migraciones aplicadas desde cero, upgrade con líneas históricas NULL y FK nuevo, y prueba concurrente 1/1 (201/409; un remito, un movimiento, stock 5 de 5). Instancias temporales apagadas y eliminadas; ninguna DB persistente modificada |
| 2026-09-30 | F1.2 — Diagnóstico del despacho | Diagnóstico completado; decisión operativa pendiente | F1.1 ya cubre cantidades parciales. VENTA genera SALIDA al crearse y REMITO egreso no mueve stock; agregar ambos efectos duplicaría stock. Se recomienda separar POS inmediato de PEDIDO con despacho diferido |
| 2026-09-30 | F1.2 — Despacho parcial de PEDIDO | Implementado; integración MySQL pendiente | `PEDIDO` → `REMITO` genera salida atómica y `VENTA` → `REMITO` no duplica. La revisión independiente detectó una lectura previa al lock; corregida y cubierta por orden de eventos HTTP. 2 tests HTTP backend y 6 del helper frontend pasaron; lint, builds y `git diff --check` correctos. Sin migración ni acceso a base persistente |
| 2026-09-30 | F1.2 — Concurrencia y rollback en MySQL descartable | Prueba completada; despliegue pendiente | MySQL 8.0.46 local, datadir temporal único y puerto loopback: 12 migraciones, test HTTP 1/1, concurrencia 201/409 con un remito, una SALIDA, stock 5 de 10 y pendiente 0; segunda salida fallida revierte documento/movimiento/stock. Instancia apagada y eliminada. No se tocó una base persistente |
| 2026-09-30 | F1.2 — Estado «Enviado» por despacho completo | Implementado; integración MySQL de esta unidad pendiente | REMITO final actualiza PEDIDO en la transacción de stock; parcial no lo hace. PATCH manual rechaza «Enviado» y «Anulado» con remitos. UI sin avance manual. Tests backend 2/2, frontend 15/15, lint, compilaciones y `git diff --check` correctos. Estados históricos no saneados |

## Orden recomendado de trabajo

La próxima unidad acotada es auditar `PEDIDO` históricos «Enviado» contra remitos y saldos por línea, sin mutarlos automáticamente. Luego revisar proyecciones F1.3. Modelo recomendado: GPT-6 Sol, razonamiento alto, porque la auditoría cruza estado y trazabilidad legada. Planificar aparte el despliegue de las migraciones F0.2/F1.1 en el entorno persistente; las pruebas descartables no aplicaron cambios allí. F0.5 cerró sólo la honestidad de la interfaz: anulación, impresión, OCR/Lector e integración ARCA no están implementados. No comenzar fiscalidad ni tesorería antes de cerrar las invariantes operativas.
