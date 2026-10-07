/**
 * Compare previois-posdata.txt control totals vs new POS COA tree.
 *   npx ts-node scripts/compare-legacy-coa-totals.ts
 */
import * as fs from "fs";
import * as path from "path";
import { ChartOfAccountsService } from "../src/services/chart-of-accounts.service";

function loadEnv() {
  const envPath = path.resolve(__dirname, "../.env");
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i < 0) continue;
    const key = t.slice(0, i).trim();
    let val = t.slice(i + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'")))
      val = val.slice(1, -1);
    if (process.env[key] === undefined) process.env[key] = val;
  }
}

function legacyControls(): Map<string, { name: string; amount: number }> {
  const file = path.resolve(__dirname, "../../previois-posdata.txt");
  const map = new Map<string, { name: string; amount: number }>();
  let section: "type" | "sub" | "ctrl" | "txn" | null = null;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    if (line.includes("Control Account")) {
      section = "ctrl";
      continue;
    }
    if (line.includes("Transactional Account")) {
      section = "txn";
      continue;
    }
    if (line.includes("Sub Type")) {
      section = "sub";
      continue;
    }
    if (line.includes("Type Of Account")) {
      section = "type";
      continue;
    }
    if (section !== "ctrl") continue;
    const m = line.match(/^(\d+)\t([^\t]+)\t([\d,]+\.?\d*)/);
    if (!m) continue;
    const code = m[1];
    if (!map.has(code)) map.set(code, { name: m[2], amount: Number(m[3].replace(/,/g, "")) });
  }
  return map;
}

/** Old POS code → new POS control code (structure differs). */
const CTRL_MAP: Record<string, string> = {
  "111": "111", // cash & bank
  "112": "113", // old inventory → new stock
  "113": "112", // old receivables → new trade receivables
  "211": "211", // payables
  "411": "411", // sales
  "511": "511", // COGS
};

const TYPE_TARGETS: Record<number, number> = {
  1: 14_076_171.88,
  2: 13_233_456.0,
  3: 7_550.0,
  4: 6_189_849.65,
  5: 5_354_683.77,
};

async function main() {
  loadEnv();
  const legacy = legacyControls();
  const svc = new ChartOfAccountsService();
  const tree = await svc.tree({ from: "2000-01-01", to: "2099-12-31", userRole: "SUPER_ADMIN" });

  console.log("=== Type totals (legacy file vs new POS Chart of Accounts) ===\n");
  console.log("ID | Type      | Legacy target   | New POS closing | Difference");
  for (const t of tree.types) {
    const leg = TYPE_TARGETS[t.code];
    const neu = t.totals.closing;
    console.log(
      `${t.code} | ${t.name.padEnd(9)} | ${leg.toFixed(2).padStart(15)} | ${neu.toFixed(2).padStart(15)} | ${(neu - leg).toFixed(2)}`,
    );
  }
  console.log("");
  const newCtrl = new Map<string, { name: string; closing: number }>();
  for (const t of tree.types) {
    for (const s of t.subTypes) {
      for (const c of s.controls) newCtrl.set(c.code, { name: c.name, closing: c.totals.closing });
    }
  }

  console.log("Control comparison (legacy file → new POS):\n");
  console.log("LegacyCode | LegacyName              | LegacyAmt    | NewCode | NewClosing   | Diff");
  for (const [oldCode, meta] of [...legacy.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    const newCode = CTRL_MAP[oldCode] || oldCode;
    const neu = newCtrl.get(newCode);
    if (!neu && oldCode.length <= 3) continue;
    const diff = neu ? neu.closing - meta.amount : NaN;
    if (!neu) continue;
    const flag = Math.abs(diff) > 5000 ? "  ←" : "";
    console.log(
      `${oldCode.padEnd(10)} | ${meta.name.slice(0, 22).padEnd(22)} | ${meta.amount.toFixed(2).padStart(12)} | ${newCode.padEnd(7)} | ${neu.closing.toFixed(2).padStart(12)} | ${diff.toFixed(2)}${flag}`,
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
