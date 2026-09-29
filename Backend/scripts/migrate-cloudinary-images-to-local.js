/**
 * One-time move of product/category images from Cloudinary to local disk (VPS).
 *
 * Each image is saved under its product/category name:
 *   products/ajwa-dates.jpg, products/ajwa-dates-2.jpg, categories/dry-fruits.jpg
 * Products that share the same name get their SKU added: products/almonds-100234567.jpg
 *
 * Usage (from Backend/, with UPLOADS_DIR and UPLOADS_PUBLIC_URL in .env):
 *   node scripts/migrate-cloudinary-images-to-local.js           # dry run: writes the plan CSV only
 *   node scripts/migrate-cloudinary-images-to-local.js --apply   # downloads files + updates DB
 *
 * Writes <UPLOADS_DIR>/cloudinary-mapping.csv (old URL -> new URL). Safe to re-run:
 * rows already moved no longer contain a Cloudinary URL.
 */
require('dotenv').config({ override: true });
const fs = require('fs/promises');
const path = require('path');
const { PrismaClient } = require('@prisma/client');

const APPLY = process.argv.includes('--apply');
const UPLOADS_DIR = path.resolve(process.env.UPLOADS_DIR || '');
const PUBLIC_URL = (process.env.UPLOADS_PUBLIC_URL || '').replace(/\/+$/, '');
if (!process.env.UPLOADS_DIR || !PUBLIC_URL) {
  console.error('UPLOADS_DIR and UPLOADS_PUBLIC_URL must be set in .env');
  process.exit(1);
}

const prisma = new PrismaClient();
const CLOUDINARY = { contains: 'cloudinary.com' };

function slugify(value) {
  const slug = String(value || '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
    .replace(/-+$/, '');
  return slug || 'image';
}

const EXT_BY_TYPE = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif', 'image/avif': 'avif', 'image/svg+xml': 'svg' };

function extFromUrl(url) {
  const m = url.split('?')[0].match(/\.(jpe?g|png|webp|gif|avif|svg)$/i);
  if (!m) return null;
  const ext = m[1].toLowerCase();
  return ext === 'jpeg' ? 'jpg' : ext;
}

// Reserves unique names per folder: base, base-2, base-3 ...
const taken = new Set();
function reserveName(folder, base) {
  for (let n = 1; ; n++) {
    const name = n === 1 ? base : `${base}-${n}`;
    const key = `${folder}/${name}`;
    if (!taken.has(key)) {
      taken.add(key);
      return name;
    }
  }
}

async function download(url, retries = 3) {
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const type = (res.headers.get('content-type') || '').split(';')[0].trim();
      return { data: Buffer.from(await res.arrayBuffer()), type };
    } catch (err) {
      if (attempt >= retries) throw err;
      await new Promise(r => setTimeout(r, 1000 * attempt));
    }
  }
}

function csv(value) {
  const s = String(value ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

async function main() {
  const [productImages, categoryImages, categories] = await Promise.all([
    prisma.productImage.findMany({
      where: { image: CLOUDINARY },
      select: { id: true, image: true, product_id: true, created_at: true, product: { select: { name: true, sku: true } } },
      orderBy: [{ created_at: 'asc' }, { id: 'asc' }],
    }),
    prisma.categoryImages.findMany({
      where: { image: CLOUDINARY },
      select: { id: true, image: true, category: { select: { name: true, slug: true } } },
      orderBy: [{ created_at: 'asc' }, { id: 'asc' }],
    }),
    prisma.category.findMany({
      where: { image: CLOUDINARY },
      select: { id: true, image: true, name: true, slug: true },
    }),
  ]);

  // ---- Plan: old URL -> { folder, name, owner } (same URL shared by rows is stored once)
  const plan = new Map();
  const planUrl = (url, folder, base, owner) => {
    if (!plan.has(url)) plan.set(url, { folder, name: reserveName(folder, base), owner });
  };

  // Products, alphabetically; products sharing a name get "-<sku>" so files never mix up
  const byProduct = new Map();
  for (const row of productImages) {
    if (!byProduct.has(row.product_id)) byProduct.set(row.product_id, { product: row.product, rows: [] });
    byProduct.get(row.product_id).rows.push(row);
  }
  const slugCount = new Map();
  for (const { product } of byProduct.values()) {
    const s = slugify(product.name);
    slugCount.set(s, (slugCount.get(s) || 0) + 1);
  }
  const products = [...byProduct.values()].sort((a, b) => a.product.name.localeCompare(b.product.name));
  for (const { product, rows } of products) {
    let base = slugify(product.name);
    if (slugCount.get(base) > 1) base = `${base}-${slugify(product.sku)}`;
    for (const row of rows) planUrl(row.image, 'products', base, `${product.name} (SKU ${product.sku})`);
  }

  for (const row of categoryImages) {
    planUrl(row.image, 'categories', slugify(row.category.slug || row.category.name), `Category: ${row.category.name}`);
  }
  for (const cat of categories) {
    planUrl(cat.image, 'categories', slugify(cat.slug || cat.name), `Category: ${cat.name}`);
  }

  console.log(`Rows with Cloudinary URLs: ${productImages.length} product images, ${categoryImages.length} category images, ${categories.length} category.image`);
  console.log(`Unique images to move: ${plan.size}`);

  // ---- Download (apply) and build the mapping
  const results = new Map(); // old URL -> { newUrl, status }
  const entries = [...plan.entries()];
  if (APPLY) {
    let done = 0;
    const worker = async () => {
      while (entries.length) {
        const [url, p] = entries.shift();
        try {
          const { data, type } = await download(url);
          const ext = EXT_BY_TYPE[type] || extFromUrl(url) || 'jpg';
          const file = `${p.name}.${ext}`;
          await fs.mkdir(path.join(UPLOADS_DIR, p.folder), { recursive: true });
          await fs.writeFile(path.join(UPLOADS_DIR, p.folder, file), data);
          results.set(url, { newUrl: `${PUBLIC_URL}/${p.folder}/${file}`, status: 'ok' });
        } catch (err) {
          results.set(url, { newUrl: '', status: `FAILED: ${err.message}` });
        }
        if (++done % 50 === 0) console.log(`  downloaded ${done}/${plan.size}`);
      }
    };
    await Promise.all(Array.from({ length: 8 }, worker));
  } else {
    for (const [url, p] of entries) {
      results.set(url, { newUrl: `${PUBLIC_URL}/${p.folder}/${p.name}.${extFromUrl(url) || 'jpg'}`, status: 'planned' });
    }
  }

  // ---- Mapping CSV
  await fs.mkdir(UPLOADS_DIR, { recursive: true });
  const csvPath = path.join(UPLOADS_DIR, APPLY ? 'cloudinary-mapping.csv' : 'cloudinary-mapping-dryrun.csv');
  const lines = ['owner,old_cloudinary_url,new_url,status'];
  for (const [url, p] of plan) {
    const r = results.get(url);
    lines.push([p.owner, url, r.newUrl, r.status].map(csv).join(','));
  }
  await fs.writeFile(csvPath, lines.join('\n') + '\n');
  console.log(`Mapping written: ${csvPath}`);

  const failed = [...results.values()].filter(r => r.status.startsWith('FAILED')).length;
  if (!APPLY) {
    console.log('Dry run only. Sample:');
    lines.slice(1, 16).forEach(l => console.log('  ' + l));
    return;
  }

  // ---- Update DB (only rows whose image downloaded fine)
  const ok = url => results.get(url)?.status === 'ok';
  const updates = [
    ...productImages.filter(r => ok(r.image)).map(r => prisma.productImage.update({ where: { id: r.id }, data: { image: results.get(r.image).newUrl } })),
    ...categoryImages.filter(r => ok(r.image)).map(r => prisma.categoryImages.update({ where: { id: r.id }, data: { image: results.get(r.image).newUrl } })),
    ...categories.filter(r => ok(r.image)).map(r => prisma.category.update({ where: { id: r.id }, data: { image: results.get(r.image).newUrl } })),
  ];
  await prisma.$transaction(updates, { timeout: 120000 });
  console.log(`Database rows updated: ${updates.length}. Downloads failed: ${failed} (those rows keep their Cloudinary URL).`);
}

main()
  .catch(err => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
