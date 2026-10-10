/**
 * Export every product with all details (category, sub-category, brand, colour,
 * size, unit, supplier, tax, images, stock per branch) to a JSON file.
 * Read-only — nothing in the database is changed.
 *
 *   npx ts-node --transpile-only scripts/export-products.ts
 *
 * Output: exports/products-export-YYYY-MM-DD.json
 */
import fs from 'fs';
import path from 'path';
import { prisma } from '../src/prisma/client';

const isDecimal = (v: unknown): v is { toNumber: () => number } => v != null && typeof v === 'object' && 'toNumber' in (v as object);
const plain = (obj: Record<string, unknown>) =>
  Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, isDecimal(v) ? Number(v) : v]));
const named = (x: any) => (x ? { id: x.id, name: x.name, code: x.code ?? null } : null);

async function main() {
  const products = await prisma.product.findMany({
    orderBy: { created_at: 'asc' },
    include: {
      unit: true,
      category: true,
      subcategory: true,
      brand: true,
      color: true,
      size: true,
      supplier: { select: { id: true, code: true, name: true, phone_number: true, mobile_number: true, city: true } },
      tax: true,
      ProductImage: true,
      stock: { include: { branch: { select: { id: true, name: true, code: true } } } },
    },
  });

  const rows = products.map((p: any) => {
    const { unit, category, subcategory, brand, color, size, supplier, tax, ProductImage, stock, ...base } = p;
    return {
      ...plain(base),
      unit: named(unit),
      category: named(category),
      subcategory: named(subcategory),
      brand: named(brand),
      color: named(color),
      size: named(size),
      supplier: supplier ?? null,
      tax: tax ? { id: tax.id, code: tax.code, name: tax.name, percentage: tax.percentage } : null,
      images: (ProductImage ?? []).map((i: any) => {
        const { product_id: _p, ...img } = i;
        void _p;
        return plain(img);
      }),
      stock: (stock ?? []).map((s: any) => ({
        branch: s.branch,
        current_quantity: Number(s.current_quantity ?? 0),
        reserved_quantity: Number(s.reserved_quantity ?? 0),
        minimum_quantity: Number(s.minimum_quantity ?? 0),
        maximum_quantity: s.maximum_quantity == null ? null : Number(s.maximum_quantity),
        reorder_level: s.reorder_level == null ? null : Number(s.reorder_level),
      })),
      total_stock: (stock ?? []).reduce((t: number, s: any) => t + Number(s.current_quantity || 0), 0),
    };
  });

  const dir = path.join(__dirname, '..', 'exports');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `products-export-${new Date().toISOString().slice(0, 10)}.json`);
  fs.writeFileSync(file, JSON.stringify({ exportedAt: new Date().toISOString(), count: rows.length, products: rows }, null, 2));
  console.log(`Exported ${rows.length} products → ${file} (${Math.round(fs.statSync(file).size / 1024)} KB)`);
}

main()
  .catch((e) => {
    console.error('Export failed:', e.message);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
