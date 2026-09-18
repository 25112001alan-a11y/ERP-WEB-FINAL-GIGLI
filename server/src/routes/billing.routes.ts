import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/auth.js';
import {
  PLAN_CATALOG,
  getCompanySubscription,
  createMpCheckout,
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
// POST /api/billing/webhook  (Mercado Pago — firma verificada, idempotente)
// ---------------------------------------------------------------------------
router.post('/webhook', async (req, res) => {
  const headers = req.headers as Record<string, string>;
  const body = JSON.stringify(req.body);

  if (!verifyWebhookSignature(headers, body)) {
    res.status(401).json({ error: 'Firma inválida' });
    return;
  }

  const topic = (req.query.type as string) ?? (req.body?.type as string) ?? 'unknown';
  const eventId = req.body?.data?.id ?? req.headers['x-request-id'] ?? `evt-${Date.now()}`;

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
