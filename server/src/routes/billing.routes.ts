import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { requireAuth, requirePermission } from '../middleware/auth.js';
import { logAudit, clientIp } from '../lib/audit.js';
import { parsePositiveInt } from '../lib/params.js';
import {
  PLAN_CATALOG,
  getCompanySubscription,
  createMpCheckout,
  createMpPayment,
  fetchMpCollectionStatus,
  markCollectionApproved,
  collectionReference,
  isMpConfigured,
  verifyWebhookSignature,
  applyWebhookEvent,
} from '../lib/billing.js';

const router = Router();

// ---------------------------------------------------------------------------
// GET /api/billing/plans  (público — pricing page)
// ---------------------------------------------------------------------------
router.get('/plans', (_req, res) => {
  res.json(PLAN_CATALOG.filter((p) => p.active));
});

// ---------------------------------------------------------------------------
// GET /api/billing/subscription  (auth — estado de mi empresa)
// ---------------------------------------------------------------------------
router.get('/subscription', requireAuth, async (req, res) => {
  const sub = await getCompanySubscription(req.authUser!.companyId);
  if (!sub) {
    // Before the boot-time backfill runs a company might not have a record
    // yet; treat it as the free plan.
    const freePlan = PLAN_CATALOG.find((p) => p.code === 'free')!;
    res.json({
      status: 'active',
      plan: { code: freePlan.code, name: freePlan.name, priceMonthly: 0 },
      currentPeriodEnd: null,
      checkoutUrl: null,
    });
    return;
  }
  res.json({
    status: sub.status,
    plan: sub.plan,
    currentPeriodStart: sub.currentPeriodStart,
    currentPeriodEnd: sub.currentPeriodEnd,
    mpSubscriptionId: sub.mpSubscriptionId,
  });
});

// ---------------------------------------------------------------------------
// POST /api/billing/checkout  (auth — iniciar pago en Mercado Pago)
// ---------------------------------------------------------------------------
const checkoutSchema = z.object({
  planCode: z.enum(['pro', 'enterprise']),
});

router.post('/checkout', requireAuth, async (req, res) => {
  const parsed = checkoutSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Datos inválidos', details: parsed.error.flatten() });
    return;
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: req.authUser!.userId },
      select: { email: true },
    });

    const company = await prisma.company.findUnique({
      where: { id: req.authUser!.companyId },
      select: { name: true, currency: true },
    });

    const result = await createMpCheckout({
      planCode: parsed.data.planCode,
      companyName: company?.name ?? 'Nexus',
      companyId: req.authUser!.companyId,
      userEmail: user?.email ?? '',
      currency: company?.currency ?? 'ARS',
    });

    res.json(result);
  } catch (err) {
    const status = (err as { status?: number }).status ?? 500;
    const message =
      status === 503
        ? 'Mercado Pago no está configurado en este entorno. Contactá al administrador.'
        : 'No se pudo generar el enlace de pago. Intentá de nuevo.';
    res.status(status).json({ error: message });
  }
});

// ---------------------------------------------------------------------------
// GET /api/billing/mp-config  (auth — ¿hay credenciales MP en este entorno?)
// El POS lo usa para elegir cobro online vs. registro manual. Nunca expone tokens.
// ---------------------------------------------------------------------------
router.get('/mp-config', requireAuth, (_req, res) => {
  res.json({ configured: isMpConfigured() });
});

// ---------------------------------------------------------------------------
// POST /api/billing/payments  (auth — crear intento de cobro MP para una VENTA)
// Body { documentId, method? }: la venta debe ser del tenant y estar impaga.
// Crea el Payment 'Pendiente' + la preferencia en MP y devuelve el init_point.
// Sin MP_ACCESS_TOKEN responde 503 honesto (el POS registra manual entonces).
// ---------------------------------------------------------------------------
const collectionSchema = z.object({
  documentId: z.number().int().positive(),
  method: z.enum(['Tarjeta', 'QR / Transf.']).optional().default('QR / Transf.'),
});

router.post('/payments', requireAuth, requirePermission('ventas.escribir'), async (req, res) => {
  const parsed = collectionSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Datos inválidos', details: parsed.error.flatten() });
    return;
  }
  const companyId = req.authUser!.companyId;

  const document = await prisma.document.findFirst({
    where: { id: parsed.data.documentId, companyId },
    select: { id: true, type: true, series: true, number: true, status: true, total: true, currency: true },
  });
  if (!document) {
    res.status(404).json({ error: 'Comprobante no encontrado' });
    return;
  }
  if (document.type !== 'VENTA') {
    res.status(400).json({ error: 'Solo las ventas de mostrador se cobran por esta vía' });
    return;
  }
  if (document.status === 'Pagado') {
    res.status(409).json({ error: 'El comprobante ya está pagado' });
    return;
  }
  const settled = await prisma.payment.count({
    where: { documentId: document.id, companyId, status: 'Pagado' },
  });
  if (settled > 0) {
    res.status(409).json({ error: 'El comprobante ya tiene un pago registrado' });
    return;
  }

  const amount = Number(document.total);
  const reference = collectionReference(companyId, document.id);

  // Primero MP (lanza 503 sin token, antes de escribir nada local).
  const user = await prisma.user.findUnique({
    where: { id: req.authUser!.userId },
    select: { email: true },
  });
  let intent: { initPoint: string; preferenceId: string };
  try {
    intent = await createMpPayment({
      amount,
      currency: document.currency || 'ARS',
      description: `Venta ${document.series}-${String(document.number).padStart(4, '0')}`,
      externalReference: reference,
      payerEmail: user?.email,
    });
  } catch (err) {
    const status = (err as { status?: number }).status ?? 500;
    const message =
      status === 503
        ? 'Mercado Pago no está configurado en este entorno. Registrá el pago manualmente.'
        : 'No se pudo crear el cobro en Mercado Pago. Intentá de nuevo.';
    res.status(status).json({ error: message });
    return;
  }

  const payment = await prisma.$transaction(async (tx) => {
    const existing = await tx.payment.findFirst({
      where: { documentId: document.id, companyId, status: 'Pendiente' },
    });
    const row =
      existing ??
      (await tx.payment.create({
        data: {
          companyId,
          documentId: document.id,
          amount,
          method: parsed.data.method,
          status: 'Pendiente',
        },
      }));
    await logAudit(
      tx,
      companyId,
      req.authUser!.userId,
      {
        action: 'Cobro Mercado Pago iniciado',
        module: 'Ventas',
        entity: 'Payment',
        entityId: row.id,
        details: `VENTA ${document.series}-${String(document.number).padStart(4, '0')} por $${amount.toFixed(2)} (${parsed.data.method})`,
      },
      clientIp(req),
    );
    return row;
  });

  res.status(201).json({
    paymentId: payment.id,
    documentId: document.id,
    initPoint: intent.initPoint,
    externalReference: reference,
    status: 'pending',
  });
});

// ---------------------------------------------------------------------------
// GET /api/billing/payments/:id  (auth — estado del cobro para el polling POS)
// Local primero; si sigue pendiente y MP está configurado, consulta MP y
// aplica el aprobado en el acto (cubre webhooks que aún no llegaron).
// ---------------------------------------------------------------------------
router.get('/payments/:id', requireAuth, requirePermission('ventas.escribir'), async (req, res) => {
  const id = parsePositiveInt(req.params.id);
  if (id === null) {
    res.status(400).json({ error: 'Parámetro inválido' });
    return;
  }
  const companyId = req.authUser!.companyId;

  const payment = await prisma.payment.findFirst({
    where: { id, companyId },
    select: { id: true, documentId: true, status: true },
  });
  if (!payment) {
    res.status(404).json({ error: 'Cobro no encontrado' });
    return;
  }
  if (payment.status === 'Pagado') {
    res.json({ status: 'approved', paymentId: payment.id, documentId: payment.documentId });
    return;
  }

  if (!isMpConfigured()) {
    res.json({ status: 'pending', paymentId: payment.id, documentId: payment.documentId });
    return;
  }

  const remote = await fetchMpCollectionStatus(collectionReference(companyId, payment.documentId));
  if (remote.status === 'approved') {
    await prisma.$transaction(async (tx) => {
      await markCollectionApproved(tx, companyId, payment.documentId);
    });
    res.json({ status: 'approved', paymentId: payment.id, documentId: payment.documentId });
    return;
  }
  res.json({
    status: remote.status === 'rejected' ? 'rejected' : 'pending',
    paymentId: payment.id,
    documentId: payment.documentId,
  });
});

// ---------------------------------------------------------------------------
// POST /api/billing/webhook  (Mercado Pago — firma verificada, idempotente)
// ---------------------------------------------------------------------------
router.post('/webhook', async (req, res) => {
  const headers = req.headers as Record<string, string>;
  const body = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : JSON.stringify(req.body);

  if (!verifyWebhookSignature(headers, body)) {
    res.status(401).json({ error: 'Firma inválida' });
    return;
  }

  let payload: { type?: string; action?: string; data?: { id?: unknown } } = {};
  try {
    payload = JSON.parse(body);
  } catch {
    payload = {};
  }

  // MP avisa pagos como ?type=payment, {type:'payment'} o {action:'payment.created'}.
  const topic = (req.query.type as string) ?? payload?.type ?? payload?.action ?? 'unknown';
  const eventId = payload?.data?.id ?? req.headers['x-request-id'] ?? `evt-${Date.now()}`;

  try {
    const result = await applyWebhookEvent(topic, String(eventId), body);
    res.json(result);
  } catch (err) {
    console.error('[billing] webhook processing error:', err);
    res.status(500).json({ error: 'Error procesando el evento' });
  }
});

// ---------------------------------------------------------------------------
// GET /api/billing/admin/overview  (SuperAdmin — panel de billing)
// ---------------------------------------------------------------------------
router.get('/admin/overview', requireAuth, async (req, res) => {
  // Only users with the billing.manage permission may access the overview.
  const user = await prisma.user.findUnique({
    where: { id: req.authUser!.userId },
    select: {
      roles: {
        select: {
          role: {
            select: {
              permissions: { select: { permission: { select: { name: true } } } },
            },
          },
        },
      },
    },
  });

  const permissions = new Set(
    user?.roles.flatMap((ur) => ur.role.permissions.map((rp) => rp.permission.name)) ?? [],
  );
  if (!permissions.has('billing.manage')) {
    res.status(403).json({ error: 'Permiso requerido: billing.manage' });
    return;
  }

  const [totals, recentEvents, unsubscribedCompanies] = await Promise.all([
    prisma.companySubscription.groupBy({
      by: ['status'],
      _count: true,
    }),
    prisma.billingEvent.findMany({
      orderBy: { createdAt: 'desc' },
      take: 15,
      select: { eventId: true, topic: true, createdAt: true },
    }),
    prisma.company.findMany({
      where: { subscription: null },
      select: { id: true, name: true, slug: true },
    }),
  ]);

  // MRR from active subscriptions (sum of priceMonthly for active plans)
  const activeSubs = await prisma.companySubscription.findMany({
    where: { status: 'active' },
    select: { plan: { select: { priceMonthly: true } } },
  });
  const mrrUsd = activeSubs.reduce((sum, s) => sum + Number(s.plan.priceMonthly), 0);

  const counts = Object.fromEntries(totals.map((t) => [t.status, t._count]));
  res.json({
    totals: {
      companies: await prisma.company.count(),
      activeSubscriptions: counts['active'] ?? 0,
      pastDueSubscriptions: counts['past_due'] ?? 0,
      canceledSubscriptions: counts['canceled'] ?? 0,
      pendingSubscriptions: counts['pending'] ?? 0,
      mrrUsd,
    },
    recentEvents,
    unsubscribedCompanies,
  });
});

export default router;
