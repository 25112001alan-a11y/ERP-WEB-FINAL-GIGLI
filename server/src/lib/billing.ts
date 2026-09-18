/**
 * SaaS billing helpers — Mercado Pago preapprovals, webhook verification,
 * per-tenant plan limits, and the boot-time subscription backfill.
 *
 * Mercado Pago credentials are optional in development: when MP_ACCESS_TOKEN
 * is absent the checkout endpoint returns an honest 503 instead of fabricating
 * a payment URL.
 */
import crypto from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { prisma } from './prisma.js';

// ---------------------------------------------------------------------------
// Catalog
// ---------------------------------------------------------------------------

export interface PlanDefinition {
  code: string;
  name: string;
  description: string;
  priceMonthly: number;
  features: string[];
  active: boolean;
}

export const PLAN_CATALOG: PlanDefinition[] = [
  {
    code: 'free',
    name: 'Gratis',
    description: 'Para probar la plataforma. Hasta 20 documentos y 10 productos por mes.',
    priceMonthly: 0,
    features: ['20 documentos / mes', '10 productos', '1 usuario'],
    active: true,
  },
  {
    code: 'pro',
    name: 'Profesional',
    description: 'Operación completa sin límites de documentos ni productos.',
    priceMonthly: 29,
    features: ['Documentos ilimitados', 'Productos ilimitados', 'Hasta 10 usuarios', 'Portal público del storefront'],
    active: true,
  },
  {
    code: 'enterprise',
    name: 'Empresa',
    description: 'Multi-sucursal, roles avanzados y soporte prioritario.',
    priceMonthly: 99,
    features: ['Todo de Profesional', 'Multi-sucursal', 'Roles personalizados', 'Soporte prioritario'],
    active: true,
  },
];

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

type SubscriptionWithPlan = {
  id: number;
  companyId: number;
  planId: number;
  status: string;
  mpSubscriptionId: string | null;
  currentPeriodStart: Date | null;
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
  plan: { code: string; name: string; priceMonthly: number };
};

/**
 * Returns the active subscription + plan for a company, or null when the
 * company has no record (before the boot-time backfill runs).
 */
export async function getCompanySubscription(
  companyId: number,
): Promise<SubscriptionWithPlan | null> {
  return prisma.companySubscription.findUnique({
    where: { companyId },
    include: { plan: { select: { code: true, name: true, priceMonthly: true } } },
  }) as Promise<SubscriptionWithPlan | null>;
}

/**
 * Returns the plan code for a company. Falls back to 'free' when no
 * subscription exists (boot backfill hasn't run yet, or test shortcut).
 */
export async function getActivePlanCode(companyId: number): Promise<string> {
  const sub = await getCompanySubscription(companyId);
  return sub?.plan.code ?? 'free';
}

// ---------------------------------------------------------------------------
// Mercado Pago checkout (REST — no SDK dependency)
// ---------------------------------------------------------------------------

const MP_BASE = 'https://api.mercadopago.com';

/**
 * Creates a recurring preapproval (subscription) on Mercado Pago.
 *
 * @returns `{ checkoutUrl, mpSubscriptionId }` on success.
 * @throws `{ message, status }` on failure.
 */
export async function createMpCheckout(opts: {
  planCode: string;
  companyName: string;
  companyId: number;
  userEmail: string;
  currency: string;
}): Promise<{ checkoutUrl: string; mpSubscriptionId: string }> {
  const accessToken = process.env.MP_ACCESS_TOKEN;
  if (!accessToken) {
    throw Object.assign(
      new Error('Mercado Pago no está configurado en este entorno (falta MP_ACCESS_TOKEN)'),
      { status: 503 },
    );
  }

  const planDef = PLAN_CATALOG.find((p) => p.code === opts.planCode);
  if (!planDef || planDef.priceMonthly === 0) {
    throw Object.assign(new Error('El plan seleccionado no requiere pago'), { status: 400 });
  }

  // 1. Create a preapproval plan in MP.
  const planRes = await fetch(`${MP_BASE}/preapproval_plan`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({
      reason: `Nexus ERP — ${planDef.name}`,
      auto_recurring: {
        frequency: 1,
        frequency_type: 'months',
        transaction_amount: planDef.priceMonthly,
        currency_id: opts.currency || 'ARS',
      },
      payment_methods_allowed: { payment_type_id: ['credit_card', 'debit_card', 'bank_transfer'] },
      back_urls: {
        success: `${process.env.FRONTEND_URL ?? 'http://localhost:3000'}/configuracion?billing=success`,
        pending: `${process.env.FRONTEND_URL ?? 'http://localhost:3000'}/configuracion?billing=pending`,
        failure: `${process.env.FRONTEND_URL ?? 'http://localhost:3000'}/configuracion?billing=failure`,
      },
    }),
  });

  if (!planRes.ok) {
    const body = await planRes.text();
    throw Object.assign(
      new Error(`Error al crear el plan de pago en Mercado Pago (${planRes.status})`),
      { status: 502 },
    );
  }

  const mpPlan = (await planRes.json()) as { id: string };

  // 2. Start a preapproval against that plan.
  const subRes = await fetch(`${MP_BASE}/preapproval`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({
      preapproval_plan_id: mpPlan.id,
      external_reference: `company-${opts.companyId}`,
      payer_email: opts.userEmail,
      reason: `Nexus ERP — ${planDef.name}`,
    }),
  });

  if (!subRes.ok) {
    const body = await subRes.text();
    throw Object.assign(
      new Error(`No se pudo iniciar la suscripción en Mercado Pago (${subRes.status})`),
      { status: 502 },
    );
  }

  const sub = (await subRes.json()) as { init_point: string; id: string };

  // Persist the MP identifiers so the webhook can match events.
  await prisma.companySubscription.update({
    where: { companyId: opts.companyId },
    data: {
      mpSubscriptionId: sub.id,
      status: 'pending',
      planId: (await prisma.plan.findUnique({ where: { code: opts.planCode } }))!.id,
    },
  });

  return { checkoutUrl: sub.init_point, mpSubscriptionId: sub.id };
}

// ---------------------------------------------------------------------------
// Mercado Pago webhook verification
// ---------------------------------------------------------------------------

/**
 * Verifies the X-Signature header from Mercado Pago.
 *
 * The header format is: `ts=...;v1=...`
 * v1 = HMAC-SHA256( access_token, `id:${dataId};request-id:${xRequestId};ts:${ts};` )
 */
export function verifyWebhookSignature(headers: Record<string, string>, body: string): boolean {
  const accessToken = process.env.MP_ACCESS_TOKEN;
  if (!accessToken) return false; // No token configured => can't verify

  const sigHeader = headers['x-signature'];
  if (!sigHeader) return false;

  const parts = Object.fromEntries(
    sigHeader.split(';').map((p) => {
      const [k, ...rest] = p.split('=');
      return [k, rest.join('=')];
    }),
  );
  const ts = parts['ts'];
  const v1 = parts['v1'];
  if (!ts || !v1) return false;

  const xRequestId = headers['x-request-id'] ?? '';
  const dataId = JSON.parse(body).data?.id ?? '';
  const manifest = `id:${dataId};request-id:${xRequestId};ts:${ts};`;

  const expected = crypto.createHmac('sha256', accessToken).update(manifest).digest('hex');

  // Constant-time comparison
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(v1));
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Webhook event processing
// ---------------------------------------------------------------------------

/**
 * Processes a verified Mercado Pago webhook and returns the action taken.
 * Idempotent: duplicate eventId => no-op returning 'duplicate'.
 */
export async function applyWebhookEvent(
  topic: string,
  eventId: string,
  payload: string,
): Promise<{ action: string; companyId?: number }> {
  // Idempotency gate
  const existing = await prisma.billingEvent.findUnique({ where: { eventId } });
  if (existing) return { action: 'duplicate' };

  let companyId: number | undefined;
  let newStatus: string | undefined;

  if (topic === 'payment') {
    // Payment events are logged but don't drive subscription status.
    // Subscription state is controlled by the subscription_* topics.
  } else {
    // subscription_authorized / subscription_updated / subscription_cancelled
    const data = JSON.parse(payload).data;
    const mpSubId: string | undefined = data?.id ?? data?.resource?.split('/').pop();

    if (mpSubId) {
      const sub = await prisma.companySubscription.findFirst({
        where: { mpSubscriptionId: mpSubId },
        select: { companyId: true, status: true },
      });
      if (sub) {
        companyId = sub.companyId;
        // Map MP status to local status
        const statusMap: Record<string, string> = {
          authorized: 'active',
          paused: 'past_due',
          cancelled: 'canceled',
          canceled: 'canceled',
          pending: 'pending',
        };
        // The data object may carry the status in different shapes depending
        // on the event type; accept either the top-level `status` or the
        // nested `data.status`.
        const mpStatus =
          data?.status ??
          (typeof data?.body === 'string' ? JSON.parse(data.body).status : undefined);
        newStatus = statusMap[mpStatus as string] ?? 'active';
      }
    }
  }

  // Persist event (idempotency key) and update subscription in one transaction
  await prisma.$transaction(async (tx) => {
    await tx.billingEvent.create({
      data: { eventId, topic, payload },
    });
    if (companyId && newStatus) {
      await tx.companySubscription.update({
        where: { companyId },
        data: { status: newStatus },
      });
    }
  });

  return { action: companyId && newStatus ? `subscription_${newStatus}` : 'logged', companyId };
}

// ---------------------------------------------------------------------------
// Plan limit enforcement (Free plan monthly caps)
// ---------------------------------------------------------------------------

// Read live so tests can override the caps without re-importing the module.
const freeDocLimit = () => Number(process.env.BILLING_FREE_DOC_LIMIT ?? '20');
const freeProductLimit = () => Number(process.env.BILLING_FREE_PRODUCT_LIMIT ?? '10');

/**
 * Throws a 402 when a Free-plan tenant hits the monthly document cap.
 * Called from the document creation handler. Returns silently for paid plans.
 */
export async function assertDocCreationAllowed(companyId: number): Promise<void> {
  const planCode = await getActivePlanCode(companyId);
  if (planCode !== 'free') return;

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const docCount = await prisma.document.count({
    where: { companyId, createdAt: { gte: monthStart } },
  });

  const limit = freeDocLimit();
  if (docCount >= limit) {
    const sub = await getCompanySubscription(companyId);
    const checkoutUrl = sub ? null : `${process.env.FRONTEND_URL ?? 'http://localhost:3000'}/configuracion`;
    throw Object.assign(
      new Error(
        `Has alcanzado el límite de ${limit} documentos mensuales del plan Gratuito. Actualizá a Profesional para operar sin límites.`,
      ),
      { status: 402, plan: { code: planCode, limit }, checkoutUrl },
    );
  }
}

/**
 * Throws a 402 when a Free-plan tenant hits the product catalog cap.
 */
export async function assertProductCreationAllowed(companyId: number): Promise<void> {
  const planCode = await getActivePlanCode(companyId);
  if (planCode !== 'free') return;

  const productCount = await prisma.product.count({
    where: { companyId, active: true },
  });

  const limit = freeProductLimit();
  if (productCount >= limit) {
    throw Object.assign(
      new Error(
        `Has alcanzado el límite de ${limit} productos del plan Gratuito. Actualizá a Profesional para agregar más productos.`,
      ),
      { status: 402, plan: { code: planCode, limit } },
    );
  }
}

// ---------------------------------------------------------------------------
// Boot-time backfill: ensure every company has a subscription
// ---------------------------------------------------------------------------

/**
 * Idempotent: upserts the 'free' subscription for any company that has no
 * CompanySubscription record. Called once at server start, after the plan
 * catalog is seeded.
 */
export async function ensureCompanySubscriptions(): Promise<number> {
  const freePlan = await prisma.plan.findUnique({ where: { code: 'free' } });
  if (!freePlan) return 0; // Plan catalog hasn't been seeded yet (test shortcut).

  const companies = await prisma.company.findMany({
    where: { subscription: null },
    select: { id: true },
  });

  if (companies.length === 0) return 0;

  const now = new Date();
  await prisma.companySubscription.createMany({
    data: companies.map((c) => ({
      companyId: c.id,
      planId: freePlan.id,
      status: 'active',
      currentPeriodStart: now,
      currentPeriodEnd: new Date(now.getFullYear(), now.getMonth() + 1, 1),
    })),
    skipDuplicates: true,
  });

  return companies.length;
}
