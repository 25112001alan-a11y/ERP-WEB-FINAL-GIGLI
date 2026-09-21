import { describe, it, expect } from 'vitest';
import { branchStock, deriveBranches, warehouseIdsForBranch } from './branch';
import type { Product, WarehouseOption } from '../types';

const warehouses: WarehouseOption[] = [
  { id: 1, name: 'Depósito Central', branchId: 10, branch: { id: 10, name: 'Casa Central' } },
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
      { id: 10, name: 'Casa Central' },
      { id: 20, name: 'Sucursal Norte' },
    ]);
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
