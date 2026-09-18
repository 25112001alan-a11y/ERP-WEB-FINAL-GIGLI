import type { PrismaClient } from '@prisma/client';

/**
 * Normalizes a string into a URL-safe slug: lowercase ASCII, dashes for
 * separators. Accents and ñ are folded so "Estación Ñuble" -> "estacion-nuble".
 */
export function slugify(input: string): string {
  const base = input
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ñ/g, 'n')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return base || 'empresa';
}

/**
 * Upgrades tenants that predate slugs (null slug or the SQL-migration fallback
 * "empresa-<id>") to a stable name-derived slug. Idempotent and safe to run at
 * every boot; the storefront URL improves without operator intervention.
 */
export async function backfillCompanySlugs(
  prisma: Pick<PrismaClient, 'company'>,
): Promise<number> {
  const companies = await prisma.company.findMany({
    where: {
      OR: [{ slug: null }, { slug: { startsWith: 'empresa-' } }],
    },
    select: { id: true, name: true, slug: true },
  });
  let updated = 0;
  for (const c of companies) {
    const next = await generateUniqueSlug(prisma, c.name);
    if (next !== c.slug) {
      await prisma.company.update({ where: { id: c.id }, data: { slug: next } });
      updated += 1;
    }
  }
  return updated;
}

/**
 * Builds a unique company slug from a base name. If the base slug is taken it
 * appends a counter suffix ("mi-empresa", "mi-empresa-2", ...) so the
 * storefront URL is always stable and safe.
 */
export async function generateUniqueSlug(
  prisma: Pick<PrismaClient, 'company'>,
  companyName: string,
): Promise<string> {
  const base = slugify(companyName);
  let candidate = base;
  let suffix = 2;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const existing = await prisma.company.findUnique({
      where: { slug: candidate },
      select: { id: true },
    });
    if (!existing) return candidate;
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }
}