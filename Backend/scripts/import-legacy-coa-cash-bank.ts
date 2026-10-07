/**
 * Set legacy opening balances for Cash In Hand + Pehnawa Bank only
 * (from previois-posdata.txt / old POS chart). Skips Test Bank & Meezan.
 *
 *   npx ts-node scripts/import-legacy-coa-cash-bank.ts --i-confirm-production
 *   npx ts-node scripts/import-legacy-coa-cash-bank.ts --dry-run
 */
import * as fs from "fs";
import * as path from "path";
import { PrismaClient } from "@prisma/client";
import { ChartOfAccountsService } from "../src/services/chart-of-accounts.service";

const LEGACY_FILE = path.resolve(__dirname, "../../previois-posdata.txt");
const DRY = process.argv.includes("--dry-run");

const TARGETS: Record<string, { name: string; amount: number }> = {
  "1110001": { name: "Cash In Hand", amount: 3_906_312.85 },
  "1110005": { name: "Bank - Pehnawa Bank Account (112256332566)", amount: 1_563_806.0 },
};

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

function parseLegacyFile(): Record<string, number> {
  const text = fs.readFileSync(LEGACY_FILE, "utf8");
  const out: Record<string, number> = {};
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^(\d{7})\t([^\t]+)\t([\d,]+\.?\d*)/);
    if (!m) continue;
    const id = m[1];
    const amt = Number(m[3].replace(/,/g, ""));
    if (Number.isFinite(amt)) out[id] = amt;
  }
  return out;
}

async function main() {
  loadEnv();
  if (!process.argv.includes("--i-confirm-production") && !DRY) {
    throw new Error("Pass --i-confirm-production or --dry-run");
  }
  const url = process.env.PRODUCTION_DATABASE_URL || process.env.DATABASE_URL || "";
  if (!url || url.includes("neon.tech")) throw new Error("Use production DATABASE_URL / tunnel");

  const parsed = parseLegacyFile();
  for (const [code, t] of Object.entries(TARGETS)) {
    const fromFile = parsed[code];
    if (fromFile !== undefined && Math.abs(fromFile - t.amount) > 0.02) {
      console.warn(`File amount for ${code} differs: file=${fromFile} target=${t.amount} — using file`);
      t.amount = fromFile;
    }
  }

  const prisma = new PrismaClient({ datasources: { db: { url } } });
  const coa = new ChartOfAccountsService();

  try {
    const control = await prisma.controlAccount.findFirst({
      where: { OR: [{ code: "111" }, { system_key: "CASH_BANK" }] },
    });
    if (!control) throw new Error("Cash & Bank control (111) not found");

    const accounts = await prisma.transactionalAccount.findMany({
      where: { control_id: control.id },
      orderBy: { code: "asc" },
    });

    const cash = accounts.find((a) => a.system_key === "CASH") || accounts.find((a) => a.code === "1110001");
    if (!cash) throw new Error("Cash in Hand account missing");

    let bank =
      accounts.find((a) => a.name.toLowerCase().includes("pehnawa bank")) ||
      accounts.find((a) => a.code === "1110005") ||
      accounts.find((a) => a.code === "1110002" && !a.system_key);

    const actions: string[] = [];

    const cashOpening = TARGETS["1110001"].amount;
    if (Math.abs(Number(cash.opening_balance) - cashOpening) > 0.01) {
      actions.push(`Cash in Hand (${cash.code}): opening ${cash.opening_balance} → ${cashOpening}`);
      if (!DRY) {
        await coa.updateAccount(cash.id, {
          name: "Cash In Hand",
          opening_balance: cashOpening,
          opening_side: "DEBIT",
          notes: "legacy_coa_id=1110001;legacy_opening=1",
        });
      }
    }

    if (bank) {
      const bankOpening = TARGETS["1110005"].amount;
      if (
        bank.name !== TARGETS["1110005"].name ||
        Math.abs(Number(bank.opening_balance) - bankOpening) > 0.01
      ) {
        actions.push(
          `Bank (${bank.code}): "${bank.name}" ob=${bank.opening_balance} → "${TARGETS["1110005"].name}" ob=${bankOpening}`,
        );
        if (!DRY) {
          await coa.updateAccount(bank.id, {
            name: TARGETS["1110005"].name,
            opening_balance: bankOpening,
            opening_side: "DEBIT",
            notes: "legacy_coa_id=1110005;legacy_opening=1",
          });
        }
      }
    } else if (!DRY) {
      actions.push(`Create Pehnawa bank account under 111 with opening ${TARGETS["1110005"].amount}`);
      await coa.createAccount({
        control_id: control.id,
        code: "1110005",
        name: TARGETS["1110005"].name,
        opening_balance: TARGETS["1110005"].amount,
        opening_side: "DEBIT",
        notes: "legacy_coa_id=1110005;legacy_opening=1",
      });
    } else {
      actions.push(`Would create 1110005 Pehnawa bank opening ${TARGETS["1110005"].amount}`);
    }

    // Ensure we did not create test/meezan (no-op guard)
    const forbidden = ["test bank", "meezan"];
    for (const a of await prisma.transactionalAccount.findMany({ where: { control_id: control.id } })) {
      const low = a.name.toLowerCase();
      if (forbidden.some((f) => low.includes(f))) {
        console.log("Skipped forbidden bank (unchanged):", a.code, a.name);
      }
    }

    console.log(DRY ? "DRY RUN:" : "Applied:");
    for (const line of actions) console.log(" ", line);
    if (!actions.length) console.log("  (already up to date)");

    const tree = await coa.tree({ from: "2000-01-01", to: "2099-12-31", userRole: "SUPER_ADMIN" });
    for (const t of tree.types) {
      for (const s of t.subTypes) {
        for (const c of s.controls) {
          if (c.code !== "111") continue;
          console.log("\nCash & Bank control closing:", c.totals.closing);
          for (const acc of c.accounts) {
            console.log(
              `  ${acc.code} ${acc.name} closing=${acc.balance.closing} opening_balance=${acc.opening_balance}`,
            );
          }
        }
      }
    }
    console.log("\nLegacy target Cash & Bank control total: 5,435,118.85");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
