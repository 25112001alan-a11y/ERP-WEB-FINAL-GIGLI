/**
 * SaaS billing helpers — Mercado Pago preapprovals, webhook verification,
 * per-tenant plan limits, and the boot-time subscription backfill.
 *
 * Mercado Pago credentials are optional in development: when MP_ACCESS_TOKEN
 * is absent the checkout endpoint returns an honest 503 instead of fabricating
 * a payment URL.
 */
import crypto from 'node:crypto';
import { type Prisma } from '@prisma/client';
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
// POS collection via Mercado Pago (Fase E — cobro real, NO suscripciones)
// ---------------------------------------------------------------------------
//
// Se usa Checkout Pro / preferences con UN solo POST: devuelve init_point
// (link pagable con tarjeta/dinero en cuenta, válido en AR) y el
// external_reference viaja de ida y vuelta para matchear el webhook con la
// venta, sin agregar columnas ni SDK. El POS muestra el link y pollea.

export interface MpCollectionIntent {
  initPoint: string;
  preferenceId: string;
}

/** `nexus:<companyId>:<documentId>` — la única clave de matcheo webhook↔venta. */
export function collectionReference(companyId: number, documentId: number): string {
  return `nexus:${companyId}:${documentId}`;
}

/** Inversa de collectionReference; null si el formato no es nuestro. */
export function parseCollectionReference(ref: string): { companyId: number; documentId: number } | null {
  const m = /^nexus:(\d+):(\d+)$/.exec((ref ?? '').trim());
  if (!m) return null;
  return { companyId: Number(m[1]), documentId: Number(m[2]) };
}

function mpTokenOrThrow(): string {
  const accessToken = process.env.MP_ACCESS_TOKEN;
  if (!accessToken) {
    throw Object.assign(
      new Error('Mercado Pago no está configurado en este entorno (falta MP_ACCESS_TOKEN)'),
      { status: 503 },
    );
  }
  return accessToken;
}

/** True cuando hay credenciales MP cargadas (el frontend lo usa para elegir flujo). */
export function isMpConfigured(): boolean {
  return Boolean(process.env.MP_ACCESS_TOKEN);
}

/**
 * Crea una preferencia de cobro para UNA venta del POS.
 * @returns `{ initPoint, preferenceId }` — el link que paga el cliente.
 * @throws `{ message, status }` (503 sin token, 502 si MP falla).
 */
export async function createMpPayment(opts: {
  amount: number;
  currency: string;
  description: string;
  externalReference: string;
  payerEmail?: string;
}): Promise<MpCollectionIntent> {
  const accessToken = mpTokenOrThrow();

  if (!Number.isFinite(opts.amount) || opts.amount <= 0) {
    throw Object.assign(new Error('El monto a cobrar debe ser mayor a cero'), { status: 400 });
  }

  const frontend = process.env.FRONTEND_URL ?? 'http://localhost:3000';
  const res = await fetch(`${MP_BASE}/checkout/preferences`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({
      items: [
        {
          title: opts.description.slice(0, 120) || 'Venta mostrador',
          quantity: 1,
          unit_price: Math.round(opts.amount * 100) / 100,
          currency_id: opts.currency || 'ARS',
        },
      ],
      external_reference: opts.externalReference,
      payer: opts.payerEmail ? { email: opts.payerEmail } : undefined,
      back_urls: {
        success: process.env.MP_SUCCESS_URL ?? `${frontend}/pos?cobro=exitoso`,
        pending: `${frontend}/pos?cobro=pendiente`,
        failure: process.env.MP_FAILURE_URL ?? `${frontend}/pos?cobro=fallido`,
      },
    }),
  });

  if (!res.ok) {
    throw Object.assign(
      new Error(`No se pudo crear el cobro en Mercado Pago (${res.status})`),
      { status: 502 },
    );
  }

  const pref = (await res.json()) as { init_point?: string; sandbox_init_point?: string; id?: string };
  const initPoint = pref.init_point ?? pref.sandbox_init_point ?? '';
  if (!initPoint) {
    throw Object.assign(new Error('Mercado Pago no devolvió el enlace de pago'), { status: 502 });
  }
  return { initPoint, preferenceId: String(pref.id ?? '') };
}

export type MpCollectionStatus = 'approved' | 'pending' | 'rejected' | 'unknown';

/**
 * Estado del cobro según MP, buscando por external_reference.
 * Nunca lanza por fallas de red/MP: devuelve 'unknown' y el POS sigue polleando.
 * @throws 503 solo cuando no hay token (el caller lo convierte en honest 503).
 */
export async function fetchMpCollectionStatus(
  externalReference: string,
): Promise<{ status: MpCollectionStatus; mpPaymentId?: string }> {
  const accessToken = mpTokenOrThrow();

  let res: Response;
  try {
    res = await fetch(
      `${MP_BASE}/v1/payments/search?external_reference=${encodeURIComponent(externalReference)}&sort=date_created&criteria=desc`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
  } catch {
    return { status: 'unknown' };
  }
  if (!res.ok) return { status: 'unknown' };

  const data = (await res.json()) as {
    results?: { id?: number | string; status?: string; date_created?: string }[];
  };
  const latest = (data.results ?? [])
    .filter((r) => r?.status)
    .sort((a, b) => String(b.date_created ?? '').localeCompare(String(a.date_created ?? '')))[0];
  if (!latest?.status) return { status: 'unknown' };

  if (latest.status === 'approved') {
    return { status: 'approved', mpPaymentId: String(latest.id ?? '') };
  }
  if (latest.status === 'pending' || latest.status === 'in_process' || latest.status === 'in_mediation') {
    return { status: 'pending', mpPaymentId: String(latest.id ?? '') };
  }
  if (latest.status === 'rejected' || latest.status === 'cancelled' || latest.status === 'expired') {
    return { status: 'rejected', mpPaymentId: String(latest.id ?? '') };
  }
  return { status: 'unknown', mpPaymentId: String(latest.id ?? '') };
}

/** Detalle de UN pago de MP (lo usa el webhook para no confiar en el body). */
async function fetchMpPaymentDetail(mpPaymentId: string): Promise<{
  status?: string;
  externalReference?: string;
} | null> {
  const accessToken = process.env.MP_ACCESS_TOKEN;
  if (!accessToken) return null;
  let res: Response;
  try {
    res = await fetch(`${MP_BASE}/v1/payments/${encodeURIComponent(mpPaymentId)}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
  } catch {
    return null;
  }
  if (!res.ok) return null;
  const data = (await res.json()) as { status?: string; external_reference?: string };
  return { status: data.status, externalReference: data.external_reference };
}

/**
 * Marca la venta como cobrada (idempotente: repetir no duplica nada).
 * Pasa los Payment 'Pendiente' del documento a 'Pagado' y el documento a 'Pagado'.
 */
export async function markCollectionApproved(
  tx: Prisma.TransactionClient,
  companyId: number,
  documentId: number,
): Promise<{ paymentsSettled: number; alreadyPaid: boolean }> {
  const document = await tx.document.findFirst({
    where: { id: documentId, companyId },
    select: { id: true, status: true },
  });
  if (!document) return { paymentsSettled: 0, alreadyPaid: false };

  const pending = await tx.payment.findMany({
    where: { documentId, companyId, status: 'Pendiente' },
    select: { id: true },
  });
  if (pending.length === 0 && document.status === 'Pagado') {
    return { paymentsSettled: 0, alreadyPaid: true };
  }

  if (pending.length > 0) {
    await tx.payment.updateMany({
      where: { documentId, companyId, status: 'Pendiente' },
      data: { status: 'Pagado' },
    });
  }
  if (document.status !== 'Pagado') {
    await tx.document.update({ where: { id: documentId }, data: { status: 'Pagado' } });
  }
  return { paymentsSettled: pending.length, alreadyPaid: false };
}

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

  if (topic === 'payment' || topic.startsWith('payment.')) {
    // Cobro POS/storefront: el body solo trae el id; el estado real se lee de
    // la API de MP y el external_reference `nexus:<company>:<doc>` matchea la
    // venta. Sin token o si MP falla, el evento solo queda registrado (el POS
    // también pollea, así que nada se pierde).
    let collection: { companyId: number; documentId: number } | null = null;
    try {
      const data = JSON.parse(payload).data as { id?: unknown; live_mode?: boolean };
      const detail = data?.id != null ? await fetchMpPaymentDetail(String(data.id)) : null;
      if (detail?.status === 'approved' && detail.externalReference) {
        collection = parseCollectionReference(detail.externalReference);
      }
    } catch {
      collection = null;
    }
    if (collection) {
      const matched = collection;
      companyId = matched.companyId;
      await prisma.$transaction(async (tx) => {
        await tx.billingEvent.create({ data: { eventId, topic, payload } });
        await markCollectionApproved(tx, matched.companyId, matched.documentId);
      });
      return { action: 'collection_approved', companyId };
    }
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
