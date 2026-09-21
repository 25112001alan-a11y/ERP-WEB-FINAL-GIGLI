import React, { useMemo, useState } from 'react';
import { ViewPath, Product, WarehouseOption } from '../../types';
import { branchStock, warehouseIdsForBranch } from '../../lib/branch';

interface InventoryViewProps {
  products: Product[];
  warehouses: WarehouseOption[];
  activeBranchId?: number | null;
  activeBranchName?: string;
  onClearBranch?: () => void;
  onNavigate: (view: ViewPath) => void;
}

interface WarehouseStats {
  id: number;
  name: string;
  units: number;
  inStock: number;
  lowStock: number;
  outOfStock: number;
}

export const InventoryView: React.FC<InventoryViewProps> = ({
  products,
  warehouses,
  activeBranchId = null,
  activeBranchName,
  onClearBranch,
  onNavigate,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [selectedWarehouse, setSelectedWarehouse] = useState('');

  // Branch scope: null = "Todas" (current behavior). Everything below filters
  // client-side on the already-loaded rows.
  const branchWarehouseIds = useMemo(
    () => warehouseIdsForBranch(warehouses, activeBranchId),
    [warehouses, activeBranchId],
  );
  const inBranch = (warehouseId: number) => branchWarehouseIds == null || branchWarehouseIds.has(warehouseId);

  const warehouseStats = useMemo<WarehouseStats[]>(() => {
    const map = new Map<number, WarehouseStats>();
    products.forEach((p) => {
      p.stocks.forEach((s) => {
        if (!inBranch(s.warehouseId)) return;
        let st = map.get(s.warehouseId);
        if (!st) {
          st = {
            id: s.warehouseId,
            name: warehouses.find((w) => w.id === s.warehouseId)?.name ?? `Depósito ${s.warehouseId}`,
            units: 0,
            inStock: 0,
            lowStock: 0,
            outOfStock: 0,
          };
          map.set(s.warehouseId, st);
        }
        st.units += s.quantity;
        if (s.quantity <= 0) st.outOfStock += 1;
        else if (s.quantity <= s.minStock) st.lowStock += 1;
        else st.inStock += 1;
      });
    });
    return [...map.values()];
  }, [products, warehouses, branchWarehouseIds]);

  const categories = useMemo(
    () => [...new Set(products.map((p) => p.category))].filter(Boolean).sort(),
    [products],
  );

  const filteredProducts = products
    .filter((prod) => (branchWarehouseIds == null ? true : prod.stocks.some((s) => branchWarehouseIds.has(s.warehouseId))))
    .filter((prod) => {
      const matchesSearch = prod.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        prod.sku.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesCat = !selectedCategory || prod.category === selectedCategory;
      const matchesWh = !selectedWarehouse || prod.stocks.some((s) => s.warehouseId === Number(selectedWarehouse));
      return matchesSearch && matchesCat && matchesWh;
    });
  // Branch-scoped quantities for the table (null = global totals, current behavior).
  const displayStock = (prod: Product) => branchStock(prod, branchWarehouseIds);

  const cardDecor = [
    'bg-tertiary-container/10 group-hover:bg-tertiary-container/20',
    'bg-secondary-container/10 group-hover:bg-secondary-container/20',
    'bg-primary-container/10 group-hover:bg-primary-container/20',
  ];

  return (
    <div className="flex flex-col w-full gap-xl">
      {/* Header Bar */}
      <div className="flex justify-between items-center bg-surface-container rounded-xl p-lg shadow-sm flex-wrap gap-md">
        <div className="flex flex-col gap-xs">
          <h1 className="font-display-lg text-display-lg text-on-surface">Gestión de Inventario</h1>
          <p className="font-body-lg text-body-lg text-on-surface-variant">Control general de stock y depósitos.</p>
          {activeBranchId != null && (
            <button
              onClick={onClearBranch}
              title="Mostrar todas las sucursales"
              className="self-start inline-flex items-center gap-xs px-sm py-xs rounded-full bg-secondary-container text-on-secondary-container font-label-md text-label-md hover:opacity-90 transition-opacity cursor-pointer"
            >
              <span className="material-symbols-outlined text-[16px]">store</span>
              {activeBranchName ?? `Sucursal ${activeBranchId}`}
              <span className="material-symbols-outlined text-[16px]">close</span>
            </button>
          )}
        </div>
        <div className="flex gap-md flex-wrap">
          <button
            onClick={() => onNavigate('inventario-transferencia')}
            className="bg-surface text-on-surface hover:bg-surface-container-high transition-colors px-md py-sm rounded-lg flex items-center gap-sm font-label-md text-label-md shadow-sm cursor-pointer"
          >
            <span className="material-symbols-outlined text-[20px]">swap_horiz</span>
            Transferencia
          </button>
          <button
            onClick={() => onNavigate('inventario-ajuste')}
            className="bg-surface text-on-surface hover:bg-surface-container-high transition-colors px-md py-sm rounded-lg flex items-center gap-sm font-label-md text-label-md shadow-sm cursor-pointer"
          >
            <span className="material-symbols-outlined text-[20px]">tune</span>
            Ajuste
          </button>
          <button
            onClick={() => onNavigate('inventario-nuevo-producto')}
            className="bg-primary text-on-primary hover:bg-primary-fixed-dim hover:text-on-primary-fixed transition-colors px-md py-sm rounded-lg flex items-center gap-sm font-label-md text-label-md shadow-md cursor-pointer"
          >
            <span className="material-symbols-outlined text-[20px]">add</span>
            Agregar Producto
          </button>
        </div>
      </div>

      {/* Warehouse Status Cards */}
      {warehouseStats.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-lg">
          {warehouseStats.map((w, idx) => (
            <div key={w.id} className="bg-surface-container-lowest rounded-xl p-lg shadow-sm flex flex-col gap-md relative overflow-hidden group hover:shadow-md transition-shadow border border-outline-variant/20">
              <div className={`absolute -right-4 -top-4 w-24 h-24 rounded-full blur-xl transition-colors ${cardDecor[idx % cardDecor.length]}`}></div>
              <div className="flex justify-between items-center">
                <span className="font-headline-md text-headline-md text-on-surface">{w.name}</span>
                <span className="material-symbols-outlined text-tertiary-container">warehouse</span>
              </div>
              <div className="flex flex-col">
                <span className="font-display-lg text-display-lg text-on-surface">{w.units.toLocaleString('es-ES')}</span>
                <span className="font-body-md text-body-md text-on-surface-variant">Unidades en stock</span>
              </div>
              <div className="flex flex-wrap items-center gap-x-md gap-y-xs mt-sm">
                <span className="flex items-center gap-xs">
                  <span className="flex h-2 w-2 rounded-full bg-on-tertiary-container"></span>
                  <span className="font-label-md text-label-md text-on-surface-variant">{w.inStock} en stock</span>
                </span>
                <span className="flex items-center gap-xs">
                  <span className="flex h-2 w-2 rounded-full bg-error"></span>
                  <span className="font-label-md text-label-md text-on-surface-variant">{w.lowStock} bajo mínimo</span>
                </span>
                <span className="flex items-center gap-xs">
                  <span className="flex h-2 w-2 rounded-full bg-outline"></span>
                  <span className="font-label-md text-label-md text-on-surface-variant">{w.outOfStock} agotados</span>
                </span>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="bg-surface-container-lowest rounded-xl p-lg shadow-sm border border-outline-variant/20 text-center">
          <span className="font-body-md text-body-md text-on-surface-variant">Sin datos de stock para mostrar.</span>
        </div>
      )}

      {/* Main Inventory Table Card */}
      <div className="bg-surface-container-lowest rounded-xl shadow-sm flex flex-col border border-outline-variant/20">
        <div className="p-lg flex flex-col md:flex-row gap-md justify-between items-center bg-surface-container-low rounded-t-xl">
          <div className="relative w-full md:w-96">
            <span className="material-symbols-outlined absolute left-md top-1/2 -translate-y-1/2 text-outline">search</span>
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Buscar por nombre, SKU..."
              className="w-full bg-surface border-none rounded-full py-sm pl-10 pr-md font-body-md text-body-md text-on-surface focus:ring-2 focus:ring-secondary-container transition-shadow outline-none"
            />
          </div>
          <div className="flex gap-md flex-wrap w-full md:w-auto">
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="bg-surface text-on-surface font-body-md text-body-md py-sm px-md rounded-lg shadow-sm border-none focus:ring-2 focus:ring-secondary-container cursor-pointer min-w-0"
            >
              <option value="">Todas las Categorías</option>
              {categories.map((cat) => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
            <select
              value={selectedWarehouse}
              onChange={(e) => setSelectedWarehouse(e.target.value)}
              className="bg-surface text-on-surface font-body-md text-body-md py-sm px-md rounded-lg shadow-sm border-none focus:ring-2 focus:ring-secondary-container cursor-pointer min-w-0"
            >
              <option value="">Todos los Depósitos</option>
              {warehouseStats.map((w) => (
                <option key={w.id} value={String(w.id)}>{w.name}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-surface-container-lowest">
                <th className="p-md font-label-md text-label-md text-on-surface-variant uppercase tracking-wider font-semibold border-b border-surface-container-highest">Producto</th>
                <th className="p-md font-label-md text-label-md text-on-surface-variant uppercase tracking-wider font-semibold border-b border-surface-container-highest">SKU</th>
                <th className="p-md font-label-md text-label-md text-on-surface-variant uppercase tracking-wider font-semibold border-b border-surface-container-highest">Categoría</th>
                <th className="p-md font-label-md text-label-md text-on-surface-variant uppercase tracking-wider font-semibold border-b border-surface-container-highest text-right">Stock</th>
                <th className="p-md font-label-md text-label-md text-on-surface-variant uppercase tracking-wider font-semibold border-b border-surface-container-highest text-right">Precio</th>
                <th className="p-md font-label-md text-label-md text-on-surface-variant uppercase tracking-wider font-semibold border-b border-surface-container-highest text-center">Estado</th>
              </tr>
            </thead>
            <tbody className="font-body-md text-body-md text-on-surface divide-y divide-surface-container-highest">
              {filteredProducts.map((product) => (
                <tr key={product.id} className="hover:bg-surface-container-low transition-colors group">
                  <td className="p-md flex items-center gap-md">
                    <div className="w-12 h-12 rounded-lg bg-surface-container overflow-hidden shrink-0 flex items-center justify-center">
                      {product.imageUrl ? (
                        <img src={product.imageUrl} alt={product.name} className="w-full h-full object-cover" />
                      ) : (
                        <span className="material-symbols-outlined text-outline">inventory_2</span>
                      )}
                    </div>
                    <span className="font-medium text-on-surface truncate max-w-[220px]">{product.name}</span>
                  </td>
                  <td className="p-md text-on-surface-variant font-mono-sm text-mono-sm">{product.sku}</td>
                  <td className="p-md">{product.category}</td>
                  <td className="p-md text-right font-medium">{displayStock(product)}</td>
                  <td className="p-md text-right text-on-surface-variant">${product.price.toFixed(2)}</td>
                  <td className="p-md text-center">
                    {displayStock(product) > product.minStock ? (
                      <span className="inline-flex items-center gap-xs px-sm py-xs rounded-full bg-tertiary-container/10 text-on-tertiary-container font-label-md text-label-md">
                        <span className="w-1.5 h-1.5 rounded-full bg-on-tertiary-container"></span> En Stock
                      </span>
                    ) : displayStock(product) > 0 ? (
                      <span className="inline-flex items-center gap-xs px-sm py-xs rounded-full bg-error-container text-on-error-container font-label-md text-label-md">
                        <span className="w-1.5 h-1.5 rounded-full bg-error"></span> Bajo Stock
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-xs px-sm py-xs rounded-full bg-surface-container-highest text-on-surface-variant font-label-md text-label-md">
                        <span className="w-1.5 h-1.5 rounded-full bg-outline"></span> Agotado
                      </span>
                    )}
                  </td>
                </tr>
              ))}
              {filteredProducts.length === 0 && (
                <tr>
                  <td colSpan={6} className="p-md text-center text-on-surface-variant">No se encontraron productos.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="p-md bg-surface-container-lowest rounded-b-xl border-t border-surface-container-highest flex justify-between items-center flex-wrap gap-sm">
          <span className="font-body-md text-body-md text-on-surface-variant">Mostrando {filteredProducts.length} de {products.length} productos</span>
        </div>
      </div>
    </div>
  );
};