// Seed-only catalog data. Independent from the frontend (src/data was removed).
// Uses the same demo catalog the app shipped with.

export interface SeedProduct {
  sku: string;
  name: string;
  category: string;
  stock: number;
  minStock: number;
  price: number;
  costPrice: number;
  taxRate: number;
  active: boolean;
  warehouse: string;
  description: string | null;
}

export const SEED_PRODUCTS: SeedProduct[] = [
  {
    sku: 'EL-LP-001',
    name: 'Laptop Pro X1',
    category: 'Electrónica',
    stock: 145,
    minStock: 10,
    price: 1299.0,
    costPrice: 850.0,
    taxRate: 16,
    active: true,
    warehouse: 'Depósito Central',
    description: 'Laptop corporativa de alto rendimiento con procesador Intel i7 y 16GB RAM.',
  },
  {
    sku: 'EL-KB-042',
    name: 'Teclado Mecánico K2',
    category: 'Electrónica',
    stock: 12,
    minStock: 15,
    price: 89.5,
    costPrice: 45.0,
    taxRate: 16,
    active: true,
    warehouse: 'Depósito Central',
    description: 'Teclado mecánico ergonómico con retroiluminación RGB sutil y switches táctiles.',
  },
  {
    sku: 'FU-CH-105',
    name: 'Silla Ergonómica E1',
    category: 'Muebles',
    stock: 0,
    minStock: 5,
    price: 249.0,
    costPrice: 130.0,
    taxRate: 16,
    active: true,
    warehouse: 'Tienda Norte',
    description: 'Silla de oficina ergonómica ajustable con soporte lumbar y malla transpirable.',
  },
  {
    sku: 'CL-TS-001',
    name: 'Camiseta Básica Algodón',
    category: 'Ropa',
    stock: 850,
    minStock: 50,
    price: 19.99,
    costPrice: 8.0,
    taxRate: 16,
    active: true,
    warehouse: 'Depósito Central',
    description: 'Camiseta 100% algodón peinado suave, varios colores neutros.',
  },
  {
    sku: 'BEB-CC-600',
    name: 'Coca-Cola Original 600ml',
    category: 'Bebidas',
    stock: 45,
    minStock: 20,
    price: 1.5,
    costPrice: 0.8,
    taxRate: 12,
    active: true,
    warehouse: 'Depósito Central',
    description: 'Bebida gaseosa refrescante en botella de 600ml.',
  },
  {
    sku: 'SNK-LAY-160',
    name: "Papas Fritas Lay's Clásicas 160g",
    category: 'Snacks',
    stock: 2,
    minStock: 10,
    price: 2.8,
    costPrice: 1.5,
    taxRate: 12,
    active: true,
    warehouse: 'Depósito Central',
    description: 'Papas crujientes saladas en bolsa familiar de 160g.',
  },
];

export interface SeedSupplier {
  name: string;
  email: string;
  phone: string;
  taxId: string;
  contactPerson: string;
}

export const SEED_SUPPLIERS: SeedSupplier[] = [
  { name: 'Acme Corp Ind.', email: 'contacto@acmecorp.com', phone: '+34 912 345 678', taxId: 'A-12345678', contactPerson: 'Juan Acosta' },
  { name: 'Global Logistics LLC', email: 'ventas@globallogistics.com', phone: '+34 911 888 999', taxId: 'B-87654321', contactPerson: 'Laura Gómez' },
  { name: 'TechSolutions SA', email: 'info@techsolutions.com', phone: '+34 933 222 111', taxId: 'A-99887766', contactPerson: 'Carlos Vega' },
];