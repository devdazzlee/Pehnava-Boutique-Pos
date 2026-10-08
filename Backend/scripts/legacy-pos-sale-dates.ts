/**
 * Old POS "All Sales.csv" sale_date is often ~9h ahead of the UI / live export.
 * Prefer live-export/sales-all.json (same as pehnawa.bytescentral.com screens).
 */
import * as fs from "fs";
import * as path from "path";

const DATA_DIR = path.resolve(__dirname, "../../Previous Pos Data");
const LIVE_SALES_JSON = path.join(DATA_DIR, "live-export", "sales-all.json");

export type LegacySaleDateIndex = {
  byOldId: Map<string, string>;
  byReference: Map<string, string>;
};

function clean(v: unknown): string {
  const s = String(v ?? "").trim();
  return !s || s.toUpperCase() === "NULL" ? "" : s;
}

/** Load sale_date strings keyed by legacy sale_id and SALE/POS reference. */
export function loadLegacySaleDatesFromLiveExport(): LegacySaleDateIndex {
  const byOldId = new Map<string, string>();
  const byReference = new Map<string, string>();

  if (!fs.existsSync(LIVE_SALES_JSON)) {
    return { byOldId, byReference };
  }

  const json = JSON.parse(fs.readFileSync(LIVE_SALES_JSON, "utf8")) as {
    aaData?: unknown[][];
  };

  for (const row of json.aaData || []) {
    if (!Array.isArray(row) || row.length < 3) continue;
    const oldId = clean(row[0]);
    const saleDate = clean(row[1]);
    const ref = clean(row[2]).toUpperCase();
    if (oldId && saleDate) byOldId.set(oldId, saleDate);
    if (ref && saleDate) byReference.set(ref, saleDate);
  }

  return { byOldId, byReference };
}

export function resolveLegacySaleDateRaw(options: {
  index: LegacySaleDateIndex;
  oldSaleId?: string;
  referenceNo?: string;
  csvFallback?: string;
}): string {
  const id = clean(options.oldSaleId);
  const ref = clean(options.referenceNo).toUpperCase();
  if (id && options.index.byOldId.has(id)) {
    return options.index.byOldId.get(id)!;
  }
  if (ref && options.index.byReference.has(ref)) {
    return options.index.byReference.get(ref)!;
  }
  return clean(options.csvFallback);
}
