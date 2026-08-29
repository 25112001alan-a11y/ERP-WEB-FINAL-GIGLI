import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';

const router = Router();

/**
 * Resolves the public tenant: the first company that has products in the
 * catalog. A B2B portal would use a slug/token; the demo keeps one public shop.
 */
async function publicCompany() {
  const company = await prisma.company.findFirst({
    where: { products: { some: {} } },
    orderBy: { id: 'asc' },
    select: { id: true },
  });
  return company ?? null;
}

/** GET /api/public/products — active catalog for the public storefront (no auth) */
router.get('/products', async (_req, res) => {
  const company = await publicCompany();
  if (!company) {
    res.json([]);
    return;
  }

  const products = await prisma.product.findMany({
    where: { companyId: company.id, active: true },
    include: {
      category: { select: { name: true } },
      tax: { select: { name: true, rate: true } },
      stocks: { select: { quantity: true } },
    },
    orderBy: { name: 'asc' },
  });

  res.json(
    products.map((p) => ({
      id: p.id,
      name: p.name,
      description: p.description,
      sku: p.internalCode,
      category: p.category?.name ?? 'Sin categoría',
      price: Number(p.salePrice),
      taxRate: Number(p.tax.rate),
      stock: p.stocks.reduce((acc, s) => acc + Number(s.quantity), 0),
    })),
  );
});

const publicOrderSchema = z.object({
  clientName: z.string().min(2).max(150),
  clientEmail: z.string().email().optional(),
  clientPhone: z.string().max(30).optional(),
  warehouseId: z.number().int().positive().optional(),
  notes: z.string().max(500).optional(),
  items: z
    .array(z.object({ productId: z.number().int().positive(), quantity: z.number().positive() }))
    .min(1, 'El pedido debe tener al menos un producto'),
});

/** POST /api/public/orders — public checkout: creates a client and a PEDIDO document (no auth) */
router.post('/orders', async (req, res) => {
  const parsed = publicOrderSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Datos inválidos', details: parsed.error.flatten() });
    return;
  }
  const data = parsed.data;

  const company = await publicCompany();
  if (!company) {
    res.status(503).json({ error: 'Catálogo no disponible' });
    return;
  }
  const companyId = company.id;

  const result = await prisma.$transaction(async (tx) => {
    // Resolve the actor: the first user of the tenant owns public documents.
    const owner = await tx.user.findFirst({
      where: { companyId },
      orderBy: { createdAt: 'asc' },
      select: { id: true },
    });
    if (!owner) {
      throw Object.assign(new Error('Tenant sin operadores'), { status: 500 });
    }

    // Validate products and compute totals with the same math as the admin API.
    const lines = [];
    let subtotal = 0;
    let totalTax = 0;
    for (const item of data.items) {
      const product = await tx.product.findFirst({
        where: { id: item.productId, companyId, active: true },
        include: { tax: true },
      });
      if (!product) {
        throw Object.assign(new Error(`Producto ${item.productId} no disponible`), { status: 400 });
      }
      const lineTotal = Number(product.salePrice) * item.quantity;
      const taxAmount = (lineTotal * Number(product.tax.rate)) / 100;
      subtotal += lineTotal;
      totalTax += taxAmount;
      lines.push({
        productId: product.id,
        description: product.name,
        quantity: item.quantity,
        unitPrice: Number(product.salePrice),
        taxRate: Number(product.tax.rate),
        discount: 0,
        lineTotal,
      });
    }

    // Find-or-create the client by email when present, else by name.
    let client = data.clientEmail
      ? await tx.client.findFirst({ where: { companyId, email: data.clientEmail } })
      : await tx.client.findFirst({ where: { companyId, name: data.clientName } });
    if (!client) {
      client = await tx.client.create({
        data: {
          companyId,
          name: data.clientName,
          type: 'Mayorista',
          email: data.clientEmail ?? null,
          phone: data.clientPhone ?? null,
        },
      });
    }

    const next = await tx.document.findFirst({
      where: { companyId, type: 'PEDIDO', series: 'A' },
      orderBy: { number: 'desc' },
      select: { number: true },
    });
    const number = (next?.number ?? 0) + 1;

    const document = await tx.document.create({
      data: {
        companyId,
        type: 'PEDIDO',
        series: 'A',
        number,
        date: new Date(),
        clientId: client.id,
        userId: owner.id,
        warehouseId: data.warehouseId ?? null,
        status: 'Abierto',
        subtotal,
        totalTax,
        total: subtotal + totalTax,
        currency: 'USD',
        notes: data.notes ?? null,
        items: { create: lines },
      },
      include: { items: true },
    });

    return { document, clientName: client.name };
  });

  res.status(201).json({
    id: String(result.document.id),
    number: `PEDIDO A-${String(result.document.number).padStart(4, '0')}`,
    clientName: result.clientName,
    total: Number(result.document.total),
    status: result.document.status,
    date: result.document.date,
  });
});

/** GET /api/public/orders?email= — order lookup for a client (no auth) */
router.get('/orders', async (req, res) => {
  const email = typeof req.query.email === 'string' ? req.query.email.trim() : '';
  if (!email) {
    res.status(400).json({ error: 'Se requiere el email del cliente' });
    return;
  }

  const company = await publicCompany();
  if (!company) {
    res.json([]);
    return;
  }

  const client = await prisma.client.findFirst({
    where: { companyId: company.id, email },
    select: { id: true },
  });
  if (!client) {
    res.json([]);
    return;
  }

  const orders = await prisma.document.findMany({
    where: { companyId: company.id, clientId: client.id, type: 'PEDIDO' },
    orderBy: { date: 'desc' },
    include: { items: true },
  });

  res.json(
    orders.map((o) => ({
      id: String(o.id),
      number: `PEDIDO A-${String(o.number).padStart(4, '0')}`,
      date: o.date,
      status: o.status,
      total: Number(o.total),
      items: o.items.map((i) => ({
        description: i.description,
        quantity: Number(i.quantity),
        unitPrice: Number(i.unitPrice),
        lineTotal: Number(i.lineTotal),
      })),
    })),
  );
});

export default router;