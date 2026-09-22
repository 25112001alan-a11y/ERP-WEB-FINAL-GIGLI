import { Router } from 'express';
import { z } from 'zod';
import multer from 'multer';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { DocumentType } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import {
  requireAuth,
  requirePermission,
  requireAnyPermission,
  tenantWhere,
  getUserPermissions,
} from '../middleware/auth.js';
import { logAudit, clientIp } from '../lib/audit.js';
import { reserveNextNumber } from '../lib/numbering.js';
import { assertDocCreationAllowed } from '../lib/billing.js';
import { parsePositiveInt } from '../lib/params.js';

const router = Router();

router.use(requireAuth);

// Supplier voucher attachments live in UPLOADS_DIR (server/uploads by default,
// a persistent volume in production). They are NOT exposed as a static
// directory: the only way to read them is
// GET /api/documents/:id/external/attachment, which authenticates and scopes
// the request to the tenant. attachmentUrl stores an opaque storage key
// (`/uploads/<generated-name>`), not a public URL. Swap to S3/R2 later without
// changing the API surface.
import { uploadsDir } from '../lib/uploads.js';

const ALLOWED_EXT = new Set(['.pdf', '.jpg', '.jpeg', '.png', '.webp']);

type SniffedMime = 'application/pdf' | 'image/jpeg' | 'image/png' | 'image/webp';

/** Identifies the real type from the leading bytes, never from the file name. */
function sniffMime(buf: Buffer): SniffedMime | null {
  if (buf.length >= 5 && buf.subarray(0, 5).toString('latin1') === '%PDF-') return 'application/pdf';
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (
    buf.length >= 8 &&
    buf[0] === 0x89 &&
    buf[1] === 0x50 &&
    buf[2] === 0x4e &&
    buf[3] === 0x47 &&
    buf[4] === 0x0d &&
    buf[5] === 0x0a &&
    buf[6] === 0x1a &&
    buf[7] === 0x0a
  ) {
    return 'image/png';
  }
  if (
    buf.length >= 12 &&
    buf.subarray(0, 4).toString('latin1') === 'RIFF' &&
    buf.subarray(8, 12).toString('latin1') === 'WEBP'
  ) {
    return 'image/webp';
  }
  return null;
}

// The stored extension is derived from the sniffed content, so the original
// file name can never decide what extension the server writes.
const EXT_BY_MIME: Record<SniffedMime, string> = {
  'application/pdf': '.pdf',
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
};

// Memory storage: the buffer must be inspected (magic bytes) before anything
// touches disk. 10 MB is safe to hold in memory for a single request.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (!ALLOWED_EXT.has(ext)) {
      const err = Object.assign(new Error('Extensión no permitida. Solo .pdf, .jpg, .png o .webp'), {
        status: 400,
      });
      (cb as (error: Error, acceptFile: boolean) => void)(err, false);
      return;
    }
    cb(null, true);
  },
});

// Document types map to their owning module. VENTA/PEDIDO/COTIZACION belong to
// sales; OC/COMPRA/REMITO belong to purchases. FACTURA depends on direction:
// supplier => purchases, client => sales (resolved inline in the handler).
const DOCUMENT_PERMISSION: Record<DocumentType, string> = {
  [DocumentType.OC]: 'compras.escribir',
  [DocumentType.COMPRA]: 'compras.escribir',
  [DocumentType.REMITO]: 'compras.escribir',
  [DocumentType.COTIZACION]: 'ventas.escribir',
  [DocumentType.VENTA]: 'ventas.escribir',
  [DocumentType.PEDIDO]: 'ventas.escribir',
  [DocumentType.FACTURA]: 'compras.escribir', // overridden inline for client sales invoices
};

const itemSchema = z.object({
  productId: z.number().int().positive(),
  quantity: z.number().positive(),
  unitPrice: z.number().positive().optional(),
  discount: z.number().nonnegative().optional().default(0),
});

const invoiceSchema = z.object({
  invoiceType: z.enum(['A', 'B', 'C', 'X']),
  cae: z.string().max(14).optional(),
  caeDueDate: z.string().datetime().optional(),
  puntoVenta: z.number().int().positive().optional(),
});

const paymentSchema = z.object({
  method: z.enum(['Efectivo', 'Tarjeta', 'QR / Transf.']),
  amount: z.number().positive(),
});

const documentSchema = z.object({
  type: z.enum(['OC', 'COMPRA', 'VENTA', 'COTIZACION', 'REMITO', 'PEDIDO', 'FACTURA']),
  series: z.string().max(10).optional().default('A'),
  date: z.string().datetime().optional(),
  clientId: z.number().int().positive().optional(),
  clientName: z.string().min(1).max(150).optional(),
  supplierId: z.number().int().positive().optional(),
  supplierName: z.string().min(1).max(150).optional(),
  branchId: z.number().int().positive().optional(),
  warehouseId: z.number().int().positive().optional(),
  destinationWarehouseId: z.number().int().positive().optional(),
  sourceDocumentId: z.number().int().positive().optional(),
  externalNumber: z.string().max(50).optional(),
  paymentMethod: z.string().max(30).optional(),
  // Split payments (POS "Dividir Pago"). Optional: when present it wins over
  // the legacy single paymentMethod and creates one Payment row per entry.
  payments: z.array(paymentSchema).min(1).max(10).optional(),
  invoice: invoiceSchema.optional(),
  notes: z.string().optional(),
});

/** GET /api/documents — tenant-scoped list with totals */
router.get('/', requireAnyPermission('ventas.leer', 'compras.leer'), async (req, res) => {
  const { type } = req.query;
  let typeFilter: DocumentType | undefined;
  if (type !== undefined) {
    const parsedType = documentSchema.shape.type.safeParse(type);
    if (!parsedType.success) {
      res.status(400).json({ error: 'Tipo de documento inválido' });
      return;
    }
    typeFilter = parsedType.data;
  }
  const documents = await prisma.document.findMany({
    where: {
      ...tenantWhere(req),
      ...(typeFilter ? { type: typeFilter } : {}),
    },
    include: {
      client: { select: { id: true, name: true, type: true, phone: true } },
      supplier: { select: { id: true, name: true } },
      warehouse: { select: { name: true } },
      payments: { select: { id: true, method: true, status: true } },
      invoiceData: {
        select: {
          id: true,
          supplierCuit: true,
          supplierName: true,
          externalTotal: true,
          ingestionMethod: true,
          attachmentUrl: true,
        },
      },
      items: {
        select: {
          id: true,
          productId: true,
          description: true,
          quantity: true,
          unitPrice: true,
          lineTotal: true,
        },
      },
    },
    orderBy: { createdAt: 'desc' },
  });
  res.json(documents);
});

/** GET /api/documents/:id */
router.get('/:id', requireAnyPermission('ventas.leer', 'compras.leer'), async (req, res) => {
  const id = parsePositiveInt(req.params.id);
  if (id === null) {
    res.status(400).json({ error: 'Parámetro inválido' });
    return;
  }
  const document = await prisma.document.findFirst({
    where: { id, ...tenantWhere(req) },
    include: {
      client: true,
      supplier: true,
      user: { select: { id: true, firstName: true, lastName: true } },
      branch: { select: { name: true } },
      warehouse: { select: { name: true } },
      destinationWarehouse: { select: { name: true } },
      sourceDocument: { select: { id: true, type: true, number: true, series: true } },
      items: { include: { product: { select: { id: true, name: true, internalCode: true } } } },
      payments: true,
      stockMovements: true,
      invoiceData: {
        include: {
          verifiedBy: { select: { id: true, firstName: true, lastName: true } },
        },
      },
    },
  });
  if (!document) {
    res.status(404).json({ error: 'Comprobante no encontrado' });
    return;
  }
  res.json(document);
});

/**
 * PATCH /api/documents/:id/status — PEDIDO lifecycle only:
 *   Abierto → En Proceso → Enviado (terminal), any → Anulado (terminal).
 * The receive/pay flows don't apply to PEDIDO (receive is OC-only, payments
 * attach at creation), so Enviado is the terminal fulfilled state.
 */
const pedidoStatusSchema = z.object({
  status: z.enum(['En Proceso', 'Enviado', 'Anulado']),
});

const PEDIDO_TRANSITIONS: Record<string, string[]> = {
  Abierto: ['En Proceso', 'Anulado'],
  'En Proceso': ['Enviado', 'Anulado'],
  Enviado: [],
  Anulado: [],
};

router.patch('/:id/status', requirePermission('ventas.escribir'), async (req, res) => {
  const id = parsePositiveInt(req.params.id);
  if (id === null) {
    res.status(400).json({ error: 'Parámetro inválido' });
    return;
  }
  const parsed = pedidoStatusSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Estado inválido', details: parsed.error.flatten() });
    return;
  }
  const next = parsed.data.status;

  const result = await prisma.$transaction(async (tx) => {
    const document = await tx.document.findFirst({
      where: { id, companyId: req.authUser!.companyId },
      select: { id: true, type: true, status: true, series: true, number: true },
    });
    if (!document) throw Object.assign(new Error('Comprobante no encontrado'), { status: 404 });
    if (document.type !== DocumentType.PEDIDO) {
      throw Object.assign(new Error('Solo los PEDIDO cambian de estado por esta vía'), { status: 400 });
    }
    const allowed = PEDIDO_TRANSITIONS[document.status] ?? [];
    if (!allowed.includes(next)) {
      throw Object.assign(new Error(`Transición no permitida de ${document.status} a ${next}`), {
        status: 400,
      });
    }
    const updated = await tx.document.update({ where: { id }, data: { status: next } });
    await logAudit(
      tx,
      req.authUser!.companyId,
      req.authUser!.userId,
      {
        action: 'Cambio de estado de Pedido',
        module: 'Ventas',
        entity: 'Document',
        entityId: id,
        details: `PEDIDO ${document.series}-${String(document.number).padStart(4, '0')}: ${document.status} → ${next}`,
      },
      clientIp(req),
    );
    return updated;
  });

  res.json(result);
});

/**
 * POST /api/documents
 * Creates a document with its items. Stock side effects by type:
 *   - VENTA           : decrements warehouse stock, writes SALIDA movements
 *   - COMPRA          : increments warehouse stock, writes ENTRADA movements
 *   - REMITO (ingreso): increments warehouse stock, writes ENTRADA movements
 *                       (supplier delivers goods; the movement mirrors /receive)
 *   - REMITO (egreso) : no stock effect (the chained VENTA already moved it)
 *   - FACTURA         : no stock effect; optionally creates a Payment and
 *                       persists fiscal data (invoiceType, CAE) in InvoiceData
 * Payments: the legacy `paymentMethod` creates a single Payment row for the
 * full total; the optional `payments: [{ method, amount }]` array creates one
 * row per entry and must sum to the total (400 on mismatch).
 * Other types are created without stock side effects.
 * Fiscal numbering is auto-incremented per (companyId, type, series).
 */
router.post('/', requireAnyPermission('ventas.escribir', 'compras.escribir'), async (req, res) => {
  // SaaS plan gate: the Free plan caps monthly document creation.
  try {
    await assertDocCreationAllowed(req.authUser!.companyId);
  } catch (err) {
    if ((err as { status?: number }).status === 402) {
      const e = err as { message: string; plan?: unknown; checkoutUrl?: string | null };
      res.status(402).json({ error: e.message, plan: e.plan ?? null, checkoutUrl: e.checkoutUrl ?? null });
      return;
    }
    throw err;
  }

  const bodyParsed = documentSchema.safeParse(req.body);
  if (!bodyParsed.success) {
    res.status(400).json({ error: 'Datos inválidos', details: bodyParsed.error.flatten() });
    return;
  }
  const itemsRaw = z.array(itemSchema).min(1, 'Debe incluir al menos un ítem').safeParse(req.body.items);
  if (!itemsRaw.success) {
    res.status(400).json({ error: 'Ítems inválidos', details: itemsRaw.error.flatten() });
    return;
  }
  const data = bodyParsed.data;
  const type = data.type as DocumentType;

  const hasClient = Boolean(data.clientId || data.clientName);
  const hasSupplier = Boolean(data.supplierId || data.supplierName);

  // Permission depends on the document's owning module (sales vs purchases).
  // A sales FACTURA (clientId) belongs to Ventas; every other direction follows
  // the static map.
  const requiredPermission =
    type === DocumentType.FACTURA && hasClient && !hasSupplier
      ? 'ventas.escribir'
      : DOCUMENT_PERMISSION[type];
  const userPermissions = await getUserPermissions(req);
  if (!userPermissions.has(requiredPermission)) {
    res.status(403).json({ error: `Permiso requerido: ${requiredPermission}` });
    return;
  }

  const isStockType = type === DocumentType.VENTA || type === DocumentType.COMPRA;
  // Physical receipt from a supplier: stock ENTRADA even without an OC chain.
  const isRemitoIngreso = type === DocumentType.REMITO && hasSupplier;

  if ((isStockType || isRemitoIngreso) && !data.warehouseId) {
    res.status(400).json({ error: `Los comprobantes ${type} requieren warehouseId` });
    return;
  }
  if (type === DocumentType.VENTA && !hasClient) {
    res.status(400).json({ error: 'Los comprobantes VENTA requieren clientId o clientName' });
    return;
  }
  if (type === DocumentType.COMPRA && !hasSupplier) {
    res.status(400).json({ error: 'Los comprobantes COMPRA requieren supplierId o supplierName' });
    return;
  }
  if (type === DocumentType.REMITO && (hasClient === hasSupplier)) {
    res.status(400).json({
      error: 'Los comprobantes REMITO requieren exactamente un cliente (egreso) o proveedor (ingreso)',
    });
    return;
  }
  if (type === DocumentType.FACTURA && (hasClient === hasSupplier)) {
    res.status(400).json({
      error: 'Los comprobantes FACTURA requieren exactamente un cliente o proveedor',
    });
    return;
  }
  if (type === DocumentType.FACTURA && !data.invoice) {
    res.status(400).json({ error: 'Los comprobantes FACTURA requieren datos fiscales (invoice)' });
    return;
  }

  // Valid chaining: a REMITO de ingreso evolves from an OC/COMPRA; a REMITO de
  // egreso dispatches a VENTA/PEDIDO; a FACTURA references its business doc.
  const ALLOWED_SOURCE_IN: DocumentType[] = [DocumentType.OC, DocumentType.COMPRA];
  const ALLOWED_SOURCE_OUT: DocumentType[] = [DocumentType.VENTA, DocumentType.PEDIDO];

  const result = await prisma.$transaction(async (tx) => {
    // Tenancy + existence checks for referenced entities.
    let clientId = data.clientId;
    if (clientId) {
      const client = await tx.client.findFirst({
        where: { id: clientId, ...tenantWhere(req) },
      });
      if (!client) throw Object.assign(new Error('Cliente no válido'), { status: 400 });
    } else if (data.clientName) {
      // Find-or-create a client by name so the POS can sell to a free-typed customer.
      const existing = await tx.client.findFirst({
        where: { companyId: req.authUser!.companyId, name: data.clientName },
      });
      if (existing) {
        clientId = existing.id;
      } else {
        const created = await tx.client.create({
          data: { companyId: req.authUser!.companyId, name: data.clientName },
        });
        clientId = created.id;
      }
    }

    let supplierId = data.supplierId;
    if (supplierId) {
      const supplier = await tx.supplier.findFirst({
        where: { id: supplierId, ...tenantWhere(req) },
      });
      if (!supplier) throw Object.assign(new Error('Proveedor no válido'), { status: 400 });
    } else if (data.supplierName) {
      const existing = await tx.supplier.findFirst({
        where: { companyId: req.authUser!.companyId, name: data.supplierName },
      });
      if (existing) {
        supplierId = existing.id;
      } else {
        const created = await tx.supplier.create({
          data: { companyId: req.authUser!.companyId, name: data.supplierName },
        });
        supplierId = created.id;
      }
    }
    if (data.warehouseId) {
      const warehouse = await tx.warehouse.findFirst({
        where: { id: data.warehouseId, ...tenantWhere(req) },
      });
      if (!warehouse) throw Object.assign(new Error('Depósito no válido'), { status: 400 });
    }

    // Source-document chaining validation (when provided).
    let sourceStatus: string | null = null;
    if (data.sourceDocumentId) {
      const source = await tx.document.findFirst({
        where: { id: data.sourceDocumentId, ...tenantWhere(req) },
        select: { type: true, status: true },
      });
      if (!source) {
        throw Object.assign(new Error('Documento origen no válido'), { status: 400 });
      }
      if (type === DocumentType.REMITO) {
        const allowed = hasSupplier ? ALLOWED_SOURCE_IN : ALLOWED_SOURCE_OUT;
        if (!allowed.includes(source.type)) {
          throw Object.assign(new Error(`Origen ${source.type} no válido para un REMITO ${hasSupplier ? 'de ingreso' : 'de egreso'}`), { status: 400 });
        }
      }
      if (type === DocumentType.FACTURA) {
        const allowed = hasSupplier
          ? [...ALLOWED_SOURCE_IN, DocumentType.REMITO]
          : [...ALLOWED_SOURCE_OUT, DocumentType.REMITO];
        if (!allowed.includes(source.type)) {
          throw Object.assign(new Error(`Origen ${source.type} no válido para la FACTURA`), { status: 400 });
        }
      }
      sourceStatus = source.status;
    }

    // Resolve product lines: price/tax from catalog unless overridden.
    const lines: {
      productId: number;
      quantity: number;
      unitPrice: number;
      taxRate: number;
      discount: number;
      lineTotal: number;
      taxAmount: number;
      product: { id: number; name: string; internalCode: string | null; allowOversell: boolean };
    }[] = [];

    for (const item of itemsRaw.data) {
      const product = await tx.product.findFirst({
        where: { id: item.productId, ...tenantWhere(req) },
        include: { tax: true },
      });
      if (!product) throw Object.assign(new Error(`Producto ${item.productId} no válido`), { status: 400 });

      const unitPrice = item.unitPrice ?? Number(product.salePrice);
      const taxRate = Number(product.tax.rate);
      const gross = unitPrice * item.quantity;
      const lineTotal = gross - item.discount;
      lines.push({
        productId: product.id,
        quantity: item.quantity,
        unitPrice,
        taxRate,
        discount: item.discount,
        lineTotal,
        taxAmount: (lineTotal * taxRate) / 100,
        product: {
          id: product.id,
          name: product.name,
          internalCode: product.internalCode,
          allowOversell: product.allowOversell,
        },
      });
    }

    // Stock availability for sales (REMITO ingreso uses upsert, no pre-check).
    if (type === DocumentType.VENTA || type === DocumentType.COMPRA) {
      for (const line of lines) {
        const stock = await tx.stock.findUnique({
          where: {
            productId_warehouseId: { productId: line.productId, warehouseId: data.warehouseId! },
          },
        });
        if (!stock) {
          throw Object.assign(new Error(`Sin stock registrado para ${line.product.name}`), {
            status: 409,
          });
        }

        if (type === DocumentType.VENTA) {
          const current = Number(stock.quantity);
          if (current < line.quantity && !line.product.allowOversell) {
            throw Object.assign(
              new Error(`Stock insuficiente para ${line.product.name} (disponible: ${current})`),
              { status: 409 },
            );
          }
        }
      }
    }

    const subtotal = lines.reduce((acc, l) => acc + l.lineTotal, 0);
    const totalTax = lines.reduce((acc, l) => acc + l.taxAmount, 0);
    const total = subtotal + totalTax;

    // Split payments must add up to the document total (cent tolerance).
    if (data.payments) {
      const paid = data.payments.reduce((acc, p) => acc + p.amount, 0);
      if (Math.abs(paid - total) > 0.01) {
        throw Object.assign(
          new Error(`La suma de los pagos ($${paid.toFixed(2)}) debe ser igual al total ($${total.toFixed(2)})`),
          { status: 400 },
        );
      }
    }

    let status = data.paymentMethod || data.payments ? 'Pagado' : 'Abierto';
    if (type === DocumentType.COMPRA) status = 'Recibido';
    if (type === DocumentType.REMITO) status = hasSupplier ? 'Recibido' : 'Entregado';
    if (type === DocumentType.FACTURA && !data.paymentMethod) status = 'Pendiente';

    // A FACTURA never issues a second payment when its source is already paid.
    const canCreatePayment =
      !(type === DocumentType.FACTURA && data.sourceDocumentId && sourceStatus === 'Pagado');

    const document = await tx.document.create({
      data: {
        companyId: req.authUser!.companyId,
        type,
        series: data.series,
        number: await reserveNextNumber(tx, req.authUser!.companyId, type, data.series),
        date: data.date ? new Date(data.date) : new Date(),
        clientId,
        supplierId,
        userId: req.authUser!.userId,
        branchId: data.branchId,
        warehouseId: data.warehouseId,
        destinationWarehouseId: data.destinationWarehouseId,
        sourceDocumentId: data.sourceDocumentId,
        externalNumber: data.externalNumber,
        status,
        subtotal,
        totalTax,
        total,
        notes: data.notes,
        items: {
          create: lines.map((l) => ({
            productId: l.productId,
            description: l.product.name,
            quantity: l.quantity,
            unitPrice: l.unitPrice,
            taxRate: l.taxRate,
            discount: l.discount,
            lineTotal: l.lineTotal,
          })),
        },
        ...(type === DocumentType.FACTURA && data.invoice
          ? {
              invoiceData: {
                create: {
                  invoiceType: data.invoice.invoiceType,
                  cae: data.invoice.cae,
                  caeDueDate: data.invoice.caeDueDate
                    ? new Date(data.invoice.caeDueDate)
                    : null,
                  puntoVenta: data.invoice.puntoVenta,
                },
              },
            }
          : {}),
        // Payment rows: the payments array wins over the legacy single
        // paymentMethod. Both are skipped for a FACTURA chained to an
        // already-paid source (no double payment).
        ...(data.payments && canCreatePayment
          ? {
              payments: {
                create: data.payments.map((p) => ({
                  companyId: req.authUser!.companyId,
                  amount: p.amount,
                  method: p.method,
                  status: 'Pagado',
                })),
              },
            }
          : !data.payments && data.paymentMethod && canCreatePayment
            ? {
                payments: {
                  create: {
                    companyId: req.authUser!.companyId,
                    amount: total,
                    method: data.paymentMethod,
                    status: 'Pagado',
                  },
                },
              }
            : {}),
      },
      include: { items: true, payments: true, invoiceData: true },
    });

    // Stock side effects with movements.
    if (isStockType || isRemitoIngreso) {
      for (const line of lines) {
        if (type === DocumentType.REMITO) {
          // Physical receipt: first arrival of a product upserts the row.
          await tx.stock.upsert({
            where: {
              productId_warehouseId: { productId: line.productId, warehouseId: data.warehouseId! },
            },
            create: { productId: line.productId, warehouseId: data.warehouseId!, quantity: line.quantity, minStock: 0 },
            update: { quantity: { increment: line.quantity } },
          });
          await tx.stockMovement.create({
            data: {
              productId: line.productId,
              warehouseToId: data.warehouseId,
              quantity: line.quantity,
              type: 'ENTRADA',
              reason: `REMITO ${data.series}-${String(document.number).padStart(4, '0')}`,
              userId: req.authUser!.userId,
              documentId: document.id,
            },
          });
          continue;
        }
        if (type === DocumentType.VENTA) {
          // Atomic guarded decrement: a single conditional UPDATE, so two
          // concurrent sales can never both pass a read-then-write check and
          // oversell the same units (lost update + negative stock).
          const updated = await tx.stock.updateMany({
            where: {
              productId: line.productId,
              warehouseId: data.warehouseId!,
              quantity: { gte: line.quantity },
            },
            data: { quantity: { decrement: line.quantity } },
          });
          if (updated.count === 0) {
            const current = await tx.stock.findUnique({
              where: {
                productId_warehouseId: {
                  productId: line.productId,
                  warehouseId: data.warehouseId!,
                },
              },
              select: { quantity: true },
            });
            const err = Object.assign(
              new Error(
                current
                  ? `Stock insuficiente para el producto ${line.productId}: disponible ${Number(current.quantity)}, solicitado ${line.quantity}`
                  : `No hay stock registrado para el producto ${line.productId} en el depósito seleccionado`,
              ),
              { status: 400 },
            );
            throw err;
          }
        } else {
          // COMPRA: first entry of a product creates the stock row.
          await tx.stock.upsert({
            where: {
              productId_warehouseId: { productId: line.productId, warehouseId: data.warehouseId! },
            },
            create: {
              productId: line.productId,
              warehouseId: data.warehouseId!,
              quantity: line.quantity,
              minStock: 0,
            },
            update: { quantity: { increment: line.quantity } },
          });
        }

        await tx.stockMovement.create({
          data: {
            productId: line.productId,
            warehouseFromId: type === DocumentType.VENTA ? data.warehouseId : null,
            warehouseToId: type === DocumentType.COMPRA ? data.warehouseId : null,
            quantity: line.quantity,
            type: type === DocumentType.VENTA ? 'SALIDA' : 'ENTRADA',
            reason: `${type} ${data.series}-${String(document.number).padStart(4, '0')}`,
            userId: req.authUser!.userId,
            documentId: document.id,
          },
        });
      }
    }

    // Audit trail inside the same transaction as the document creation.
    const auditAction =
      type === DocumentType.REMITO
        ? 'Registro de Remito'
        : type === DocumentType.FACTURA
          ? 'Registro de Factura'
          : 'Creación de Comprobante';
    const auditModule =
      type === DocumentType.FACTURA && hasClient ? 'Ventas' : DOCUMENT_PERMISSION[type] === 'compras.escribir' ? 'Compras' : 'Ventas';
    await logAudit(
      tx,
      req.authUser!.companyId,
      req.authUser!.userId,
      {
        action: auditAction,
        module: auditModule,
        entity: 'Document',
        entityId: document.id,
        details: `${type} ${data.series}-${String(document.number).padStart(4, '0')} por $${total.toFixed(2)}${data.externalNumber ? ` (ref: ${data.externalNumber})` : ''}`,
      },
      clientIp(req),
    );

    return document;
  });

  res.status(201).json(result);
});

const receiveSchema = z.object({
  items: z
    .array(
      z.object({
        productId: z.number().int().positive(),
        quantity: z.number().positive(),
      }),
    )
    .min(1, 'Debe incluir al menos un ítem'),
  warehouseId: z.number().int().positive(),
  // Structured reference to the supplier's physical delivery note.
  externalNumber: z.string().max(50).optional(),
  date: z.string().datetime().optional(),
  notes: z.string().optional(),
});

/**
 * POST /api/documents/:id/receive
 * Receives goods against an open purchase order (type OC):
 *   - validates each line against the pending quantity (ordered - already received)
 *   - creates a REMITO (ingreso) chained to the OC via sourceDocumentId,
 *     capturing the supplier's remito number in externalNumber
 *   - increments stock (ENTRADA movements) atomically
 *   - marks the OC as Parcial or Recibido
 */
router.post('/:id/receive', requirePermission('compras.escribir'), async (req, res) => {
  const id = parsePositiveInt(req.params.id);
  if (id === null) {
    res.status(400).json({ error: 'Parámetro inválido' });
    return;
  }
  const parsed = receiveSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Datos inválidos', details: parsed.error.flatten() });
    return;
  }
  const data = parsed.data;
  const companyId = req.authUser!.companyId;

  const result = await prisma.$transaction(async (tx) => {
    const oc = await tx.document.findFirst({
      where: { id, companyId, type: DocumentType.OC },
      include: { items: true },
    });
    if (!oc) {
      throw Object.assign(new Error('Orden de compra no encontrada'), { status: 404 });
    }
    if (oc.status === 'Recibido') {
      throw Object.assign(new Error('La orden ya fue recibida completamente'), { status: 409 });
    }

    const warehouse = await tx.warehouse.findFirst({ where: { id: data.warehouseId, companyId } });
    if (!warehouse) {
      throw Object.assign(new Error('Depósito no válido'), { status: 400 });
    }

    // Already-received quantities per product, from chained REMITO documents.
    const children = await tx.document.findMany({
      where: { companyId, sourceDocumentId: oc.id, type: DocumentType.REMITO },
      include: { items: true },
    });
    const receivedByProduct = new Map<number, number>();
    for (const child of children) {
      for (const line of child.items) {
        if (line.productId) {
          receivedByProduct.set(
            line.productId,
            (receivedByProduct.get(line.productId) ?? 0) + Number(line.quantity),
          );
        }
      }
    }

    const lines: {
      productId: number;
      quantity: number;
      unitPrice: number;
      taxRate: number;
      lineTotal: number;
      taxAmount: number;
      productName: string;
    }[] = [];

    for (const item of data.items) {
      const ocLine = oc.items.find((l) => l.productId === item.productId);
      if (!ocLine) {
        throw Object.assign(new Error(`El producto ${item.productId} no está en la orden`), {
          status: 400,
        });
      }
      const previously = receivedByProduct.get(item.productId) ?? 0;
      const pending = Number(ocLine.quantity) - previously;
      if (pending < item.quantity) {
        throw Object.assign(
          new Error(
            `La recepción de ${ocLine.description} excede el pendiente (quedan ${pending} unidades)`,
          ),
          { status: 409 },
        );
      }

      const product = await tx.product.findFirst({
        where: { id: item.productId, companyId },
        include: { tax: true },
      });
      if (!product) throw Object.assign(new Error('Producto no válido'), { status: 400 });

      const unitPrice = Number(ocLine.unitPrice) || Number(product.costPrice);
      const taxRate = Number(ocLine.taxRate) || Number(product.tax.rate);
      const lineTotal = unitPrice * item.quantity;
      lines.push({
        productId: item.productId,
        quantity: item.quantity,
        unitPrice,
        taxRate,
        lineTotal,
        taxAmount: (lineTotal * taxRate) / 100,
        productName: product.name,
      });
    }

    const subtotal = lines.reduce((acc, l) => acc + l.lineTotal, 0);
    const totalTax = lines.reduce((acc, l) => acc + l.taxAmount, 0);
    const total = subtotal + totalTax;

    const remito = await tx.document.create({
      data: {
        companyId,
        type: DocumentType.REMITO,
        series: 'A',
        number: await reserveNextNumber(tx, companyId, DocumentType.REMITO, 'A'),
        date: data.date ? new Date(data.date) : new Date(),
        supplierId: oc.supplierId,
        userId: req.authUser!.userId,
        warehouseId: data.warehouseId,
        sourceDocumentId: oc.id,
        externalNumber: data.externalNumber,
        status: 'Recibido',
        subtotal,
        totalTax,
        total,
        notes: data.notes,
        items: {
          create: lines.map((l) => ({
            productId: l.productId,
            description: l.productName,
            quantity: l.quantity,
            unitPrice: l.unitPrice,
            taxRate: l.taxRate,
            discount: 0,
            lineTotal: l.lineTotal,
          })),
        },
      },
      include: { items: true },
    });

    for (const line of lines) {
      // Upsert: first receipt of a product in this warehouse creates the row.
      await tx.stock.upsert({
        where: {
          productId_warehouseId: { productId: line.productId, warehouseId: data.warehouseId },
        },
        create: { productId: line.productId, warehouseId: data.warehouseId, quantity: line.quantity, minStock: 0 },
        update: { quantity: { increment: line.quantity } },
      });
      await tx.stockMovement.create({
        data: {
          productId: line.productId,
          warehouseToId: data.warehouseId,
          quantity: line.quantity,
          type: 'ENTRADA',
          reason: `REMITO A-${String(remito.number).padStart(4, '0')} (recepción OC A-${String(oc.number).padStart(4, '0')})`,
          userId: req.authUser!.userId,
          documentId: remito.id,
        },
      });
    }

    // Mark the OC complete only when every ordered line is fully received.
    const receivedNow = new Map<number, number>();
    for (const line of lines) receivedNow.set(line.productId, line.quantity);
    const allComplete = oc.items.every((l) => {
      if (!l.productId) return true;
      const totalReceived =
        (receivedByProduct.get(l.productId) ?? 0) + (receivedNow.get(l.productId) ?? 0);
      return totalReceived >= Number(l.quantity);
    });
    const ocStatus = allComplete ? 'Recibido' : 'Parcial';
    await tx.document.update({ where: { id: oc.id }, data: { status: ocStatus } });

    // Audit trail inside the receipt transaction.
    await logAudit(
      tx,
      companyId,
      req.authUser!.userId,
      {
        action: 'Registro de Remito',
        module: 'Compras',
        entity: 'Document',
        entityId: remito.id,
        details: `REMITO A-${String(remito.number).padStart(4, '0')} por $${total.toFixed(2)} (recepción OC A-${String(oc.number).padStart(4, '0')})${data.externalNumber ? ` | remito proveedor: ${data.externalNumber}` : ''}`,
      },
      clientIp(req),
    );

    return { document: remito, ocStatus };
  });

  res.status(201).json({ ok: true, ...result });
});

const externalVoucherSchema = z.object({
  externalNumber: z.string().max(50).optional(),
  emissionDate: z.string().datetime().optional(),
  supplierCuit: z.string().max(20).optional(),
  supplierName: z.string().max(150).optional(),
  externalSubtotal: z.number().nonnegative().optional(),
  externalTax: z.number().nonnegative().optional(),
  externalTotal: z.number().nonnegative().optional(),
  ingestionMethod: z.enum(['manual', 'lector', 'ocr']).optional(),
});

/**
 * PATCH /api/documents/:id/external
 * Captures the counterpart's physical voucher (supplier remito/factura) that must
 * stay registered: frozen supplier identity (CUIT/razón social), external reference
 * and amounts, and how it was ingested (manual entry, document reader, or OCR).
 * Persisted in InvoiceData (1:1); externalNumber also mirrors Document.externalNumber.
 */
router.patch(
  '/:id/external',
  requireAnyPermission('compras.escribir', 'ventas.escribir'),
  async (req, res) => {
    const id = parsePositiveInt(req.params.id);
    if (id === null) {
      res.status(400).json({ error: 'Parámetro inválido' });
      return;
    }
    const parsed = externalVoucherSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Datos inválidos', details: parsed.error.flatten() });
      return;
    }
    const data = parsed.data;

    const result = await prisma.$transaction(async (tx) => {
      const document = await tx.document.findFirst({
        where: { id, companyId: req.authUser!.companyId },
        select: { id: true, type: true },
      });
      if (!document) throw Object.assign(new Error('Comprobante no encontrado'), { status: 404 });

      const hasData = Boolean(
        data.externalNumber ||
          data.emissionDate ||
          data.supplierCuit ||
          data.supplierName ||
          data.externalSubtotal != null ||
          data.externalTax != null ||
          data.externalTotal != null ||
          data.ingestionMethod,
      );

      if (data.externalNumber !== undefined) {
        await tx.document.update({
          where: { id },
          data: { externalNumber: data.externalNumber || null },
        });
      }

      if (hasData) {
        await tx.invoiceData.upsert({
          where: { documentId: id },
          create: {
            documentId: id,
            invoiceType: document.type === DocumentType.FACTURA ? 'X' : null,
            emissionDate: data.emissionDate ? new Date(data.emissionDate) : undefined,
            supplierCuit: data.supplierCuit,
            supplierName: data.supplierName,
            externalSubtotal: data.externalSubtotal,
            externalTax: data.externalTax,
            externalTotal: data.externalTotal,
            ingestionMethod: data.ingestionMethod,
            verifiedByUserId: req.authUser!.userId,
          },
          update: {
            emissionDate: data.emissionDate ? new Date(data.emissionDate) : undefined,
            supplierCuit: data.supplierCuit,
            supplierName: data.supplierName,
            externalSubtotal: data.externalSubtotal,
            externalTax: data.externalTax,
            externalTotal: data.externalTotal,
            ingestionMethod: data.ingestionMethod,
            // The last user to confirm the capture becomes the verifier.
            verifiedByUserId: req.authUser!.userId,
          },
        });
      }

      await logAudit(
        tx,
        req.authUser!.companyId,
        req.authUser!.userId,
        {
          action: 'Registro de documento del proveedor',
          module: 'Compras',
          entity: 'Document',
          entityId: id,
          details: `Datos del documento externo${data.externalNumber ? ` ${data.externalNumber}` : ''}${data.supplierName ? ` (${data.supplierName})` : ''}${data.ingestionMethod ? ` via ${data.ingestionMethod}` : ''}`,
        },
        clientIp(req),
      );

      return { ok: true, externalNumber: data.externalNumber ?? document.id };
    });

    res.json(result);
  },
);

/**
 * POST /api/documents/:id/external/attach
 * Uploads the scanned/photographed counterpart voucher (PDF, JPG, PNG, WEBP up to
 * 10 MB) and links it to the document's InvoiceData. Returns the stored URL.
 */
router.post(
  '/:id/external/attach',
  requireAnyPermission('compras.escribir', 'ventas.escribir'),
  upload.single('file'),
  async (req, res) => {
    const id = parsePositiveInt(req.params.id);
    if (id === null) {
      res.status(400).json({ error: 'Parámetro inválido' });
      return;
    }
    if (!req.file) {
      res.status(400).json({ error: 'No se recibió ningún archivo' });
      return;
    }

    // Content sniffing: the declared mimetype and the extension are hints only.
    const sniffed = sniffMime(req.file.buffer);
    if (!sniffed) {
      res.status(400).json({ error: 'El archivo no es un PDF o una imagen válida' });
      return;
    }

    // Name and extension are server-generated; the user's original name never
    // reaches the filesystem.
    const filename = `${Date.now()}-${randomUUID()}${EXT_BY_MIME[sniffed]}`;
    const filePath = path.join(uploadsDir, filename);

    // Write first, then reference: if the disk write fails the row is never
    // created. If the transaction fails afterwards, remove the orphan file.
    await fs.promises.writeFile(filePath, req.file.buffer);

    let result: { ok: true; attachmentUrl: string };
    try {
      result = await prisma.$transaction(async (tx) => {
      const document = await tx.document.findFirst({
        where: { id, companyId: req.authUser!.companyId },
        select: { id: true, type: true },
      });
      if (!document) throw Object.assign(new Error('Comprobante no encontrado'), { status: 404 });

      const attachmentUrl = `/uploads/${filename}`;
      await tx.invoiceData.upsert({
        where: { documentId: id },
        create: {
          documentId: id,
          invoiceType: document.type === DocumentType.FACTURA ? 'X' : null,
          attachmentUrl,
          verifiedByUserId: req.authUser!.userId,
        },
        update: { attachmentUrl, verifiedByUserId: req.authUser!.userId },
      });

      await logAudit(
        tx,
        req.authUser!.companyId,
        req.authUser!.userId,
        {
          action: 'Adjunto de documento del proveedor',
          module: 'Compras',
          entity: 'Document',
          entityId: id,
          details: `Adjunto ${req.file!.originalname} → ${attachmentUrl}`,
        },
        clientIp(req),
      );

        return { ok: true, attachmentUrl };
      });
    } catch (error) {
      // The physical file must not outlive a transaction that never committed.
      await fs.promises.unlink(filePath).catch(() => undefined);
      throw error;
    }

    res.json(result);
  },
);

/**
 * GET /api/documents/:id/external/attachment
 * Streams the stored voucher. Access is authenticated and tenant-scoped: there
 * is no public directory, so an opaque file name alone grants nothing.
 */
router.get(
  '/:id/external/attachment',
  requireAnyPermission('compras.leer', 'ventas.leer'),
  async (req, res) => {
    const id = parsePositiveInt(req.params.id);
    if (id === null) {
      res.status(400).json({ error: 'Parámetro inválido' });
      return;
    }
    const invoice = await prisma.invoiceData.findFirst({
      where: { documentId: id, document: { companyId: req.authUser!.companyId } },
      select: { attachmentUrl: true },
    });
    if (!invoice?.attachmentUrl) {
      res.status(404).json({ error: 'Adjunto no encontrado' });
      return;
    }

    // basename() collapses any traversal attempt to a single segment inside uploadsDir.
    const filePath = path.join(uploadsDir, path.basename(invoice.attachmentUrl));
    if (!fs.existsSync(filePath)) {
      res.status(404).json({ error: 'Adjunto no encontrado' });
      return;
    }

    res.sendFile(filePath);
  },
);

export default router;
