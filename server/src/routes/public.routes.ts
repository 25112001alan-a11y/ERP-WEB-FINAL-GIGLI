import { Router } from 'express';
import { z } from 'zod';
import { DocumentType } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { parseBody } from '../lib/parseBody.js';
import { reserveNextNumber } from '../lib/numbering.js';
import { buildHeaderSnapshot } from '../lib/headerSnapshots.js';

const router = Router();

/**
 * Resolves the public tenant from its storefront slug. Every company owns a
 * unique slug (generated at registration) so the storefront is tenant-scoped:
 * a client of company A can never see or order from company B's catalog.
 */
async function storeCompany(slug: string) {
  if (!slug) return null;
  return prisma.company.findUnique({
    where: { slug },
    select: { id: true, name: true, slug: true, currency: true },
  });
}

/** GET /api/public/store/:slug — active catalog for a tenant's storefront (no auth) */
router.get('/store/:slug/products', async (req, res) => {
  const company = await storeCompany(req.params.slug);
  if (!company) {
    res.status(404).json({ error: 'Tienda no encontrada' });
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

  res.json({
    company: { name: company.name, slug: company.slug, currency: company.currency },
    products: products.map((p) => ({
      id: p.id,
      name: p.name,
      description: p.description,
      sku: p.internalCode,
      category: p.category?.name ?? 'Sin categoría',
      price: Number(p.salePrice),
      taxRate: Number(p.tax.rate),
      stock: p.stocks.reduce((acc, s) => acc + Number(s.quantity), 0),
    })),
  });
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

/** POST /api/public/store/:slug/orders — checkout against one tenant (no auth) */
router.post('/store/:slug/orders', async (req, res) => {
  const data = parseBody(res, publicOrderSchema, req.body);
  if (!data) return;

  const company = await storeCompany(req.params.slug);
  if (!company) {
    res.status(404).json({ error: 'Tienda no encontrada' });
    return;
  }
  const companyId = company.id;

  const result = await prisma.$transaction(async (tx) => {
    if (data.warehouseId && !await tx.warehouse.findFirst({
      where: { id: data.warehouseId, companyId }, select: { id: true },
    })) {
      throw Object.assign(new Error('Depósito no válido'), { status: 400 });
    }
    // Resolve the actor: the first user of the tenant owns public documents.
    const owner = await tx.user.findFirst({
      where: { companyId },
      orderBy: { createdAt: 'asc' },
      select: { id: true },
    });
    if (!owner) {
      throw Object.assign(new Error('Tenant sin operadores'), { status: 500 });
    }

    // Validate products against THIS tenant and compute totals with the same
    // math as the admin API. A product id from another tenant 404s.
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
      // No catalog discount exists on Product, so every line keeps the schema
      // default (0): the storefront never invents a discount for the order.
      lines.push({
        productId: product.id,
        sku: product.internalCode,
        taxName: product.tax.name,
        description: product.name,
        quantity: item.quantity,
        unitPrice: Number(product.salePrice),
        taxRate: Number(product.tax.rate),
        lineTotal,
      });
    }

    // Find-or-create the client by email when present, else by name.
    let client = data.clientEmail
      ? await tx.client.findFirst({ where: { companyId, email: data.clientEmail } })
      : await tx.client.findFirst({ where: { companyId, name: data.clientName } });
    if (!client) {
      // A storefront shopper is a retail person by default; wholesale is only
      // assigned consciously from the clients screen, never by checkout.
      client = await tx.client.create({
        data: {
          companyId,
          name: data.clientName,
          email: data.clientEmail ?? null,
          phone: data.clientPhone ?? null,
        },
      });
    }

    const number = await reserveNextNumber(tx, companyId, DocumentType.PEDIDO, 'A');

    // Frozen header identity: a later rename of the tenant or the client must
    // not rewrite this order.
    const headerSnapshot = await buildHeaderSnapshot(tx, { companyId, clientId: client.id });

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
        ...headerSnapshot,
        status: 'Abierto',
        subtotal,
        totalTax,
        total: subtotal + totalTax,
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

export default router;
