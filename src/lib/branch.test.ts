import { describe, it, expect } from 'vitest';
import { adjustmentWarehouses, branchStock, defaultWarehouseForBranch, deriveBranches, posSaleLines, transferError, warehouseIdsForBranch } from './branch';
import type { Product, WarehouseOption } from '../types';

const warehouses: WarehouseOption[] = [
  { id: 1, name: 'Depósito Central', branchId: 10, branch: { id: 10, name: 'Casa Central', defaultWarehouseId: 1 } },
  { id: 2, name: 'Depósito Norte', branchId: 20, branch: { id: 20, name: 'Sucursal Norte' } },
  { id: 3, name: 'Trastienda Norte', branchId: 20, branch: { id: 20, name: 'Sucursal Norte' } },
];

const product = {
  id: '1',
  stock: 100,
  stocks: [
    { warehouseId: 1, quantity: 70, minStock: 0 },
    { warehouseId: 2, quantity: 30, minStock: 0 },
  ],
} as Product;

describe('deriveBranches', () => {
  it('dedupes branches from warehouses', () => {
    expect(deriveBranches(warehouses)).toEqual([
      { id: 10, name: 'Casa Central', defaultWarehouseId: 1 },
      { id: 20, name: 'Sucursal Norte', defaultWarehouseId: null },
    ]);
  });
});

describe('defaultWarehouseForBranch', () => {
  it('returns the configured default only when it exists in the list', () => {
    expect(defaultWarehouseForBranch(warehouses, 10)).toBe(1);
    expect(defaultWarehouseForBranch(warehouses, 20)).toBeNull();
    expect(defaultWarehouseForBranch(warehouses, null)).toBeNull();
  });

  it('ignores a branch default that was deleted or belongs elsewhere', () => {
    const stale = [{ ...warehouses[0], branch: { id: 10, name: 'Casa Central', defaultWarehouseId: 999 } }];
    expect(defaultWarehouseForBranch(stale, 10)).toBeNull();
  });
});

describe('warehouseIdsForBranch', () => {
  it('returns null for "Todas"', () => {
    expect(warehouseIdsForBranch(warehouses, null)).toBeNull();
  });

  it('returns only the branch warehouses', () => {
    expect(warehouseIdsForBranch(warehouses, 20)).toEqual(new Set([2, 3]));
  });
});

describe('branchStock', () => {
  it('returns the global total without a branch', () => {
    expect(branchStock(product, null)).toBe(100);
  });

  it('sums only the branch warehouses', () => {
    expect(branchStock(product, new Set([2, 3]))).toBe(30);
  });
});

describe('stock movement guards', () => {
  it('only allows adjustment in an existing stock row of the selected branch', () => {
    expect(adjustmentWarehouses(product, warehouses.filter((w) => w.branchId === 20)))
      .toEqual([warehouses[1]]);
    expect(adjustmentWarehouses(product, [warehouses[2]])).toEqual([]);
  });

  it('rejects missing source rows, cross-branch destinations, same warehouse and invalid or excessive amounts', () => {
    const allowed = warehouses.filter((w) => w.branchId === 20);
    expect(transferError(product, allowed, 3, 2, 1)).toMatch(/no tiene stock/);
    expect(transferError(product, allowed, 2, 1, 1)).toMatch(/habilitados/);
    expect(transferError(product, allowed, 2, 2, 1)).toMatch(/distintos/);
    for (const quantity of [0, -1, NaN, Infinity, 31]) {
      expect(transferError(product, allowed, 2, 3, quantity)).toMatch(/hasta 30/);
    }
    expect(transferError(product, allowed, 2, 3, 30)).toBeNull();
    expect(transferError(product, allowed, 2, 3, 0.5)).toBeNull();
  });
});

describe('posSaleLines', () => {
  it('routes two products to different warehouses in the selected branch', () => {
    const second = { ...product, id: '2', name: 'Second', stocks: [
      { warehouseId: 1, quantity: 0, minStock: 0 },
      { warehouseId: 2, quantity: 1, minStock: 0 },
      { warehouseId: 3, quantity: 5, minStock: 0 },
    ] } as Product;
    expect(posSaleLines([
      { product, quantity: 2 },
      { product: second, quantity: 3 },
    ], new Set([2, 3]))).toEqual([
      { productId: 1, quantity: 2, warehouseId: 2 },
      { productId: 2, quantity: 3, warehouseId: 3 },
    ]);
  });

  it('blocks a quantity spread across warehouses rather than using another branch or overselling', () => {
    const split = { ...product, name: 'Split', allowOversell: true, stocks: [
      { warehouseId: 1, quantity: 50, minStock: 0 },
      { warehouseId: 2, quantity: 2, minStock: 0 },
      { warehouseId: 3, quantity: 2, minStock: 0 },
    ] } as Product;
    expect(() => posSaleLines([{ product: split, quantity: 3 }], new Set([2, 3])))
      .toThrow(/repartido entre depósitos/);
    expect(() => posSaleLines([{ product: split, quantity: 5 }], new Set([2, 3])))
      .toThrow(/Stock insuficiente/);
  });
});
