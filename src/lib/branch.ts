import type { BranchOption, Product, WarehouseOption } from '../types';

const KEY_PREFIX = 'nexus:activeBranchId:';

/** localStorage key is per company so operators switching tenants don't leak branches. */
export function branchStorageKey(companyId: number | null | undefined): string {
  return `${KEY_PREFIX}${companyId ?? 'none'}`;
}

export function getStoredBranchId(companyId: number | null | undefined): number | null {
  try {
    const raw = localStorage.getItem(branchStorageKey(companyId));
    const id = raw == null || raw === '' ? NaN : Number(raw);
    return Number.isInteger(id) && id > 0 ? id : null;
  } catch {
    return null;
  }
}

export function setStoredBranchId(companyId: number | null | undefined, branchId: number | null): void {
  try {
    if (branchId == null) localStorage.removeItem(branchStorageKey(companyId));
    else localStorage.setItem(branchStorageKey(companyId), String(branchId));
  } catch {
    // Private mode / blocked storage: the selector still works for the session.
  }
}

/** Unique branch list derived from the already-loaded warehouses (no extra fetch). */
export function deriveBranches(warehouses: WarehouseOption[]): BranchOption[] {
  const map = new Map<number, string>();
  for (const w of warehouses) {
    const id = w.branch?.id ?? w.branchId;
    if (id == null) continue;
    if (!map.has(id)) map.set(id, w.branch?.name ?? `Sucursal ${id}`);
  }
  return [...map.entries()]
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** Warehouse ids belonging to a branch (null = all warehouses, "Todas"). */
export function warehouseIdsForBranch(
  warehouses: WarehouseOption[],
  branchId: number | null,
): Set<number> | null {
  if (branchId == null) return null;
  return new Set(
    warehouses
      .filter((w) => (w.branch?.id ?? w.branchId) === branchId)
      .map((w) => w.id),
  );
}

/** Branch-scoped stock of a product (null ids = global total, current behavior). */
export function branchStock(product: Product, warehouseIds: Set<number> | null): number {
  if (warehouseIds == null) return product.stock;
  let total = 0;
  for (const s of product.stocks) {
    if (warehouseIds.has(s.warehouseId)) total += s.quantity;
  }
  return total;
}
