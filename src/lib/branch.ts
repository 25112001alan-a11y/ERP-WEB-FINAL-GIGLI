import type { BranchOption, CartItem, Product, WarehouseOption } from '../types';

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

/** Only loaded warehouses with an existing stock row can receive an adjustment. */
export function adjustmentWarehouses(product: Product | undefined, warehouses: WarehouseOption[]): WarehouseOption[] {
  return warehouses.filter((w) => product?.stocks.some((s) => s.warehouseId === w.id));
}

/** Validate the exact transfer that will be sent; never silently reduce its quantity. */
export function transferError(
  product: Product | undefined,
  warehouses: WarehouseOption[],
  fromId: number,
  toId: number,
  quantity: number,
): string | null {
  if (!product) return 'Seleccioná un producto.';
  if (!warehouses.some((w) => w.id === fromId) || !warehouses.some((w) => w.id === toId))
    return 'Seleccioná depósitos habilitados para esta sucursal.';
  if (fromId === toId) return 'Elegí depósitos de origen y destino distintos.';
  const source = product.stocks.find((s) => s.warehouseId === fromId);
  if (!source || !Number.isFinite(source.quantity) || source.quantity <= 0)
    return 'El producto no tiene stock en el depósito de origen.';
  if (!Number.isFinite(quantity) || quantity <= 0 || quantity > source.quantity)
    return `Ingresá una cantidad mayor a cero y hasta ${source.quantity} unidades del origen.`;
  return null;
}

/** Each POS line must fit in one warehouse of the selected branch. */
export function posSaleLines(items: CartItem[], warehouseIds: Set<number> | null) {
  if (!warehouseIds?.size) throw new Error('Elegí una sucursal con depósitos antes de cobrar');
  return items.map(({ product, quantity }) => {
    const stocks = product.stocks
      .filter((s) => warehouseIds.has(s.warehouseId))
      .sort((a, b) => a.warehouseId - b.warehouseId);
    const stock = stocks.find((s) => s.quantity >= quantity);
    if (!stock) {
      const available = stocks.reduce((sum, s) => sum + s.quantity, 0);
      throw new Error(available >= quantity
        ? `El stock de ${product.name} está repartido entre depósitos. Reducí la cantidad o reuní el stock en un depósito de la sucursal.`
        : `Stock insuficiente para ${product.name} en esta sucursal (disponible: ${available}). Ajustá la cantidad o reponé stock.`);
    }
    return { productId: Number(product.id), quantity, warehouseId: stock.warehouseId };
  });
}
