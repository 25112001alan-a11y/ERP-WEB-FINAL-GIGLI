import type { Prisma } from '@prisma/client';

/**
 * Header identity frozen on a document when it is created: renaming a company,
 * client, supplier or branch later must never rewrite historical documents.
 * Every column is NULL on legacy rows, so readers fall back to the live relation.
 */
export type HeaderSnapshot = {
  companyName: string | null;
  companyTaxId: string | null;
  companyAddress: string | null;
  companyProvince: string | null;
  companyPostalCode: string | null;
  companyTaxCondition: string | null;
  clientName: string | null;
  clientTaxId: string | null;
  clientAddress: string | null;
  clientProvince: string | null;
  clientPostalCode: string | null;
  clientTaxCondition: string | null;
  supplierName: string | null;
  supplierTaxId: string | null;
  supplierAddress: string | null;
  supplierProvince: string | null;
  supplierPostalCode: string | null;
  supplierTaxCondition: string | null;
  branchName: string | null;
  branchAddress: string | null;
};

/**
 * Reads the master rows once inside the creating transaction and returns the
 * snapshot columns for `document.create`. Ids are tenant-scoped; a missing or
 * cross-tenant master yields NULL for its fields instead of failing the write.
 */
export async function buildHeaderSnapshot(
  tx: Prisma.TransactionClient,
  ids: {
    companyId: number;
    clientId?: number | null;
    supplierId?: number | null;
    branchId?: number | null;
  },
): Promise<HeaderSnapshot> {
  const company = await tx.company.findUnique({
    where: { id: ids.companyId },
    select: { legalName: true, taxId: true, address: true, province: true, postalCode: true, taxCondition: true },
  });
  const client = ids.clientId
    ? await tx.client.findFirst({
        where: { id: ids.clientId, companyId: ids.companyId },
        select: { name: true, taxId: true, address: true, province: true, postalCode: true, taxCondition: true },
      })
    : null;
  const supplier = ids.supplierId
    ? await tx.supplier.findFirst({
        where: { id: ids.supplierId, companyId: ids.companyId },
        select: { name: true, taxId: true, address: true, province: true, postalCode: true, taxCondition: true },
      })
    : null;
  const branch = ids.branchId
    ? await tx.branch.findFirst({
        where: { id: ids.branchId, companyId: ids.companyId },
        select: { name: true, address: true },
      })
    : null;
  return {
    companyName: company?.legalName ?? null,
    companyTaxId: company?.taxId ?? null,
    companyAddress: company?.address ?? null,
    companyProvince: company?.province ?? null,
    companyPostalCode: company?.postalCode ?? null,
    companyTaxCondition: company?.taxCondition ?? null,
    clientName: client?.name ?? null,
    clientTaxId: client?.taxId ?? null,
    clientAddress: client?.address ?? null,
    clientProvince: client?.province ?? null,
    clientPostalCode: client?.postalCode ?? null,
    clientTaxCondition: client?.taxCondition ?? null,
    supplierName: supplier?.name ?? null,
    supplierTaxId: supplier?.taxId ?? null,
    supplierAddress: supplier?.address ?? null,
    supplierProvince: supplier?.province ?? null,
    supplierPostalCode: supplier?.postalCode ?? null,
    supplierTaxCondition: supplier?.taxCondition ?? null,
    branchName: branch?.name ?? null,
    branchAddress: branch?.address ?? null,
  };
}

/** Minimal shape `withHeaderSnapshot` reads: snapshot columns plus live relations. */
export type HeaderSnapshotSource = {
  companyName?: string | null;
  companyTaxId?: string | null;
  companyAddress?: string | null;
  companyProvince?: string | null;
  companyPostalCode?: string | null;
  companyTaxCondition?: string | null;
  clientName?: string | null;
  clientTaxId?: string | null;
  clientAddress?: string | null;
  clientProvince?: string | null;
  clientPostalCode?: string | null;
  clientTaxCondition?: string | null;
  supplierName?: string | null;
  supplierTaxId?: string | null;
  supplierAddress?: string | null;
  supplierProvince?: string | null;
  supplierPostalCode?: string | null;
  supplierTaxCondition?: string | null;
  branchName?: string | null;
  branchAddress?: string | null;
  client?: {
    name?: string | null;
    taxId?: string | null;
    address?: string | null;
    province?: string | null;
    postalCode?: string | null;
    taxCondition?: string | null;
  } | null;
  supplier?: {
    name?: string | null;
    taxId?: string | null;
    address?: string | null;
    province?: string | null;
    postalCode?: string | null;
    taxCondition?: string | null;
  } | null;
  branch?: { name?: string | null; address?: string | null } | null;
};

/**
 * Snapshot first, live relation only as the fallback: legacy rows predate the
 * snapshot columns and must keep rendering exactly as they did before. The
 * live relation stays in the response; this only fills the NULL snapshot fields.
 */
export function withHeaderSnapshot<T extends HeaderSnapshotSource>(document: T): T {
  return {
    ...document,
    companyName: document.companyName ?? null,
    companyTaxId: document.companyTaxId ?? null,
    companyAddress: document.companyAddress ?? null,
    companyProvince: document.companyProvince ?? null,
    companyPostalCode: document.companyPostalCode ?? null,
    companyTaxCondition: document.companyTaxCondition ?? null,
    clientName: document.clientName ?? document.client?.name ?? null,
    clientTaxId: document.clientTaxId ?? document.client?.taxId ?? null,
    clientAddress: document.clientAddress ?? document.client?.address ?? null,
    clientProvince: document.clientProvince ?? document.client?.province ?? null,
    clientPostalCode: document.clientPostalCode ?? document.client?.postalCode ?? null,
    clientTaxCondition: document.clientTaxCondition ?? document.client?.taxCondition ?? null,
    supplierName: document.supplierName ?? document.supplier?.name ?? null,
    supplierTaxId: document.supplierTaxId ?? document.supplier?.taxId ?? null,
    supplierAddress: document.supplierAddress ?? document.supplier?.address ?? null,
    supplierProvince: document.supplierProvince ?? document.supplier?.province ?? null,
    supplierPostalCode: document.supplierPostalCode ?? document.supplier?.postalCode ?? null,
    supplierTaxCondition: document.supplierTaxCondition ?? document.supplier?.taxCondition ?? null,
    branchName: document.branchName ?? document.branch?.name ?? null,
    branchAddress: document.branchAddress ?? document.branch?.address ?? null,
  };
}
