import { Router } from 'express';
import { z } from 'zod';
import { DocumentType } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import {
  requireAuth,
  requirePermission,
  requireAnyPermission,
  tenantWhere,
  getUserPermissions,
} from '../middleware/auth.js';

const router = Router();

router.use(requireAuth);

// Document types map to their owning module. VENTA/PEDIDO/COTIZACION belong to
// sales; OC/COMPRA/REMITO belong to purchases.
const DOCUMENT_PERMISSION: Record<DocumentType, string> = {
  [DocumentType.OC]: 'compras.escribir',
  [DocumentType.COMPRA]: 'compras.escribir',
  [DocumentType.REMITO]: 'compras.escribir',
  [DocumentType.COTIZACION]: 'ventas.escribir',
  [DocumentType.VENTA]: 'ventas.escribir',
  [DocumentType.PEDIDO]: 'ventas.escribir',
};

const itemSchema = z.object({
  productId: z.number().int().positive(),
  quantity: z.number().positive(),
  unitPrice: z.number().positive().optional(),
  discount: z.number().nonnegative().optional().default(0),
});

const documentSchema = z.object({
  type: z.enum(['OC', 'COMPRA', 'VENTA', 'COTIZACION', 'REMITO', 'PEDIDO']),
  series: z.string().max(10).optional().default('A'),
  date: z.string().datetime().optional(),
  clientId: z.number().int().positive().optional(),
  clientName: z.string().min(1).max(150).optional(),
  supplierId: z.number().int().positive().optional(),
  supplierName: z.string().min(1).max(150).optional(),
  branchId: z.number().int().positive().optional(),
  warehouseId: z.number().int().positive().optional(),
  destinationWarehouseId: z.number().int().positive().optional(),
  paymentMethod: z.string().max(30).optional(),
  notes: z.string().optional(),
});

/**
 * Returns the next fiscal number for (companyId, type, series).
 * The DB unique constraint (companyId, type, series, number) is the backstop.
 */
async function nextNumber(
  companyId: number,
  type: DocumentType,
  series: string,
): Promise<number> {
  const last = await prisma.document.findFirst({
    where: { companyId, type, series },
    orderBy: { number: 'desc' },
    select: { number: true },
  });
  return last ? last.number + 1 : 1;
}

/** GET /api/documents — tenant-scoped list with totals */
router.get('/', requireAnyPermission('ventas.leer', 'compras.leer'), async (req, res) => {
  const { type } = req.query;
  const documents = await prisma.document.findMany({
    where: {
      ...tenantWhere(req),
      ...(typeof type === 'string' ? { type: type as DocumentType } : {}),
    },
    include: {
      client: { select: { id: true, name: true, type: true } },
      supplier: { select: { id: true, name: true } },
      warehouse: { select: { name: true } },
      payments: { select: { id: true, method: true, status: true } },
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
  const id = Number(req.params.id);
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
    },
  });
  if (!document) {
    res.status(404).json({ error: 'Comprobante no encontrado' });
    return;
  }
  res.json(document);
});

/**
 * POST /api/documents
 * Creates a document with its items. VENTA and COMPRA move stock atomically:
 *   - VENTA  : decrements warehouse stock, writes SALIDA movements
 *   - COMPRA : increments warehouse stock, writes ENTRADA movements
 * Other types are created without stock side effects.
 * Fiscal numbering is auto-incremented per (companyId, type, series).
 */
router.post('/', requirePermission('ventas.escribir'), async (req, res) => {
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

  // Permission depends on the document's owning module (sales vs purchases).
  const requiredPermission = DOCUMENT_PERMISSION[type];
  const userPermissions = await getUserPermissions(req);
  if (!userPermissions.has(requiredPermission)) {
    res.status(403).json({ error: `Permiso requerido: ${requiredPermission}` });
    return;
  }

  const isStockType = type === DocumentType.VENTA || type === DocumentType.COMPRA;
  if (isStockType && !data.warehouseId) {
    res.status(400).json({ error: `Los comprobantes ${type} requieren warehouseId` });
    return;
  }
  if (type === DocumentType.VENTA && !data.clientId && !data.clientName) {
    res.status(400).json({ error: 'Los comprobantes VENTA requieren clientId o clientName' });
    return;
  }
  if (type === DocumentType.COMPRA && !data.supplierId && !data.supplierName) {
    res.status(400).json({ error: 'Los comprobantes COMPRA requieren supplierId o supplierName' });
    return;
  }

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

    // Stock availability + mutation for stock types.
    if (isStockType) {
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

    const document = await tx.document.create({
      data: {
        companyId: req.authUser!.companyId,
        type,
        series: data.series,
        number: await nextNumber(req.authUser!.companyId, type, data.series),
        date: data.date ? new Date(data.date) : new Date(),
        clientId,
        supplierId,
        userId: req.authUser!.userId,
        branchId: data.branchId,
        warehouseId: data.warehouseId,
        destinationWarehouseId: data.destinationWarehouseId,
        status: data.paymentMethod
          ? 'Pagado'
          : type === DocumentType.COMPRA
            ? 'Recibido'
            : 'Abierto',
        subtotal,
        totalTax,
        total,
        currency: 'USD',
        exchangeRate: 1,
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
        ...(data.paymentMethod
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
      include: { items: true, payments: true },
    });

    // Stock side effects with movements.
    if (isStockType) {
      for (const line of lines) {
        const current = await tx.stock.findUnique({
          where: {
            productId_warehouseId: { productId: line.productId, warehouseId: data.warehouseId! },
          },
        });
        const nextQty =
          type === DocumentType.VENTA
            ? Number(current!.quantity) - line.quantity
            : Number(current!.quantity) + line.quantity;

        await tx.stock.update({
          where: { id: current!.id },
          data: { quantity: nextQty },
        });

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
  paymentMethod: z.string().max(30).optional(),
  date: z.string().datetime().optional(),
  notes: z.string().optional(),
});

/**
 * POST /api/documents/:id/receive
 * Receives goods against an open purchase order (type OC):
 *   - validates each line against the pending quantity (ordered - already received)
 *   - creates a COMPRA chained to the OC via sourceDocumentId
 *   - increments stock (ENTRADA movements) atomically
 *   - marks the OC as Parcial or Recibido
 */
router.post('/:id/receive', requirePermission('compras.escribir'), async (req, res) => {
  const id = Number(req.params.id);
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

    // Already-received quantities per product, from chained COMPRA documents.
    const children = await tx.document.findMany({
      where: { companyId, sourceDocumentId: oc.id, type: DocumentType.COMPRA },
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

    const compra = await tx.document.create({
      data: {
        companyId,
        type: DocumentType.COMPRA,
        series: 'A',
        number: await nextNumber(companyId, DocumentType.COMPRA, 'A'),
        date: data.date ? new Date(data.date) : new Date(),
        supplierId: oc.supplierId,
        userId: req.authUser!.userId,
        warehouseId: data.warehouseId,
        sourceDocumentId: oc.id,
        status: 'Recibido',
        subtotal,
        totalTax,
        total,
        currency: 'USD',
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
        ...(data.paymentMethod
          ? {
              payments: {
                create: {
                  companyId,
                  amount: total,
                  method: data.paymentMethod,
                  status: 'Pagado',
                },
              },
            }
          : {}),
      },
      include: { items: true, payments: true },
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
          reason: `COMPRA A-${String(compra.number).padStart(4, '0')} (recepción OC A-${String(oc.number).padStart(4, '0')})`,
          userId: req.authUser!.userId,
          documentId: compra.id,
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

    return { document: compra, ocStatus };
  });

  res.status(201).json({ ok: true, ...result });
});

export default router;
