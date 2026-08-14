import React, { useState } from 'react';
import { ViewPath, Product } from '../../types';

interface InventoryViewProps {
  products: Product[];
  onNavigate: (view: ViewPath) => void;
}

export const InventoryView: React.FC<InventoryViewProps> = ({ products, onNavigate }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [selectedWarehouse, setSelectedWarehouse] = useState('');

  const filteredProducts = products.filter((prod) => {
    const matchesSearch = prod.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      prod.sku.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCat = !selectedCategory || prod.category === selectedCategory;
    const matchesWh = !selectedWarehouse || prod.warehouse === selectedWarehouse;
    return matchesSearch && matchesCat && matchesWh;
  });

  return (
    <div className="flex flex-col w-full gap-xl">
      {/* Header Bar */}
      <div className="flex justify-between items-center bg-surface-container rounded-xl p-lg shadow-sm">
        <div className="flex flex-col gap-xs">
          <h1 className="font-display-lg text-display-lg text-on-surface">Gestión de Inventario</h1>
          <p className="font-body-lg text-body-lg text-on-surface-variant">Control general de stock y depósitos.</p>
        </div>
        <div className="flex gap-md">
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
      <div className="grid grid-cols-1 md:grid-cols-3 gap-lg">
        <div className="bg-surface-container-lowest rounded-xl p-lg shadow-sm flex flex-col gap-md relative overflow-hidden group hover:shadow-md transition-shadow border border-outline-variant/20">
          <div className="absolute -right-4 -top-4 w-24 h-24 bg-tertiary-container/10 rounded-full blur-xl group-hover:bg-tertiary-container/20 transition-colors"></div>
          <div className="flex justify-between items-center">
            <span className="font-headline-md text-headline-md text-on-surface">Depósito Central</span>
            <span className="material-symbols-outlined text-tertiary-container">warehouse</span>
          </div>
          <div className="flex flex-col">
            <span className="font-display-lg text-display-lg text-on-surface">14,250</span>
            <span className="font-body-md text-body-md text-on-surface-variant">Unidades en stock</span>
          </div>
          <div className="flex items-center gap-sm mt-sm">
            <span className="flex h-2 w-2 rounded-full bg-on-tertiary-container"></span>
            <span className="font-label-md text-label-md text-on-surface-variant">Operativo</span>
          </div>
        </div>

        <div className="bg-surface-container-lowest rounded-xl p-lg shadow-sm flex flex-col gap-md relative overflow-hidden group hover:shadow-md transition-shadow border border-outline-variant/20">
          <div className="absolute -right-4 -top-4 w-24 h-24 bg-secondary-container/10 rounded-full blur-xl group-hover:bg-secondary-container/20 transition-colors"></div>
          <div className="flex justify-between items-center">
            <span className="font-headline-md text-headline-md text-on-surface">Tienda Norte</span>
            <span className="material-symbols-outlined text-secondary-container">storefront</span>
          </div>
          <div className="flex flex-col">
            <span className="font-display-lg text-display-lg text-on-surface">3,840</span>
            <span className="font-body-md text-body-md text-on-surface-variant">Unidades en stock</span>
          </div>
          <div className="flex items-center gap-sm mt-sm">
            <span className="flex h-2 w-2 rounded-full bg-error"></span>
            <span className="font-label-md text-label-md text-on-surface-variant">Alerta de capacidad</span>
          </div>
        </div>

        <div className="bg-surface-container-lowest rounded-xl p-lg shadow-sm flex flex-col gap-md relative overflow-hidden group hover:shadow-md transition-shadow border border-outline-variant/20">
          <div className="absolute -right-4 -top-4 w-24 h-24 bg-primary-container/10 rounded-full blur-xl group-hover:bg-primary-container/20 transition-colors"></div>
          <div className="flex justify-between items-center">
            <span className="font-headline-md text-headline-md text-on-surface">Tienda Sur</span>
            <span className="material-symbols-outlined text-primary-container">storefront</span>
          </div>
          <div className="flex flex-col">
            <span className="font-display-lg text-display-lg text-on-surface">2,105</span>
            <span className="font-body-md text-body-md text-on-surface-variant">Unidades en stock</span>
          </div>
          <div className="flex items-center gap-sm mt-sm">
            <span className="flex h-2 w-2 rounded-full bg-on-tertiary-container"></span>
            <span className="font-label-md text-label-md text-on-surface-variant">Operativo</span>
          </div>
        </div>
      </div>

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
          <div className="flex gap-md w-full md:w-auto">
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="bg-surface text-on-surface font-body-md text-body-md py-sm px-md rounded-lg shadow-sm border-none focus:ring-2 focus:ring-secondary-container cursor-pointer"
            >
              <option value="">Todas las Categorías</option>
              <option value="Electrónica">Electrónica</option>
              <option value="Muebles">Muebles</option>
              <option value="Ropa">Ropa</option>
              <option value="Bebidas">Bebidas</option>
              <option value="Snacks">Snacks</option>
            </select>
            <select
              value={selectedWarehouse}
              onChange={(e) => setSelectedWarehouse(e.target.value)}
              className="bg-surface text-on-surface font-body-md text-body-md py-sm px-md rounded-lg shadow-sm border-none focus:ring-2 focus:ring-secondary-container cursor-pointer"
            >
              <option value="">Todos los Depósitos</option>
              <option value="Depósito Central">Depósito Central</option>
              <option value="Tienda Norte">Tienda Norte</option>
              <option value="Tienda Sur">Tienda Sur</option>
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
                <th className="p-md font-label-md text-label-md text-on-surface-variant uppercase tracking-wider font-semibold border-b border-surface-container-highest text-center">Acciones</th>
              </tr>
            </thead>
            <tbody className="font-body-md text-body-md text-on-surface divide-y divide-surface-container-highest">
              {filteredProducts.map((product) => (
                <tr key={product.id} className="hover:bg-surface-container-low transition-colors group cursor-pointer">
                  <td className="p-md flex items-center gap-md">
                    <div className="w-12 h-12 rounded-lg bg-surface-container overflow-hidden shrink-0 flex items-center justify-center">
                      {product.imageUrl ? (
                        <img src={product.imageUrl} alt={product.name} className="w-full h-full object-cover" />
                      ) : (
                        <span className="material-symbols-outlined text-outline">inventory_2</span>
                      )}
                    </div>
                    <span className="font-medium text-on-surface">{product.name}</span>
                  </td>
                  <td className="p-md text-on-surface-variant font-mono-sm text-mono-sm">{product.sku}</td>
                  <td className="p-md">{product.category}</td>
                  <td className="p-md text-right font-medium">{product.stock}</td>
                  <td className="p-md text-right text-on-surface-variant">${product.price.toFixed(2)}</td>
                  <td className="p-md text-center">
                    {product.stock > product.minStock ? (
                      <span className="inline-flex items-center gap-xs px-sm py-xs rounded-full bg-tertiary-container/10 text-on-tertiary-container font-label-md text-label-md">
                        <span className="w-1.5 h-1.5 rounded-full bg-on-tertiary-container"></span> En Stock
                      </span>
                    ) : product.stock > 0 ? (
                      <span className="inline-flex items-center gap-xs px-sm py-xs rounded-full bg-error-container text-on-error-container font-label-md text-label-md">
                        <span className="w-1.5 h-1.5 rounded-full bg-error"></span> Bajo Stock
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-xs px-sm py-xs rounded-full bg-surface-container-highest text-on-surface-variant font-label-md text-label-md">
                        <span className="w-1.5 h-1.5 rounded-full bg-outline"></span> Agotado
                      </span>
                    )}
                  </td>
                  <td className="p-md text-center">
                    <button className="text-on-surface-variant hover:text-primary transition-colors p-xs rounded-full hover:bg-surface-container-high opacity-80 group-hover:opacity-100">
                      <span className="material-symbols-outlined text-[20px]">more_vert</span>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="p-md bg-surface-container-lowest rounded-b-xl border-t border-surface-container-highest flex justify-between items-center">
          <span className="font-body-md text-body-md text-on-surface-variant">Mostrando 1-{filteredProducts.length} de {filteredProducts.length} productos</span>
          <div className="flex gap-sm">
            <button className="p-sm rounded-lg hover:bg-surface-container-high text-on-surface-variant disabled:opacity-50 transition-colors" disabled>
              <span className="material-symbols-outlined">chevron_left</span>
            </button>
            <button className="p-sm rounded-lg hover:bg-surface-container-high text-on-surface-variant transition-colors">
              <span className="material-symbols-outlined">chevron_right</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
