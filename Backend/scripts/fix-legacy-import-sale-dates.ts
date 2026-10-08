/**
 * Re-apply sale_date for legacy imports using Asia/Karachi wall clock (matches old POS).
 *
 *   PRODUCTION_DATABASE_URL="postgresql://..." \
 *     npx ts-node scripts/fix-legacy-import-sale-dates.ts --i-confirm-production
 *
 * Add --dry-run to preview changes only.
 */
import * as fs from "fs";
import * as path from "path";
import { parse } from "csv-parse/sync";
import { PrismaClient } from "@prisma/client";
import { parseBusinessDateTime } from "../src/utils/timezone";
import {
  loadLegacySaleDatesFromLiveExport,
  resolveLegacySaleDateRaw,
} from "./legacy-pos-sale-dates";

const DATA_DIR = path.resolve(__dirname, "../../Previous Pos Data");
const DRY = process.argv.includes("--dry-run");

function loadEnvFile() {
  const envPath = path.resolve(__dirname, "../.env");
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i < 0) continue;
    const key = t.slice(0, i).trim();
    let val = t.slice(i + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = val;
  }
}

function readCsv(fileName: string): Record<string, string>[] {
  const full = path.join(DATA_DIR, fileName);
  if (!fs.existsSync(full)) throw new Error(`Missing CSV: ${full}`);
  const text = fs.readFileSync(full, "utf8").replace(/^\uFEFF/, "");
  return parse(text, {
    columns: true,
    skip_empty_lines: true,
    relax_column_count: true,
    trim: true,
    bom: true,
  }) as Record<string, string>[];
}

function clean(v: unknown): string {
  const s = String(v ?? "").trim();
  return !s || s.toUpperCase() === "NULL" ? "" : s;
}

async function main() {
  loadEnvFile();
  if (!process.argv.includes("--i-confirm-production")) {
    throw new Error("Add --i-confirm-production to update production sale dates.");
  }

  const url = process.env.PRODUCTION_DATABASE_URL?.trim();
  if (!url) throw new Error("PRODUCTION_DATABASE_URL is required.");

  const liveIndex = loadLegacySaleDatesFromLiveExport();
  console.log(
    "Live export sale dates:",
    liveIndex.byOldId.size,
    "(All Sales.csv used only as fallback)",
  );

  const csvSaleDateByOldId = new Map<string, string>();
  for (const r of readCsv("All Sales.csv")) {
    const id = clean(r.sale_id);
    const dt = clean(r.sale_date);
    if (id && dt && !csvSaleDateByOldId.has(id)) csvSaleDateByOldId.set(id, dt);
  }

  const returnDateByOldId = new Map<string, string>();
  for (const r of readCsv("All Sales Return.csv")) {
    const id = clean(r.return_id);
    const dt = clean(r.return_date);
    if (id && dt && !returnDateByOldId.has(id)) returnDateByOldId.set(id, dt);
  }

  const prisma = new PrismaClient({ datasources: { db: { url } } });
  let updated = 0;
  let skipped = 0;

  try {
    const sales = await prisma.sale.findMany({
      where: {
        OR: [
          { notes: { contains: "legacy_sale_id=" } },
          { notes: { contains: "legacy_return_id=" } },
        ],
      },
      select: { id: true, sale_date: true, notes: true, sale_number: true },
    });

    for (const sale of sales) {
      const notes = sale.notes || "";
      let raw: string | undefined;
      const saleMatch = notes.match(/legacy_sale_id=(\d+)/);
      const returnMatch = notes.match(/legacy_return_id=(\d+)/);
      if (saleMatch) {
        raw = resolveLegacySaleDateRaw({
          index: liveIndex,
          oldSaleId: saleMatch[1],
          referenceNo: sale.sale_number,
          csvFallback: csvSaleDateByOldId.get(saleMatch[1]),
        });
      } else if (returnMatch) {
        raw = returnDateByOldId.get(returnMatch[1]);
      }

      if (!raw) {
        raw = resolveLegacySaleDateRaw({
          index: liveIndex,
          referenceNo: sale.sale_number,
        });
      }

      if (!raw) {
        skipped += 1;
        continue;
      }

      const fixed = parseBusinessDateTime(raw);
      if (fixed.getTime() === sale.sale_date.getTime()) {
        skipped += 1;
        continue;
      }

      console.log(
        DRY ? "[dry-run] would fix" : "fix",
        sale.sale_number,
        sale.sale_date.toISOString(),
        "→",
        fixed.toISOString(),
        `(${raw})`,
      );

      if (!DRY) {
        await prisma.sale.update({
          where: { id: sale.id },
          data: { sale_date: fixed },
        });
      }
      updated += 1;
    }

    console.log(DRY ? "Would update:" : "Updated:", updated, "Skipped:", skipped);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
