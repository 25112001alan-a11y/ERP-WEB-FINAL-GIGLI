import { Router } from 'express';
import { z } from 'zod';
import { DocumentType } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { requireAuth, requirePermission, tenantWhere } from '../middleware/auth.js';

const router = Router();

router.use(requireAuth);
router.use(requirePermission('ventas.leer'));

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
router.get('/', async (req, res) => {
  const { type } = req.query;
  const documents = await prisma.document.findMany({
    where: {
      ...tenantWhere(req),
      ...(typeof type === 'string' ? { type: type as DocumentType } : {}),
    },
    include: {
      client: { select: { id: true, name: true } },
      supplier: { select: { id: true, name: true } },
      warehouse: { select: { name: true } },
      items: { select: { id: true, description: true, quantity: true, lineTotal: true } },
    },
    orderBy: { createdAt: 'desc' },
  });
  res.json(documents);
});

/** GET /api/documents/:id */
router.get('/:id', async (req, res) => {
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

export default router;
