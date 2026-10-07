import { Router } from 'express';
import { z } from 'zod';
import multer from 'multer';
import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { DocumentType } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import {
  requireAuth,
  requirePermission,
  requireAnyPermission,
  tenantWhere,
  getUserPermissions,
  requireAssignedBranch,
  documentBranchWhere,
} from '../middleware/auth.js';
import { logAudit, clientIp } from '../lib/audit.js';
import { reserveNextNumber } from '../lib/numbering.js';
import { assertDocCreationAllowed } from '../lib/billing.js';
import { parsePositiveInt, parsePagination, paginateResponse } from '../lib/params.js';
import { parseBody } from '../lib/parseBody.js';
import { buildHeaderSnapshot, withHeaderSnapshot } from '../lib/headerSnapshots.js';

const router = Router();

router.use(requireAuth);
router.use(requireAssignedBranch);

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
  sourceDocumentItemId: z.number().int().positive().optional(),
  quantity: z.number().positive(),
  unitPrice: z.number().positive().optional(),
  // No default: an explicit discount on a derived line must be distinguishable
  // from an absent one so the mismatch guard can reject silent overrides.
  discount: z.number().nonnegative().optional(),
  // Multi-depósito: depósito de la línea; por defecto el de la cabecera.
  warehouseId: z.number().int().positive().optional(),
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
  // Operational direction is required by the derived-document UI so the
  // permission can be checked without trusting a caller-supplied counterpart.
  // The source document remains authoritative for the actual party.
  direction: z.enum(['ingreso', 'egreso']).optional(),
  series: z.string().trim().regex(/^[A-Za-z0-9-_]{1,10}$/, 'Serie inválida').optional().default('A'),
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
  // Document currency is a real creation field, not a display hint. Before U6
  // these two were silently stripped by Zod and the column defaults won
  // (ARS/1) even for companies whose maestro says otherwise.
  currency: z.string().length(3).optional(),
  exchangeRate: z.coerce.number().positive().max(1e9).optional(),
  notes: z.string().optional(),
  // At-most-once creation: the same key replays the original document instead
  // of minting a duplicate (double click, transport retry). Enforced by the
  // (companyId, idempotencyKey) unique index and the in-transaction check.
  idempotencyKey: z.uuid().optional(),
});

type DocumentDirection = 'ingreso' | 'egreso';

function isCancelledDocument(status: string): boolean {
  return /^(anulad[oa]|cancelad[oa])$/i.test(status.trim());
}

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
  const pagination = parsePagination(req.query);
  if (pagination !== null && 'error' in pagination) {
    res.status(400).json({ error: pagination.error });
    return;
  }
const where = {
    ...documentBranchWhere(req),
    ...(typeFilter ? { type: typeFilter } : {}),
  };
  const take = pagination ? pagination.limit : undefined;
  const [documents, total] = await Promise.all([
    prisma.document.findMany({
      where,
      include: {
        client: { select: { id: true, name: true, type: true, phone: true } },
        supplier: { select: { id: true, name: true } },
        warehouse: { select: { name: true } },
        payments: { select: { id: true, method: true, status: true, amount: true, cashBoxId: true } },
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
            sourceDocumentItemId: true,
            productId: true,
            sku: true,
            taxName: true,
            description: true,
            quantity: true,
            unitPrice: true,
            lineTotal: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      ...(pagination ? { skip: (pagination.page - 1) * pagination.limit, take: pagination.limit } : {}),
    }),
    take ? prisma.document.count({ where }) : Promise.resolve(0),
  ]);
  const sourceIds = documents
    .filter((document) => [DocumentType.OC, DocumentType.VENTA, DocumentType.PEDIDO, DocumentType.REMITO].some((type) => type === document.type))
    .map((document) => document.id);
  const children = sourceIds.length === 0 ? [] : await prisma.document.findMany({
    where: {
      companyId: req.authUser!.companyId,
      sourceDocumentId: { in: sourceIds },
      type: { in: [DocumentType.REMITO, DocumentType.FACTURA] },
    },
    select: {
      sourceDocumentId: true,
      type: true,
      items: { select: { sourceDocumentItemId: true, productId: true, quantity: true } },
    },
  });
  const withPendingQuantities = documents.map((document) => {
    const directChildren = children.filter((child) => child.sourceDocumentId === document.id);
    const targetType = document.type === DocumentType.OC
      ? DocumentType.REMITO
      : document.type === DocumentType.REMITO
        ? DocumentType.FACTURA
        : document.type === DocumentType.PEDIDO
          ? DocumentType.REMITO
          : document.type === DocumentType.VENTA
          ? directChildren.some((child) => child.type === DocumentType.REMITO)
            ? DocumentType.REMITO
            : DocumentType.FACTURA
          : undefined;
    const linked = new Map<number, number>();
    const legacy = new Map<number, number>();
    for (const child of directChildren.filter((entry) => entry.type === targetType)) {
      for (const item of child.items) {
        if (item.productId === null) continue;
        if (item.sourceDocumentItemId !== null && document.items.some((source) => source.id === item.sourceDocumentItemId)) {
          linked.set(item.sourceDocumentItemId, (linked.get(item.sourceDocumentItemId) ?? 0) + Number(item.quantity));
        } else {
          legacy.set(item.productId, (legacy.get(item.productId) ?? 0) + Number(item.quantity));
        }
      }
    }
    const legacyApplied = new Map<number, number>();
    const pendingByItemId = new Map<number, number>();
    for (const item of [...document.items].sort((left, right) => left.id - right.id)) {
      const productId = item.productId ?? -1;
      const remainingAfterLinked = Math.max(0, Number(item.quantity) - (linked.get(item.id) ?? 0));
      const legacyAmount = Math.min(
        Math.max(0, (legacy.get(productId) ?? 0) - (legacyApplied.get(productId) ?? 0)),
        remainingAfterLinked,
      );
      legacyApplied.set(productId, (legacyApplied.get(productId) ?? 0) + legacyAmount);
      pendingByItemId.set(item.id, remainingAfterLinked - legacyAmount);
    }
    return {
      ...withHeaderSnapshot(document),
      hasDispatch: document.type === DocumentType.PEDIDO
        && directChildren.some((child) => child.type === DocumentType.REMITO),
      items: document.items.map((item) => ({ ...item, pendingQuantity: pendingByItemId.get(item.id) ?? 0 })),
    };
  });
  res.json(pagination ? paginateResponse(withPendingQuantities, pagination, total) : withPendingQuantities);
});

/** GET /api/documents/:id */
router.get('/:id', requireAnyPermission('ventas.leer', 'compras.leer'), async (req, res) => {
  const id = parsePositiveInt(req.params.id);
  if (id === null) {
    res.status(400).json({ error: 'Parámetro inválido' });
    return;
  }
  const document = await prisma.document.findFirst({
    where: { id, ...documentBranchWhere(req) },
    include: {
      client: true,
      supplier: true,
      user: { select: { id: true, firstName: true, lastName: true } },
      branch: { select: { name: true, address: true } },
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
  res.json(withHeaderSnapshot(document));
});

/**
 * PATCH /api/documents/:id/status — lifecycle for PEDIDO and OC:
 *   PEDIDO: Abierto → En Proceso, either → Anulado before physical dispatch.
 *     Enviado is assigned only by the final PEDIDO-derived REMITO transaction.
 *   OC: Abierto → Anulado before any receipt (or other derived document).
 */
const pedidoStatusSchema = z.object({
  status: z.enum(['En Proceso', 'Anulado']),
});

const PEDIDO_TRANSITIONS: Record<string, string[]> = {
  Abierto: ['En Proceso', 'Anulado'],
  Pagado: ['En Proceso', 'Anulado'], // Legacy paid PEDIDO used payment status as logistics status.
  'En Proceso': ['Anulado'],
  Enviado: [],
  Anulado: [],
};

const OC_TRANSITIONS: Record<string, string[]> = {
  Abierto: ['Anulado'],
};

function statusTransitionsFor(type: DocumentType): Record<string, string[]> | null {
  if (type === DocumentType.PEDIDO) return PEDIDO_TRANSITIONS;
  if (type === DocumentType.OC) return OC_TRANSITIONS;
  return null;
}

router.patch('/:id/status', requireAnyPermission('ventas.escribir', 'compras.escribir'), async (req, res) => {
  const id = parsePositiveInt(req.params.id);
  if (id === null) {
    res.status(400).json({ error: 'Parámetro inválido' });
    return;
  }
  const body = parseBody(res, pedidoStatusSchema, req.body, 'Estado inválido');
  if (!body) return;
  const next = body.status;

  const result = await prisma.$transaction(async (tx) => {
    // Serialize manual changes with REMITO creation before reading status or children.
    const lockedOrders = await tx.$queryRaw<{ id: number }[]>`
      SELECT id FROM comprobantes
      WHERE id = ${id} AND companyId = ${req.authUser!.companyId}
      FOR UPDATE
    `;
    if (lockedOrders.length === 0) throw Object.assign(new Error('Comprobante no encontrado'), { status: 404 });
    const document = await tx.document.findFirst({
      where: { id, ...documentBranchWhere(req) },
      select: { id: true, type: true, status: true, series: true, number: true },
    });
    if (!document) throw Object.assign(new Error('Comprobante no encontrado'), { status: 404 });
    // The route is shared by sales and purchases; enforce the permission of the
    // document's own domain instead of the caller's least specific one.
    const requiredPermission = DOCUMENT_PERMISSION[document.type];
    if (requiredPermission && !(await getUserPermissions(req)).has(requiredPermission)) {
      throw Object.assign(new Error(`Permiso requerido: ${requiredPermission}`), { status: 403 });
    }
    const transitions = statusTransitionsFor(document.type);
    if (!transitions) {
      throw Object.assign(new Error('Solo los PEDIDO y las OC cambian de estado por esta vía'), { status: 400 });
    }
    const allowed = transitions[document.status] ?? [];
    if (!allowed.includes(next)) {
      throw Object.assign(new Error(`Transición no permitida de ${document.status} a ${next}`), {
        status: 400,
      });
    }
    if (next === 'Anulado' && await tx.document.count({
      where: {
        companyId: req.authUser!.companyId,
        sourceDocumentId: id,
        // A PEDIDO can only be blocked by dispatched REMITOs; an OC is blocked
        // by any derived document (a receipt, or a future derived invoice).
        ...(document.type === DocumentType.PEDIDO ? { type: DocumentType.REMITO } : {}),
      },
    }) > 0) {
      throw Object.assign(new Error('No se puede anular un comprobante con documentos derivados'), { status: 409 });
    }
    const updated = await tx.document.update({ where: { id }, data: { status: next } });
    await logAudit(
      tx,
      req.authUser!.companyId,
      req.authUser!.userId,
      {
        action: 'Cambio de estado de comprobante',
        module: requiredPermission === 'compras.escribir' ? 'Compras' : 'Ventas',
        entity: 'Document',
        entityId: id,
        details: `${document.type} ${document.series}-${String(document.number).padStart(4, '0')}: ${document.status} → ${next}`,
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
 *   - REMITO (egreso) : deducts stock only when derived from a deferred PEDIDO;
 *                       a POS VENTA already moved stock and is not deducted again
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

  const data = parseBody(res, documentSchema, req.body);
  if (!data) return;
  const items = parseBody(
    res,
    z.array(itemSchema).min(1, 'Debe incluir al menos un ítem'),
    req.body.items,
    'Ítems inválidos',
  );
  if (!items) return;
  if (data.branchId) {
    const branch = await prisma.branch.findFirst({ where: { id: data.branchId, ...tenantWhere(req) } });
    if (!branch) {
      res.status(400).json({ error: 'Sucursal no válida para esta empresa' });
      return;
    }
    if (!req.authUser!.isOwner && branch.id !== req.authUser!.branchId) {
      res.status(403).json({ error: 'Sucursal fuera de la asignación' });
      return;
    }
  }
  const type = data.type as DocumentType;

  const hasClient = Boolean(data.clientId || data.clientName);
  const hasSupplier = Boolean(data.supplierId || data.supplierName);

  const isDirectionalType = type === DocumentType.REMITO || type === DocumentType.FACTURA;
  if (hasClient && hasSupplier) {
    res.status(400).json({
      error: 'Un comprobante no puede mezclar cliente y proveedor',
    });
    return;
  }
  // Derivation (source chaining, pending balances, inherited prices and the
  // cancelled-source guard) only exists for the directional documents. A
  // non-directional type that names an origin would mint a document pointing
  // at a source nothing ever validates.
  if (!isDirectionalType) {
    if (data.sourceDocumentId) {
      res.status(400).json({
        error: 'Solo los REMITO y las FACTURA se crean derivados de otro comprobante',
      });
      return;
    }
    if (items.some((item) => item.sourceDocumentItemId !== undefined)) {
      res.status(400).json({
        error: 'Solo los documentos derivados indican líneas de origen',
      });
      return;
    }
  }
  const direction: DocumentDirection | null = data.direction
    ?? (hasClient ? 'egreso' : hasSupplier ? 'ingreso' : null);
  if (isDirectionalType && !direction) {
    res.status(400).json({
      error: `Los comprobantes ${type} requieren dirección de ingreso o egreso`,
    });
    return;
  }
  if (isDirectionalType && direction === 'ingreso' && hasClient) {
    res.status(400).json({ error: `Un ${type} de ingreso no puede indicar cliente` });
    return;
  }
  if (isDirectionalType && direction === 'egreso' && hasSupplier) {
    res.status(400).json({ error: `Un ${type} de egreso no puede indicar proveedor` });
    return;
  }
  if (isDirectionalType && !data.sourceDocumentId && hasClient === hasSupplier) {
    res.status(400).json({
      error: `Los comprobantes ${type} sin origen requieren exactamente un cliente o proveedor`,
    });
    return;
  }
  if (
    type === DocumentType.REMITO
    && direction === 'ingreso'
    && data.sourceDocumentId
  ) {
    res.status(400).json({
      error: 'Use POST /api/documents/:id/receive para recibir una orden de compra',
    });
    return;
  }
  if (
    data.sourceDocumentId
    && isDirectionalType
    && new Set(items.map((item) => item.productId)).size !== items.length
    && (
      items.some((item) => item.sourceDocumentItemId === undefined)
      || new Set(items.map((item) => item.sourceDocumentItemId)).size !== items.length
    )
  ) {
    res.status(400).json({
      error: `No se puede repetir el mismo producto en un ${type} derivado`,
    });
    return;
  }

  // Direction, not a caller-supplied counterpart id, owns the module.
  const requiredPermission = isDirectionalType
    ? direction === 'egreso' ? 'ventas.escribir' : 'compras.escribir'
    : DOCUMENT_PERMISSION[type];
  const userPermissions = await getUserPermissions(req);
  if (!userPermissions.has(requiredPermission)) {
    res.status(403).json({ error: `Permiso requerido: ${requiredPermission}` });
    return;
  }

  const isStockType = type === DocumentType.VENTA || type === DocumentType.COMPRA;
  // Physical receipt from a supplier: stock ENTRADA even without an OC chain.
  const isRemitoIngreso = type === DocumentType.REMITO && direction === 'ingreso';

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
  if (type === DocumentType.FACTURA && !data.invoice) {
    res.status(400).json({ error: 'Los comprobantes FACTURA requieren datos fiscales (invoice)' });
    return;
  }

  // Document currency comes from the caller when explicitly requested,
  // otherwise from the company maestro (the column default used to win
  // silently, minting ARS documents for USD companies). exchangeRate stays 1
  // unless the caller provides one — there is no FX source in the system yet.
  const effectiveCurrency = data.currency
    ?? (await prisma.company.findUnique({
        where: { id: req.authUser!.companyId },
        select: { currency: true },
      }))?.currency
    ?? 'ARS';
  const effectiveExchangeRate = data.exchangeRate ?? 1;

  let replayed = false;
  const result = await prisma.$transaction(async (tx) => {
    // Idempotent replay: the caller's key already created this logical document.
    // Return the original instead of minting a duplicate — and never burn a
    // second folio for it, so the check runs before reserveNextNumber.
    if (data.idempotencyKey) {
      const prior = await tx.document.findFirst({
        where: { companyId: req.authUser!.companyId, idempotencyKey: data.idempotencyKey },
        include: { items: true, payments: true, invoiceData: true },
      });
      if (prior) {
        replayed = true;
        return prior;
      }
    }
    // Lock before any consistent read in this transaction. Under MySQL REPEATABLE
    // READ, an earlier warehouse read would pin a stale snapshot of child remitos
    // even after waiting for another dispatcher to release the source lock.
    if (data.sourceDocumentId && isDirectionalType) {
      const lockedSources = await tx.$queryRaw<{ id: number }[]>`
        SELECT id FROM comprobantes
        WHERE id = ${data.sourceDocumentId} AND companyId = ${req.authUser!.companyId}
        FOR UPDATE
      `;
      if (lockedSources.length === 0) {
        throw Object.assign(new Error('Documento origen no válido'), { status: 400 });
      }
    }
    // Tenancy + existence checks for referenced entities.
    let clientId = data.clientId;
    if (!data.sourceDocumentId && clientId) {
      const client = await tx.client.findFirst({
        where: { id: clientId, ...tenantWhere(req) },
      });
      if (!client) throw Object.assign(new Error('Cliente no válido'), { status: 400 });
    } else if (!data.sourceDocumentId && data.clientName) {
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
    if (!data.sourceDocumentId && supplierId) {
      const supplier = await tx.supplier.findFirst({
        where: { id: supplierId, ...tenantWhere(req) },
      });
      if (!supplier) throw Object.assign(new Error('Proveedor no válido'), { status: 400 });
    } else if (!data.sourceDocumentId && data.supplierName) {
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
    let effectiveBranchId = req.authUser!.isOwner ? data.branchId ?? null : req.authUser!.branchId;
    let effectiveWarehouseId = data.warehouseId ?? null;
    let effectiveDestinationWarehouseId = data.destinationWarehouseId ?? null;
    if (data.warehouseId) {
      const warehouse = await tx.warehouse.findFirst({
        where: { id: data.warehouseId, ...tenantWhere(req) },
      });
      if (!warehouse) throw Object.assign(new Error('Depósito no válido'), { status: 400 });
      if (!req.authUser!.isOwner && warehouse.branchId !== req.authUser!.branchId) {
        throw Object.assign(new Error('Depósito fuera de la sucursal asignada'), { status: 403 });
      }
      if (data.branchId && warehouse.branchId !== data.branchId) {
        throw Object.assign(new Error('El depósito no pertenece a la sucursal seleccionada'), {
          status: 409,
        });
      }
    }
    if (data.destinationWarehouseId) {
      const destination = await tx.warehouse.findFirst({
        where: { id: data.destinationWarehouseId, ...tenantWhere(req) },
      });
      if (!destination) throw Object.assign(new Error('Depósito de destino no válido'), { status: 400 });
      if (!req.authUser!.isOwner && destination.branchId !== req.authUser!.branchId) {
        throw Object.assign(new Error('Depósito fuera de la sucursal asignada'), { status: 403 });
      }
      if (data.branchId && destination.branchId !== data.branchId) {
        throw Object.assign(new Error('El depósito de destino no pertenece a la sucursal seleccionada'), {
          status: 409,
        });
      }
    }
    // Multi-depósito: cada depósito usado por las líneas debe ser del tenant.
    // (Se valida sobre el input crudo porque `lines` se resuelve más abajo.)
    const lineWarehouseIds = [
      ...new Set(
        items.map((i) => i.warehouseId ?? data.warehouseId).filter((w) => w !== undefined),
      ),
    ];
    for (const wid of lineWarehouseIds) {
      if (wid === data.warehouseId) continue; // ya validado arriba
      const lineWarehouse = await tx.warehouse.findFirst({
        where: { id: wid, ...tenantWhere(req) },
      });
      if (!lineWarehouse) throw Object.assign(new Error('Depósito no válido'), { status: 400 });
      if (!req.authUser!.isOwner && lineWarehouse.branchId !== req.authUser!.branchId) {
        throw Object.assign(new Error('Depósito fuera de la sucursal asignada'), { status: 403 });
      }
    }

    type SourceAggregate = {
      id: number;
      productId: number;
      quantity: number;
      description: string;
      weightedUnitPrice: number;
      discount: number;
      taxRate: number;
    };
    const sourceItemsById = new Map<number, SourceAggregate>();

    // Source-document chaining validation. Derived documents lock the source
    // before reading direct children, so two concurrent requests cannot both
    // consume the same pending quantity.
    let sourceStatus: string | null = null;
    let dispatchesPedido = false;
    let completesPedidoDispatch = false;
    let pedidoSource: { id: number; status: string; series: string; number: number } | null = null;
    if (data.sourceDocumentId) {
      const source = await tx.document.findFirst({
        where: { id: data.sourceDocumentId, ...documentBranchWhere(req) },
        select: {
          id: true,
          type: true,
          status: true,
          series: true,
          number: true,
          clientId: true,
          supplierId: true,
          branchId: true,
          warehouseId: true,
          destinationWarehouseId: true,
          items: {
            select: {
              productId: true,
              id: true,
              description: true,
              quantity: true,
              unitPrice: true,
              taxRate: true,
              discount: true,
            },
          },
        },
      });
      if (!source) {
        throw Object.assign(new Error('Documento origen no válido'), { status: 400 });
      }
      if (isCancelledDocument(source.status)) {
        throw Object.assign(new Error('No se puede derivar de un documento anulado o cancelado'), {
          status: 409,
        });
      }
      sourceStatus = source.status;
      dispatchesPedido = type === DocumentType.REMITO && direction === 'egreso' && source.type === DocumentType.PEDIDO;
      if (dispatchesPedido) pedidoSource = { id: source.id, status: source.status, series: source.series, number: source.number };

      if (isDirectionalType) {
        const sourceHasClient = source.clientId !== null;
        const sourceHasSupplier = source.supplierId !== null;
        if (sourceHasClient === sourceHasSupplier) {
          throw Object.assign(new Error('El documento origen tiene una contraparte ambigua'), {
            status: 409,
          });
        }
        if (direction === 'ingreso' && !sourceHasSupplier) {
          throw Object.assign(new Error('El documento origen no corresponde a una operación de ingreso'), {
            status: 400,
          });
        }
        if (direction === 'egreso' && !sourceHasClient) {
          throw Object.assign(new Error('El documento origen no corresponde a una operación de egreso'), {
            status: 400,
          });
        }
        if (type === DocumentType.REMITO && source.type !== DocumentType.VENTA && source.type !== DocumentType.PEDIDO) {
          throw Object.assign(new Error('Un REMITO de egreso sólo puede derivarse de una VENTA o PEDIDO'), {
            status: 400,
          });
        }
        if (
          type === DocumentType.FACTURA
          && direction === 'ingreso'
          && source.type !== DocumentType.REMITO
        ) {
          throw Object.assign(new Error('Una FACTURA de ingreso sólo puede derivarse de un REMITO de proveedor'), {
            status: 400,
          });
        }
        if (
          type === DocumentType.FACTURA
          && direction === 'egreso'
          && source.type !== DocumentType.REMITO
          && source.type !== DocumentType.VENTA
        ) {
          throw Object.assign(new Error('Una FACTURA de egreso sólo puede derivarse de una VENTA o REMITO de cliente'), {
            status: 400,
          });
        }

        if (data.clientName || data.supplierName) {
          throw Object.assign(new Error('La contraparte del documento derivado proviene del origen'), {
            status: 409,
          });
        }
        if (data.clientId && data.clientId !== source.clientId) {
          throw Object.assign(new Error('El cliente no coincide con el documento origen'), { status: 409 });
        }
        if (data.supplierId && data.supplierId !== source.supplierId) {
          throw Object.assign(new Error('El proveedor no coincide con el documento origen'), { status: 409 });
        }
        clientId = source.clientId ?? undefined;
        supplierId = source.supplierId ?? undefined;

        let sourceWarehouseBranchId: number | null = null;
        if (source.warehouseId !== null) {
          const sourceWarehouse = await tx.warehouse.findFirst({
            where: { id: source.warehouseId, ...tenantWhere(req) },
            select: { branchId: true },
          });
          if (!sourceWarehouse) {
            throw Object.assign(new Error('El depósito del documento origen no es válido'), { status: 409 });
          }
          sourceWarehouseBranchId = sourceWarehouse.branchId;
          if (source.branchId !== null && source.branchId !== sourceWarehouse.branchId) {
            throw Object.assign(new Error('El documento origen mezcla sucursal y depósito incompatibles'), {
              status: 409,
            });
          }
        }
        const derivedBranchId = source.branchId ?? sourceWarehouseBranchId;
        if (data.branchId !== undefined && data.branchId !== derivedBranchId) {
          throw Object.assign(new Error('La sucursal no coincide con el documento origen'), { status: 409 });
        }
        if (data.warehouseId !== undefined && data.warehouseId !== source.warehouseId
          && !(type === DocumentType.REMITO && source.type === DocumentType.PEDIDO && source.warehouseId === null)) {
          throw Object.assign(new Error('El depósito no coincide con el documento origen'), { status: 409 });
        }
        if (
          data.destinationWarehouseId !== undefined
          && data.destinationWarehouseId !== source.destinationWarehouseId
        ) {
          throw Object.assign(new Error('El depósito de destino no coincide con el documento origen'), {
            status: 409,
          });
        }
        if (items.some((item) => item.warehouseId !== undefined && item.warehouseId !== source.warehouseId)) {
          throw Object.assign(new Error('Una línea usa un depósito distinto al documento origen'), {
            status: 409,
          });
        }
        if (type === DocumentType.REMITO && source.type === DocumentType.PEDIDO) {
          effectiveWarehouseId = source.warehouseId ?? data.warehouseId ?? null;
          if (effectiveWarehouseId === null) {
            throw Object.assign(new Error('El despacho de un PEDIDO requiere warehouseId'), { status: 400 });
          }
          const dispatchWarehouse = await tx.warehouse.findFirst({
            where: { id: effectiveWarehouseId, ...tenantWhere(req) },
            select: { branchId: true },
          });
          if (!dispatchWarehouse || (derivedBranchId !== null && dispatchWarehouse.branchId !== derivedBranchId)) {
            throw Object.assign(new Error('El depósito de despacho no pertenece a la sucursal del PEDIDO'), { status: 409 });
          }
          effectiveBranchId = derivedBranchId ?? dispatchWarehouse.branchId;
        } else {
          effectiveBranchId = derivedBranchId;
          effectiveWarehouseId = source.warehouseId;
        }
        effectiveDestinationWarehouseId = source.destinationWarehouseId;

        const directChildren = await tx.document.findMany({
          where: {
            companyId: req.authUser!.companyId,
            sourceDocumentId: source.id,
            type: { in: [DocumentType.REMITO, DocumentType.FACTURA] },
          },
          select: {
            type: true,
            items: { select: { id: true, sourceDocumentItemId: true, productId: true, quantity: true } },
          },
        });
        if (
          source.type === DocumentType.VENTA
          && type === DocumentType.FACTURA
          && directChildren.some((child) => child.type === DocumentType.REMITO)
        ) {
          throw Object.assign(
            new Error('La VENTA ya tiene remito; facture desde el REMITO correspondiente'),
            { status: 409 },
          );
        }
        if (
          source.type === DocumentType.VENTA
          && type === DocumentType.REMITO
          && directChildren.some((child) => child.type === DocumentType.FACTURA)
        ) {
          throw Object.assign(
            new Error('La VENTA ya fue facturada directamente y no admite un REMITO posterior'),
            { status: 409 },
          );
        }

        for (const sourceItem of source.items) {
          if (sourceItem.productId === null) continue;
          const quantity = Number(sourceItem.quantity);
          sourceItemsById.set(sourceItem.id, {
            id: sourceItem.id,
            productId: sourceItem.productId,
            quantity,
            description: sourceItem.description,
            weightedUnitPrice: Number(sourceItem.unitPrice) * quantity,
            discount: Number(sourceItem.discount),
            taxRate: Number(sourceItem.taxRate),
          });
        }
        const consumedBySourceLine = new Map<number, number>();
        const legacyConsumedByProduct = new Map<number, number>();
        for (const child of directChildren) {
          if (child.type !== type) continue;
          for (const childItem of child.items) {
            if (childItem.productId === null) continue;
            if (childItem.sourceDocumentItemId && sourceItemsById.has(childItem.sourceDocumentItemId)) {
              const sourceLine = sourceItemsById.get(childItem.sourceDocumentItemId)!;
              if (sourceLine.productId !== childItem.productId) {
                throw Object.assign(new Error('La línea derivada no coincide con el producto de origen'), { status: 409 });
              }
              consumedBySourceLine.set(childItem.sourceDocumentItemId,
                (consumedBySourceLine.get(childItem.sourceDocumentItemId) ?? 0) + Number(childItem.quantity));
            } else {
              // Legacy child lines have no source-line identity. Conservatively reserve
              // their product quantity against source lines in document order.
              legacyConsumedByProduct.set(childItem.productId,
                (legacyConsumedByProduct.get(childItem.productId) ?? 0) + Number(childItem.quantity));
            }
          }
        }
        const pendingBySourceLine = new Map<number, number>();
        for (const sourceLine of sourceItemsById.values()) {
          const legacy = legacyConsumedByProduct.get(sourceLine.productId) ?? 0;
          const priorSourceLines = [...sourceItemsById.values()]
            .filter((candidate) => candidate.productId === sourceLine.productId && candidate.id < sourceLine.id);
          const legacyBefore = priorSourceLines.reduce((sum, candidate) => {
            const linked = consumedBySourceLine.get(candidate.id) ?? 0;
            return sum + Math.max(0, candidate.quantity - linked);
          }, 0);
          const legacyForLine = Math.min(Math.max(0, legacy - legacyBefore),
            Math.max(0, sourceLine.quantity - (consumedBySourceLine.get(sourceLine.id) ?? 0)));
          pendingBySourceLine.set(sourceLine.id,
            Math.max(0, sourceLine.quantity - (consumedBySourceLine.get(sourceLine.id) ?? 0) - legacyForLine));
        }
        const requestedBySourceLine = new Map<number, number>();
        for (const item of items) {
          const candidates = [...sourceItemsById.values()].filter((line) => line.productId === item.productId);
          const sourceItem = item.sourceDocumentItemId
            ? sourceItemsById.get(item.sourceDocumentItemId)
            : candidates.length === 1 ? candidates[0] : undefined;
          if (!sourceItem) {
            throw Object.assign(new Error(candidates.length > 1
              ? `El producto ${item.productId} aparece en varias líneas de origen; indique la línea de origen`
              : `El producto ${item.productId} no pertenece al documento origen`), {
              status: 400,
            });
          }
          if (sourceItem.productId !== item.productId) {
            throw Object.assign(new Error('La línea de origen no corresponde al producto indicado'), { status: 400 });
          }
          item.sourceDocumentItemId = sourceItem.id;
          requestedBySourceLine.set(sourceItem.id,
            (requestedBySourceLine.get(sourceItem.id) ?? 0) + item.quantity);
        }
        for (const [sourceLineId, requested] of requestedBySourceLine) {
          const pending = pendingBySourceLine.get(sourceLineId) ?? 0;
          if (requested > pending + 0.000001) {
            throw Object.assign(
              new Error(`La cantidad de la línea de origen ${sourceLineId} supera el saldo pendiente (${Math.max(0, pending)})`),
              { status: 409 },
            );
          }
        }
        if (dispatchesPedido) {
          completesPedidoDispatch = sourceItemsById.size > 0
            && sourceItemsById.size === source.items.length
            && [...sourceItemsById.values()]
            .every((sourceLine) => (pendingBySourceLine.get(sourceLine.id) ?? 0)
              - (requestedBySourceLine.get(sourceLine.id) ?? 0) <= 0.000001);
        }
      }
    }

    // Resolve product lines: price/tax from catalog unless overridden.
    // Multi-depósito: cada línea usa su warehouseId o el de la cabecera.
    const lines: {
      productId: number;
      sourceDocumentItemId?: number;
      quantity: number;
      unitPrice: number;
      taxRate: number;
      discount: number;
      lineTotal: number;
      taxAmount: number;
      warehouseId: number | null;
      product: { id: number; name: string; internalCode: string | null; taxName: string; allowOversell: boolean };
    }[] = [];

    for (const item of items) {
      const product = await tx.product.findFirst({
        where: { id: item.productId, ...tenantWhere(req) },
        include: { tax: true },
      });
      if (!product) throw Object.assign(new Error(`Producto ${item.productId} no válido`), { status: 400 });

      const inherited = item.sourceDocumentItemId
        ? sourceItemsById.get(item.sourceDocumentItemId)
        : undefined;
      // A purchase-side document records what we pay the supplier: cost, not
      // sale price. COMPRA/OC and the incoming directional documents default
      // to cost when the request omits unitPrice.
      const purchaseSide = type === DocumentType.COMPRA || type === DocumentType.OC
        || (isDirectionalType && direction === 'ingreso');
      const unitPrice = inherited
        ? inherited.weightedUnitPrice / inherited.quantity
        : item.unitPrice ?? Number(purchaseSide ? product.costPrice : product.salePrice);
      // A derived document inherits price, tax and discount from its source.
      // Overriding values were silently dropped before (200 with wrong data for
      // a misbehaving API client); now a mismatched override is a 400.
      if (inherited && item.unitPrice !== undefined && Math.abs(item.unitPrice - unitPrice) > 0.005) {
        throw Object.assign(
          new Error('Un documento derivado hereda el precio del origen; no se puede sobreescribir unitPrice'),
          { status: 400 },
        );
      }
      const taxRate = inherited?.taxRate ?? Number(product.tax.rate);
      const discount = inherited
        ? (inherited.discount / inherited.quantity) * item.quantity
        : item.discount ?? 0;
      if (inherited && item.discount !== undefined && Math.abs(item.discount - discount) > 0.005) {
        throw Object.assign(
          new Error('Un documento derivado hereda el descuento del origen; no se puede sobreescribir discount'),
          { status: 400 },
        );
      }
      const gross = unitPrice * item.quantity;
      const lineTotal = gross - discount;
      lines.push({
        productId: product.id,
        sourceDocumentItemId: item.sourceDocumentItemId,
        quantity: item.quantity,
        unitPrice,
        taxRate,
        discount,
        lineTotal,
        taxAmount: (lineTotal * taxRate) / 100,
        warehouseId: inherited
          ? effectiveWarehouseId
          : item.warehouseId ?? effectiveWarehouseId,
        product: {
          id: product.id,
          name: inherited?.description ?? product.name,
          internalCode: product.internalCode,
          taxName: product.tax.name,
          allowOversell: product.allowOversell,
        },
      });
    }

    // Stock availability for immediate sales and deferred order dispatch.
    // Multi-depósito: se verifica contra el depósito de cada línea.
    if (type === DocumentType.VENTA || type === DocumentType.COMPRA || dispatchesPedido) {
      for (const line of lines) {
        const stock = await tx.stock.findUnique({
          where: {
            productId_warehouseId: { productId: line.productId, warehouseId: line.warehouseId! },
          },
        });
        if (!stock) {
          throw Object.assign(new Error(`Sin stock registrado para ${line.product.name}`), {
            status: 409,
          });
        }

        if (type === DocumentType.VENTA || dispatchesPedido) {
          const current = Number(stock.quantity);
          // A physical PEDIDO dispatch cannot oversell even when the catalog
          // allows an immediate VENTA to do so.
          if (current < line.quantity && (dispatchesPedido || !line.product.allowOversell)) {
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

    // Freeze the header identity at creation: later renames of the company,
    // client, supplier or branch must never rewrite this document. The FACTURA
    // voucher copies its CUIT/razón social from this same snapshot, keeping one
    // copied fact instead of two user-typed ones nothing ever reconciles.
    const headerSnapshot = await buildHeaderSnapshot(tx, {
      companyId: req.authUser!.companyId,
      clientId,
      supplierId,
      branchId: effectiveBranchId,
    });

    let status = data.paymentMethod || data.payments ? 'Pagado' : 'Abierto';
    if (type === DocumentType.PEDIDO) status = 'Abierto';
    if (type === DocumentType.COMPRA && status !== 'Pagado') status = 'Recibido';
    if (type === DocumentType.REMITO) status = direction === 'ingreso' ? 'Recibido' : 'Entregado';
    if (type === DocumentType.FACTURA && !data.paymentMethod) status = 'Pendiente';

    // A FACTURA never issues a second payment when its source is already paid.
    const canCreatePayment =
      !(type === DocumentType.FACTURA && data.sourceDocumentId && sourceStatus === 'Pagado');

    // A cash payment is tied to the branch's open cash box; electronic methods
    // never reference a drawer, and a branch without an open box stays untied.
    const openCashBox =
      effectiveBranchId === null || effectiveBranchId === undefined
        ? null
        : await tx.cashBox.findFirst({
            where: { branchId: effectiveBranchId, status: 'Abierta' },
            select: { id: true },
          });

    // Fiscal point of sale: when the factura carries a PV number, that number
    // becomes its series (zero-padded, AFIP-style) so the folio is reserved per
    // PV and "0001-00000042" renders from one consistent pair. The PV must
    // belong to the document branch when one exists; a company without branches
    // (owner context) keeps the legacy free number.
    const salePointSeries =
      type === DocumentType.FACTURA && data.invoice?.puntoVenta != null
        ? String(data.invoice.puntoVenta).padStart(4, '0')
        : data.series;
    if (type === DocumentType.FACTURA && data.invoice?.puntoVenta != null && effectiveBranchId != null) {
      const salePoint = await tx.salePoint.findFirst({
        where: {
          companyId: req.authUser!.companyId,
          branchId: effectiveBranchId,
          number: data.invoice.puntoVenta,
        },
        select: { id: true },
      });
      if (!salePoint) {
        throw Object.assign(
          new Error('El punto de venta no pertenece a la sucursal del comprobante'),
          { status: 400 },
        );
      }
    }

    const document = await tx.document.create({
      data: {
        companyId: req.authUser!.companyId,
        type,
        series: salePointSeries,
        number: await reserveNextNumber(tx, req.authUser!.companyId, type, salePointSeries),
        date: data.date ? new Date(data.date) : new Date(),
        clientId,
        supplierId,
        userId: req.authUser!.userId,
        branchId: effectiveBranchId,
        warehouseId: effectiveWarehouseId,
        destinationWarehouseId: effectiveDestinationWarehouseId,
        sourceDocumentId: data.sourceDocumentId,
        externalNumber: data.externalNumber,
        idempotencyKey: data.idempotencyKey,
        currency: effectiveCurrency,
        exchangeRate: effectiveExchangeRate,
        ...headerSnapshot,
        status,
        subtotal,
        totalTax,
        total,
        notes: data.notes,
        items: {
          create: lines.map((l) => ({
            productId: l.productId,
            sourceDocumentItemId: l.sourceDocumentItemId,
            sku: l.product.internalCode,
            taxName: l.product.taxName,
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
                  supplierCuit: headerSnapshot.supplierTaxId,
                  supplierName: headerSnapshot.supplierName,
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
                  cashBoxId: p.method === 'Efectivo' ? (openCashBox?.id ?? null) : null,
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
                    cashBoxId:
                      data.paymentMethod === 'Efectivo' ? (openCashBox?.id ?? null) : null,
                  },
                },
              }
            : {}),
      },
      include: { items: true, payments: true, invoiceData: true },
    });

    // Stock side effects with movements.
    if (isStockType || isRemitoIngreso || dispatchesPedido) {
      for (const line of lines) {
        if (isRemitoIngreso) {
          // Physical receipt: first arrival of a product upserts the row.
          await tx.stock.upsert({
            where: {
              productId_warehouseId: { productId: line.productId, warehouseId: line.warehouseId! },
            },
            create: { productId: line.productId, warehouseId: line.warehouseId!, quantity: line.quantity, minStock: 0 },
            update: { quantity: { increment: line.quantity } },
          });
          await tx.stockMovement.create({
            data: {
              productId: line.productId,
              warehouseToId: line.warehouseId,
              quantity: line.quantity,
              type: 'ENTRADA',
              reason: `REMITO ${data.series}-${String(document.number).padStart(4, '0')}`,
              userId: req.authUser!.userId,
              documentId: document.id,
            },
          });
          continue;
        }
        if (type === DocumentType.VENTA || dispatchesPedido) {
          // Atomic guarded decrement: a single conditional UPDATE, so two
          // concurrent sales can never both pass a read-then-write check and
          // oversell the same units (lost update + negative stock).
          const updated = await tx.stock.updateMany({
            where: {
              productId: line.productId,
              warehouseId: line.warehouseId!,
              quantity: { gte: line.quantity },
            },
            data: { quantity: { decrement: line.quantity } },
          });
          if (updated.count === 0) {
            const current = await tx.stock.findUnique({
              where: {
                productId_warehouseId: {
                  productId: line.productId,
                  warehouseId: line.warehouseId!,
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
              productId_warehouseId: { productId: line.productId, warehouseId: line.warehouseId! },
            },
            create: {
              productId: line.productId,
              warehouseId: line.warehouseId!,
              quantity: line.quantity,
              minStock: 0,
            },
            update: { quantity: { increment: line.quantity } },
          });
        }

        await tx.stockMovement.create({
          data: {
            productId: line.productId,
            warehouseFromId: type === DocumentType.VENTA || dispatchesPedido ? line.warehouseId : null,
            warehouseToId: type === DocumentType.COMPRA ? line.warehouseId : null,
            quantity: line.quantity,
            type: type === DocumentType.VENTA || dispatchesPedido ? 'SALIDA' : 'ENTRADA',
            reason: `${type} ${data.series}-${String(document.number).padStart(4, '0')}`,
            userId: req.authUser!.userId,
            documentId: document.id,
          },
        });
      }
    }

    if (completesPedidoDispatch && pedidoSource && pedidoSource.status !== 'Enviado') {
      await tx.document.update({ where: { id: pedidoSource.id }, data: { status: 'Enviado' } });
      await logAudit(tx, req.authUser!.companyId, req.authUser!.userId, {
        action: 'Cambio de estado de Pedido',
        module: 'Ventas',
        entity: 'Document',
        entityId: pedidoSource.id,
        details: `PEDIDO ${pedidoSource.series}-${String(pedidoSource.number).padStart(4, '0')}: ${pedidoSource.status} → Enviado por despacho completo`,
      }, clientIp(req));
    }

    // Audit trail inside the same transaction as the document creation.
    const auditAction =
      type === DocumentType.REMITO
        ? 'Registro de Remito'
        : type === DocumentType.FACTURA
          ? 'Registro de Factura'
          : 'Creación de Comprobante';
    const auditModule =
      isDirectionalType
        ? direction === 'egreso' ? 'Ventas' : 'Compras'
        : DOCUMENT_PERMISSION[type] === 'compras.escribir' ? 'Compras' : 'Ventas';
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
  }).catch(async (error: unknown) => {
    // Race: two concurrent creates with the same key; the unique
    // (companyId, idempotencyKey) index makes one insert fail. The loser
    // replays the winner's document instead of erroring.
    const prismaError = error as { code?: string; meta?: { target?: unknown } };
    const target = Array.isArray(prismaError.meta?.target)
      ? prismaError.meta.target.join(',')
      : String(prismaError.meta?.target ?? '');
    if (prismaError.code === 'P2002' && target.includes('idempotencyKey') && data.idempotencyKey) {
      const prior = await prisma.document.findFirst({
        where: { companyId: req.authUser!.companyId, idempotencyKey: data.idempotencyKey },
        include: { items: true, payments: true, invoiceData: true },
      });
      if (prior) {
        replayed = true;
        return prior;
      }
    }
    throw error;
  });

  res.status(replayed ? 200 : 201).json(result);
});

const receiveSchema = z.object({
  idempotencyKey: z.uuid(),
  items: z
    .array(
      z.object({
        productId: z.number().int().positive(),
        sourceDocumentItemId: z.number().int().positive().optional(),
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

type ReceiptCommand = z.infer<typeof receiveSchema>;

function receiptCommandFingerprint(orderId: number, data: ReceiptCommand): string {
  const canonicalCommand = {
    orderId,
    warehouseId: data.warehouseId,
    items: [...data.items]
      .sort((left, right) => left.productId - right.productId)
      .map((item) => ({ productId: item.productId, sourceDocumentItemId: item.sourceDocumentItemId ?? null, quantity: item.quantity })),
    externalNumber: data.externalNumber?.trim() || null,
    date: data.date ? new Date(data.date).toISOString() : null,
    notes: data.notes?.trim() || null,
  };
  return createHash('sha256').update(JSON.stringify(canonicalCommand)).digest('hex');
}

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
  const data = parseBody(res, receiveSchema, req.body);
  if (!data) return;
  if (
    new Set(data.items.map((item) => item.productId)).size !== data.items.length
    && (
      data.items.some((item) => item.sourceDocumentItemId === undefined)
      || new Set(data.items.map((item) => item.sourceDocumentItemId)).size !== data.items.length
    )
  ) {
    res.status(400).json({ error: 'No se puede repetir el mismo producto en una recepción' });
    return;
  }
  const companyId = req.authUser!.companyId;
  const receiptFingerprint = receiptCommandFingerprint(id, data);

  // Most retries never need to open the business transaction. The unique
  // tenant-scoped key is still checked again after locking the OC below so two
  // concurrent first attempts remain safe.
  const priorReceipt = await prisma.document.findFirst({
    where: { ...documentBranchWhere(req), idempotencyKey: data.idempotencyKey },
    include: { items: true, sourceDocument: { select: { status: true } } },
  });
  if (priorReceipt) {
    if (priorReceipt.type !== DocumentType.REMITO || priorReceipt.sourceDocumentId !== id) {
      throw Object.assign(new Error('La clave de reintento ya fue usada en otra operación'), {
        status: 409,
      });
    }
    if (priorReceipt.receiptFingerprint !== receiptFingerprint) {
      throw Object.assign(
        new Error('La clave de reintento corresponde a una recepción con datos diferentes'),
        { status: 409 },
      );
    }
    res.status(200).json({
      ok: true,
      document: priorReceipt,
      ocStatus: priorReceipt.sourceDocument?.status ?? 'Parcial',
      replayed: true,
    });
    return;
  }

  const result = await prisma.$transaction(async (tx) => {
    // Serialize every receipt of this OC before reading its status, children or
    // pending quantities. MySQL/InnoDB keeps this row lock until commit.
    const lockedOrders = await tx.$queryRaw<{ id: number }[]>`
      SELECT id FROM comprobantes
      WHERE id = ${id} AND companyId = ${companyId} AND type = ${DocumentType.OC}
      FOR UPDATE
    `;
    if (lockedOrders.length === 0) {
      throw Object.assign(new Error('Orden de compra no encontrada'), { status: 404 });
    }

    const oc = await tx.document.findFirst({
      where: { id, ...documentBranchWhere(req), type: DocumentType.OC },
      include: { items: true },
    });
    if (!oc) {
      throw Object.assign(new Error('Orden de compra no encontrada'), { status: 404 });
    }

    // A racing replay waited on the OC lock. Return the winner rather than
    // creating another document, stock movement or audit entry. This check is
    // intentionally after the branch-scoped OC lookup to avoid cross-branch
    // disclosure of opaque command keys.
    const racedReceipt = await tx.document.findFirst({
      where: { ...documentBranchWhere(req), idempotencyKey: data.idempotencyKey },
      include: { items: true, sourceDocument: { select: { status: true } } },
    });
    if (racedReceipt) {
      if (racedReceipt.type !== DocumentType.REMITO || racedReceipt.sourceDocumentId !== id) {
        throw Object.assign(new Error('La clave de reintento ya fue usada en otra operación'), {
          status: 409,
        });
      }
      if (racedReceipt.receiptFingerprint !== receiptFingerprint) {
        throw Object.assign(
          new Error('La clave de reintento corresponde a una recepción con datos diferentes'),
          { status: 409 },
        );
      }
      return {
        document: racedReceipt,
        ocStatus: racedReceipt.sourceDocument?.status ?? 'Parcial',
        replayed: true,
      };
    }
    if (oc.status === 'Recibido') {
      throw Object.assign(new Error('La orden ya fue recibida completamente'), { status: 409 });
    }

    const warehouse = await tx.warehouse.findFirst({ where: { id: data.warehouseId, companyId } });
    if (!warehouse) {
      throw Object.assign(new Error('Depósito no válido'), { status: 400 });
    }
    if (!req.authUser!.isOwner && warehouse.branchId !== req.authUser!.branchId) {
      throw Object.assign(new Error('Depósito fuera de la sucursal asignada'), { status: 403 });
    }
    if (oc.branchId !== null && warehouse.branchId !== oc.branchId) {
      throw Object.assign(new Error('El depósito no pertenece a la sucursal de la orden'), {
        status: 409,
      });
    }
    if (oc.warehouseId !== null && data.warehouseId !== oc.warehouseId) {
      throw Object.assign(new Error('La recepción debe ingresar al depósito de la orden'), {
        status: 409,
      });
    }

    // Already-received quantities by OC line. Legacy unlinked receipts reserve
    // same-product quantities against OC lines in order, without undercounting.
    const children = await tx.document.findMany({
      where: { companyId, sourceDocumentId: oc.id, type: DocumentType.REMITO },
      include: { items: true },
    });
    const receivedBySourceLine = new Map<number, number>();
    const legacyReceivedByProduct = new Map<number, number>();
    const ocItemsById = new Map(oc.items.map((line) => [line.id, line]));
    for (const child of children) {
      for (const line of child.items) {
        if (!line.productId) continue;
        const sourceLine = line.sourceDocumentItemId
          ? ocItemsById.get(line.sourceDocumentItemId)
          : undefined;
        if (sourceLine?.productId === line.productId) {
          receivedBySourceLine.set(line.sourceDocumentItemId!,
            (receivedBySourceLine.get(line.sourceDocumentItemId!) ?? 0) + Number(line.quantity));
        } else {
          legacyReceivedByProduct.set(line.productId,
            (legacyReceivedByProduct.get(line.productId) ?? 0) + Number(line.quantity));
        }
      }
    }
    const pendingBySourceLine = new Map<number, number>();
    for (const sourceLine of oc.items) {
      const priorSameProduct = oc.items.filter((candidate) =>
        candidate.productId === sourceLine.productId && candidate.id < sourceLine.id);
      const legacyBefore = priorSameProduct.reduce((total, candidate) => total + Math.max(
        0,
        Number(candidate.quantity) - (receivedBySourceLine.get(candidate.id) ?? 0),
      ), 0);
      const legacy = legacyReceivedByProduct.get(sourceLine.productId ?? -1) ?? 0;
      const availableBeforeLegacy = Math.max(
        0,
        Number(sourceLine.quantity) - (receivedBySourceLine.get(sourceLine.id) ?? 0),
      );
      const legacyForLine = Math.min(Math.max(0, legacy - legacyBefore), availableBeforeLegacy);
      pendingBySourceLine.set(sourceLine.id, Math.max(0, availableBeforeLegacy - legacyForLine));
    }

    const lines: {
      productId: number;
      sourceDocumentItemId: number;
      quantity: number;
      unitPrice: number;
      taxRate: number;
      discount: number;
      lineTotal: number;
      taxAmount: number;
      productName: string;
      sku: string | null;
      taxName: string;
    }[] = [];

    for (const item of data.items) {
      const matchingOcLines = oc.items.filter((line) => line.productId === item.productId);
      const ocLine = item.sourceDocumentItemId
        ? matchingOcLines.find((line) => line.id === item.sourceDocumentItemId)
        : matchingOcLines.length === 1 ? matchingOcLines[0] : undefined;
      if (!ocLine) {
        throw Object.assign(new Error(matchingOcLines.length > 1
          ? `El producto ${item.productId} aparece en varias líneas de la orden; indique la línea de origen`
          : `El producto ${item.productId} no está en la orden`), {
          status: 400,
        });
      }
      if (item.sourceDocumentItemId && item.sourceDocumentItemId !== ocLine.id) {
        throw Object.assign(new Error('La línea de origen no corresponde al producto indicado'), { status: 400 });
      }
      const pending = pendingBySourceLine.get(ocLine.id) ?? 0;
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
      // The ordered discount is split proportionally across receipts so partial
      // receipts add up to the full line discount, same as the generic path.
      const discount = (Number(ocLine.discount) / Number(ocLine.quantity)) * item.quantity;
      const gross = unitPrice * item.quantity;
      const lineTotal = gross - discount;
      lines.push({
        productId: item.productId,
        sourceDocumentItemId: ocLine.id,
        quantity: item.quantity,
        unitPrice,
        taxRate,
        discount,
        lineTotal,
        taxAmount: (lineTotal * taxRate) / 100,
        // Frozen at order time: a later catalog rename must not rewrite history.
        productName: ocLine.description,
        sku: product.internalCode,
        taxName: product.tax.name,
      });
    }

    const subtotal = lines.reduce((acc, l) => acc + l.lineTotal, 0);
    const totalTax = lines.reduce((acc, l) => acc + l.taxAmount, 0);
    const total = subtotal + totalTax;

    const receiveBranchId = req.authUser!.isOwner
      ? (oc.branchId ?? warehouse.branchId)
      : req.authUser!.branchId!;
    // Same frozen header rule as POST /api/documents: the received remito keeps
    // its own company/supplier/branch identity from creation time.
    const headerSnapshot = await buildHeaderSnapshot(tx, {
      companyId,
      supplierId: oc.supplierId,
      branchId: receiveBranchId,
    });

    const remito = await tx.document.create({
      data: {
        companyId,
        type: DocumentType.REMITO,
        series: 'A',
        number: await reserveNextNumber(tx, companyId, DocumentType.REMITO, 'A'),
        date: data.date ? new Date(data.date) : new Date(),
        supplierId: oc.supplierId,
        userId: req.authUser!.userId,
        branchId: receiveBranchId,
        warehouseId: data.warehouseId,
        sourceDocumentId: oc.id,
        idempotencyKey: data.idempotencyKey,
        receiptFingerprint,
        externalNumber: data.externalNumber,
        ...headerSnapshot,
        status: 'Recibido',
        subtotal,
        totalTax,
        total,
        notes: data.notes,
        items: {
          create: lines.map((l) => ({
            productId: l.productId,
            sourceDocumentItemId: l.sourceDocumentItemId,
            sku: l.sku,
            taxName: l.taxName,
            description: l.productName,
            quantity: l.quantity,
            unitPrice: l.unitPrice,
            taxRate: l.taxRate,
            discount: l.discount,
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
    const allComplete = oc.items.every((l) => {
      if (!l.productId) return true;
      const receivedNow = lines
        .filter((line) => line.sourceDocumentItemId === l.id)
        .reduce((total, line) => total + line.quantity, 0);
      return (pendingBySourceLine.get(l.id) ?? 0) - receivedNow <= 0.000001;
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

    return { document: remito, ocStatus, replayed: false };
  }).catch((error: unknown) => {
    const prismaError = error as { code?: string; meta?: { target?: unknown } };
    const target = Array.isArray(prismaError.meta?.target)
      ? prismaError.meta.target.join(',')
      : String(prismaError.meta?.target ?? '');
    if (prismaError.code === 'P2002' && target.includes('idempotencyKey')) {
      throw Object.assign(new Error('La clave de reintento ya fue usada en otra operación'), {
        status: 409,
      });
    }
    throw error;
  });

  res.status(result.replayed ? 200 : 201).json({ ok: true, ...result });
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

/** AFIP voucher letter implied by the supplier master tax condition. With no
 * master data the capture flow falls back to the simulated 'X' letter. */
function invoiceTypeFromSupplier(taxCondition: string | null | undefined): string {
  const cond = taxCondition?.toLowerCase() ?? '';
  if (cond.includes('monotributo') || cond.includes('no inscript')) return 'C';
  if (cond.includes('exento')) return 'B';
  if (cond.includes('responsable inscript')) return 'A';
  return 'X';
}

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
    const data = parseBody(res, externalVoucherSchema, req.body);
    if (!data) return;

    const result = await prisma.$transaction(async (tx) => {
const document = await tx.document.findFirst({
        where: { id, ...documentBranchWhere(req) },
        select: { id: true, type: true, supplierId: true, externalNumber: true },
      });
      if (!document) throw Object.assign(new Error('Comprobante no encontrado'), { status: 404 });

      const invoice = await tx.invoiceData.findUnique({
        where: { documentId: id },
        select: { confirmedAt: true },
      });

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

      // The voucher letter comes from the supplier master, not a hardcoded 'X'.
      const supplier = document.supplierId
        ? await tx.supplier.findFirst({
          where: { id: document.supplierId, companyId: req.authUser!.companyId },
          select: { taxCondition: true },
        })
        : null;
      const invoiceType = document.type === DocumentType.FACTURA
        ? invoiceTypeFromSupplier(supplier?.taxCondition)
        : null;

      // Decision 5 of DOCUMENT_FLOW_PENDING.md: a confirmed capture is frozen.
      // Corrections are compensatory (a new capture), never a rewrite. Re-sending
      // the same number stays a no-op so the wizard can reload the whole form.
      if (
        data.externalNumber !== undefined
        && data.externalNumber !== (document.externalNumber ?? null)
        && invoice?.confirmedAt
      ) {
        throw Object.assign(new Error('El número externo ya fue confirmado; no se modifica'), { status: 400 });
      }

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
            invoiceType,
            emissionDate: data.emissionDate ? new Date(data.emissionDate) : undefined,
            supplierCuit: data.supplierCuit,
            supplierName: data.supplierName,
            externalSubtotal: data.externalSubtotal,
            externalTax: data.externalTax,
            externalTotal: data.externalTotal,
            ingestionMethod: data.ingestionMethod,
            verifiedByUserId: req.authUser!.userId,
            // The first voucher-data write confirms the capture. An attachment
            // alone does not: the UI attaches first and fills the number next.
            confirmedAt: new Date(),
          },
          update: {
            invoiceType,
            emissionDate: data.emissionDate ? new Date(data.emissionDate) : undefined,
            supplierCuit: data.supplierCuit,
            supplierName: data.supplierName,
            externalSubtotal: data.externalSubtotal,
            externalTax: data.externalTax,
            externalTotal: data.externalTotal,
            ingestionMethod: data.ingestionMethod,
            // The last user to confirm the capture becomes the verifier.
            verifiedByUserId: req.authUser!.userId,
            confirmedAt: invoice?.confirmedAt ?? new Date(),
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

    const target = await prisma.document.findFirst({ where: { id, ...documentBranchWhere(req) }, select: { id: true } });
    if (!target) {
      res.status(404).json({ error: 'Comprobante no encontrado' });
      return;
    }
    // Write first, then reference: if the disk write fails the row is never
    // created. If the transaction fails afterwards, remove the orphan file.
    await fs.promises.writeFile(filePath, req.file.buffer);

    let result: { ok: true; attachmentUrl: string };
    try {
      result = await prisma.$transaction(async (tx) => {
const document = await tx.document.findFirst({
        where: { id, ...documentBranchWhere(req) },
        select: { id: true, type: true, supplierId: true },
      });
      if (!document) throw Object.assign(new Error('Comprobante no encontrado'), { status: 404 });

      const supplier = document.supplierId
        ? await tx.supplier.findFirst({
          where: { id: document.supplierId, companyId: req.authUser!.companyId },
          select: { taxCondition: true },
        })
        : null;
      const invoiceType = document.type === DocumentType.FACTURA
        ? invoiceTypeFromSupplier(supplier?.taxCondition)
        : null;

      const attachmentUrl = `/uploads/${filename}`;
      await tx.invoiceData.upsert({
        where: { documentId: id },
        create: {
          documentId: id,
          invoiceType,
          attachmentUrl,
          verifiedByUserId: req.authUser!.userId,
        },
        update: { invoiceType, attachmentUrl, verifiedByUserId: req.authUser!.userId },
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
      where: { documentId: id, document: { is: documentBranchWhere(req) } },
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
