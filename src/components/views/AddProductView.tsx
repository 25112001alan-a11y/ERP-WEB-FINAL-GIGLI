import React, { useState } from 'react';
import { ViewPath, Product } from '../../types';

interface AddProductViewProps {
  onAddProduct: (prod: Omit<Product, 'id'>) => void;
  onNavigate: (view: ViewPath) => void;
}

export const AddProductView: React.FC<AddProductViewProps> = ({ onAddProduct, onNavigate }) => {
  const [name, setName] = useState('');
  const [sku, setSku] = useState('');
  const [category, setCategory] = useState('Electrónica');
  const [description, setDescription] = useState('');
  const [initialStock, setInitialStock] = useState<number>(0);
  const [minStock, setMinStock] = useState<number>(5);
  const [warehouse, setWarehouse] = useState('Depósito Central');
  const [costPrice, setCostPrice] = useState<number>(0);
  const [price, setPrice] = useState<number>(0);
  const [taxRate, setTaxRate] = useState<number>(16);
  const [active, setActive] = useState(true);
  const [allowOversell, setAllowOversell] = useState(false);
  const [imageUrl, setImageUrl] = useState('');

  const marginPercentage = price > 0 ? (((price - costPrice) / price) * 100).toFixed(1) : '0.0';

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !sku || price <= 0) return;

    onAddProduct({
      sku,
      name,
      category,
      description,
      stock: initialStock,
      minStock,
      warehouse,
      costPrice,
      price,
      taxRate,
      active,
      status: initialStock > minStock ? 'InStock' : initialStock > 0 ? 'LowStock' : 'OutOfStock',
      imageUrl: imageUrl || undefined,
    });

    onNavigate('inventario');
  };

  return (
    <div className="flex flex-col w-full">
      <form onSubmit={handleSubmit}>
        {/* Header */}
        <div className="flex items-center justify-between mb-xl">
          <div>
            <h1 className="font-display-lg text-display-lg text-on-surface mb-xs">Agregar Producto</h1>
            <p className="font-body-lg text-body-lg text-on-surface-variant">Crea un nuevo artículo en el catálogo de inventario.</p>
          </div>
          <div className="flex gap-md">
            <button
              type="button"
              onClick={() => onNavigate('inventario')}
              className="px-md py-sm rounded-lg font-label-md text-label-md text-primary bg-transparent hover:bg-surface-container-high transition-colors cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="px-md py-sm rounded-lg font-label-md text-label-md text-on-secondary-container bg-secondary-container hover:bg-secondary transition-colors shadow-sm flex items-center gap-xs cursor-pointer"
            >
              <span className="material-symbols-outlined text-[18px]">save</span>
              Guardar Producto
            </button>
          </div>
        </div>

        <div className="grid grid-cols-12 gap-lg">
          {/* Left Form Column */}
          <div className="col-span-12 lg:col-span-8 flex flex-col gap-lg">
            {/* General Info */}
            <section className="bg-surface-container-lowest rounded-xl p-lg shadow-sm border border-outline-variant/20">
              <h2 className="font-headline-md text-headline-md text-on-surface mb-lg flex items-center gap-sm">
                <span className="material-symbols-outlined text-secondary">info</span>
                Información General
              </h2>
              <div className="grid grid-cols-2 gap-md mb-md">
                <div className="col-span-2">
                  <label className="block font-label-md text-label-md text-on-surface-variant mb-sm">Nombre del Producto *</label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Ej. Laptop ThinkPad T14"
                    className="w-full bg-surface-container-low rounded-lg px-md py-sm font-body-md text-body-md text-on-surface focus:outline-none focus:ring-2 focus:ring-secondary-container transition-all"
                    required
                  />
                </div>
                <div className="col-span-1">
                  <label className="block font-label-md text-label-md text-on-surface-variant mb-sm">SKU (Código de Barras) *</label>
                  <input
                    type="text"
                    value={sku}
                    onChange={(e) => setSku(e.target.value)}
                    placeholder="LAP-TP-T14-001"
                    className="w-full bg-surface-container-low rounded-lg px-md py-sm font-mono-sm text-mono-sm text-on-surface focus:outline-none focus:ring-2 focus:ring-secondary-container transition-all"
                    required
                  />
                </div>
                <div className="col-span-1">
                  <label className="block font-label-md text-label-md text-on-surface-variant mb-sm">Categoría</label>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className="w-full bg-surface-container-low rounded-lg px-md py-sm font-body-md text-body-md text-on-surface focus:outline-none focus:ring-2 focus:ring-secondary-container transition-all cursor-pointer outline-none"
                  >
                    <option value="Electrónica">Electrónica</option>
                    <option value="Mobiliario de Oficina">Mobiliario de Oficina</option>
                    <option value="Licencias de Software">Licencias de Software</option>
                    <option value="Suministros">Suministros</option>
                    <option value="Bebidas">Bebidas</option>
                    <option value="Snacks">Snacks</option>
                    <option value="Ropa">Ropa</option>
                  </select>
                </div>
                <div className="col-span-2">
                  <label className="block font-label-md text-label-md text-on-surface-variant mb-sm">Descripción</label>
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Descripción detallada del producto..."
                    className="w-full bg-surface-container-low rounded-lg px-md py-sm font-body-md text-body-md text-on-surface focus:outline-none focus:ring-2 focus:ring-secondary-container transition-all min-h-[100px] resize-y outline-none"
                  ></textarea>
                </div>
              </div>
            </section>

            {/* Inventory */}
            <section className="bg-surface-container-lowest rounded-xl p-lg shadow-sm border border-outline-variant/20 relative overflow-hidden">
              <h2 className="font-headline-md text-headline-md text-on-surface mb-lg flex items-center gap-sm">
                <span className="material-symbols-outlined text-secondary">inventory_2</span>
                Gestión de Inventario
              </h2>
              <div className="grid grid-cols-3 gap-md">
                <div className="col-span-1">
                  <label className="block font-label-md text-label-md text-on-surface-variant mb-sm">Stock Inicial</label>
                  <input
                    type="number"
                    min="0"
                    value={initialStock}
                    onChange={(e) => setInitialStock(Number(e.target.value))}
                    className="w-full bg-surface-container-low rounded-lg px-md py-sm font-mono-sm text-mono-sm text-on-surface focus:outline-none focus:ring-2 focus:ring-secondary-container transition-all outline-none"
                  />
                </div>
                <div className="col-span-1">
                  <label className="block font-label-md text-label-md text-on-surface-variant mb-sm flex items-center gap-xs">
                    Stock Mínimo
                    <span className="material-symbols-outlined text-[14px] text-error" title="Nivel de alerta">warning</span>
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={minStock}
                    onChange={(e) => setMinStock(Number(e.target.value))}
                    className="w-full bg-surface-container-low rounded-lg px-md py-sm font-mono-sm text-mono-sm text-on-surface focus:outline-none focus:ring-2 focus:ring-error transition-all outline-none"
                  />
                </div>
                <div className="col-span-1">
                  <label className="block font-label-md text-label-md text-on-surface-variant mb-sm">Almacén Principal</label>
                  <select
                    value={warehouse}
                    onChange={(e) => setWarehouse(e.target.value)}
                    className="w-full bg-surface-container-low rounded-lg px-md py-sm font-body-md text-body-md text-on-surface focus:outline-none focus:ring-2 focus:ring-secondary-container transition-all cursor-pointer outline-none"
                  >
                    <option value="Depósito Central">Bodega Central</option>
                    <option value="Tienda Norte">Sucursal Norte</option>
                    <option value="Tienda Sur">Sucursal Sur</option>
                  </select>
                </div>
              </div>
            </section>

            {/* Pricing */}
            <section className="bg-surface-container-lowest rounded-xl p-lg shadow-sm border border-outline-variant/20">
              <h2 className="font-headline-md text-headline-md text-on-surface mb-lg flex items-center gap-sm">
                <span className="material-symbols-outlined text-secondary">payments</span>
                Precios e Impuestos
              </h2>
              <div className="grid grid-cols-3 gap-md items-end">
                <div className="col-span-1">
                  <label className="block font-label-md text-label-md text-on-surface-variant mb-sm">Precio de Costo ($)</label>
                  <div className="relative">
                    <span className="absolute left-md top-1/2 -translate-y-1/2 text-on-surface-variant font-mono-sm">$</span>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={costPrice || ''}
                      onChange={(e) => setCostPrice(Number(e.target.value))}
                      placeholder="0.00"
                      className="w-full bg-surface-container-low rounded-lg pl-xl pr-md py-sm font-mono-sm text-mono-sm text-on-surface focus:outline-none focus:ring-2 focus:ring-secondary-container transition-all outline-none"
                    />
                  </div>
                </div>
                <div className="col-span-1">
                  <label className="block font-label-md text-label-md text-on-surface-variant mb-sm">Precio de Venta ($) *</label>
                  <div className="relative">
                    <span className="absolute left-md top-1/2 -translate-y-1/2 text-on-surface-variant font-mono-sm">$</span>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={price || ''}
                      onChange={(e) => setPrice(Number(e.target.value))}
                      placeholder="0.00"
                      className="w-full bg-surface-container-low rounded-lg pl-xl pr-md py-sm font-mono-sm text-mono-sm text-on-surface focus:outline-none focus:ring-2 focus:ring-secondary-container transition-all outline-none"
                      required
                    />
                  </div>
                </div>
                <div className="col-span-1">
                  <label className="block font-label-md text-label-md text-on-surface-variant mb-sm">Impuesto (IVA)</label>
                  <select
                    value={taxRate}
                    onChange={(e) => setTaxRate(Number(e.target.value))}
                    className="w-full bg-surface-container-low rounded-lg px-md py-sm font-body-md text-body-md text-on-surface focus:outline-none focus:ring-2 focus:ring-secondary-container transition-all cursor-pointer outline-none"
                  >
                    <option value={16}>16%</option>
                    <option value={12}>12%</option>
                    <option value={8}>8%</option>
                    <option value={0}>0% (Exento)</option>
                  </select>
                </div>
                <div className="col-span-3 mt-sm">
                  <div className="bg-surface-container-high rounded-lg p-md flex items-center justify-between">
                    <span className="font-body-md text-body-md text-on-surface-variant">Margen de ganancia estimado:</span>
                    <span className="font-label-md text-label-md text-on-tertiary-container bg-tertiary-fixed-dim/30 px-sm py-xs rounded font-mono-sm font-bold">
                      {marginPercentage}%
                    </span>
                  </div>
                </div>
              </div>
            </section>
          </div>

          {/* Right Sidebar */}
          <div className="col-span-12 lg:col-span-4 flex flex-col gap-lg">
            {/* Image Upload */}
            <section className="bg-surface-container-lowest rounded-xl p-lg shadow-sm border border-outline-variant/20 flex-1">
              <h2 className="font-headline-md text-headline-md text-on-surface mb-lg flex items-center gap-sm">
                <span className="material-symbols-outlined text-secondary">image</span>
                Fotografía del Producto
              </h2>
              <div className="border-2 border-dashed border-outline-variant rounded-xl flex flex-col items-center justify-center p-xl text-center cursor-pointer hover:bg-surface-container-low transition-colors group relative overflow-hidden">
                {imageUrl ? (
                  <div className="relative w-full h-40">
                    <img src={imageUrl} alt="Vista previa" className="w-full h-full object-contain" />
                    <button
                      type="button"
                      onClick={() => setImageUrl('')}
                      className="absolute top-2 right-2 bg-error text-on-error p-1 rounded-full text-xs"
                    >
                      <span className="material-symbols-outlined text-[16px]">close</span>
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="w-16 h-16 rounded-full bg-surface-container flex items-center justify-center mb-md group-hover:scale-110 transition-transform">
                      <span className="material-symbols-outlined text-[32px] text-secondary">cloud_upload</span>
                    </div>
                    <p className="font-label-md text-label-md text-on-surface mb-xs">Ingresa URL de la imagen</p>
                    <input
                      type="url"
                      value={imageUrl}
                      onChange={(e) => setImageUrl(e.target.value)}
                      placeholder="https://..."
                      className="w-full bg-surface-container-low border border-outline-variant rounded-lg p-sm text-xs font-mono-sm mt-sm outline-none"
                    />
                  </>
                )}
              </div>
            </section>

            {/* Status & Visibility */}
            <section className="bg-surface-container-lowest rounded-xl p-lg shadow-sm border border-outline-variant/20">
              <h2 className="font-headline-md text-headline-md text-on-surface mb-lg flex items-center gap-sm">
                <span className="material-symbols-outlined text-secondary">settings</span>
                Estado y Visibilidad
              </h2>
              <div className="flex flex-col gap-md">
                <label className="flex items-center justify-between cursor-pointer p-sm hover:bg-surface-container-low rounded-lg transition-colors">
                  <div>
                    <span className="block font-label-md text-label-md text-on-surface">Producto Activo</span>
                    <span className="block font-body-md text-body-md text-on-surface-variant">Visible en POS y catálogos</span>
                  </div>
                  <input
                    type="checkbox"
                    checked={active}
                    onChange={(e) => setActive(e.target.checked)}
                    className="w-5 h-5 accent-secondary cursor-pointer"
                  />
                </label>
                <label className="flex items-center justify-between cursor-pointer p-sm hover:bg-surface-container-low rounded-lg transition-colors">
                  <div>
                    <span className="block font-label-md text-label-md text-on-surface">Vender sin stock</span>
                    <span className="block font-body-md text-body-md text-on-surface-variant">Permitir reservas negativas</span>
                  </div>
                  <input
                    type="checkbox"
                    checked={allowOversell}
                    onChange={(e) => setAllowOversell(e.target.checked)}
                    className="w-5 h-5 accent-secondary cursor-pointer"
                  />
                </label>
              </div>
            </section>
          </div>
        </div>
      </form>
    </div>
  );
};
