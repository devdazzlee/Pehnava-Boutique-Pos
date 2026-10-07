/**
 * Import data-back.txt journal rows as audit-only vouchers (no COA balance impact).
 *
 *   npx ts-node scripts/import-legacy-jv-archive.ts --i-confirm-production
 *   --dry-run
 */
import * as fs from "fs";
import * as path from "path";
import { Prisma, PrismaClient } from "@prisma/client";

const FILE = path.resolve(__dirname, "../../data-back.txt");
const DRY = process.argv.includes("--dry-run");
const ARCHIVE_REF = "legacy_jv_archive=1";

type JVRow = {
  voucher: string;
  date: string;
  type: string;
  narration: string;
  amount: number;
  status: string;
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
    if (process.env[key] === undefined) process.env[key] = val;
  }
}

function parseFile(): JVRow[] {
  const rows: JVRow[] = [];
  for (const line of fs.readFileSync(FILE, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t.startsWith("JV-")) continue;
    const parts = t.split("\t");
    if (parts.length < 6) continue;
    const amount = Number(parts[4].replace(/,/g, "")) || 0;
    rows.push({
      voucher: parts[0].trim(),
      date: parts[1].trim(),
      type: parts[2].trim(),
      narration: parts[3].trim(),
      amount,
      status: parts[5].trim().toUpperCase(),
    });
  }
  return rows;
}

async function ensureArchiveAccounts(prisma: PrismaClient) {
  const equitySub = await prisma.accountSubType.findFirst({ where: { type_code: 3 } });
  if (!equitySub) throw new Error("Equity sub-type missing");
  let control = await prisma.controlAccount.findFirst({
    where: { sub_type_id: equitySub.id, code: "319" },
  });
  if (!control) {
    control = await prisma.controlAccount.create({
      data: {
        code: "319",
        name: "Legacy Audit Memos",
        sub_type_id: equitySub.id,
        is_active: true,
        is_system: true,
      },
    });
  }
  async function acct(code: string, name: string) {
    let a = await prisma.transactionalAccount.findUnique({ where: { code } });
    if (!a) {
      a = await prisma.transactionalAccount.create({
        data: {
          code,
          name,
          control_id: control!.id,
          is_active: true,
          opening_balance: 0,
          opening_side: "DEBIT",
        },
      });
    }
    return a.id;
  }
  const debitId = await acct("3190001", "Legacy JV Archive (debit memo)");
  const creditId = await acct("3190002", "Legacy JV Archive (credit memo)");
  return { debitId, creditId };
}

async function main() {
  loadEnv();
  if (!process.argv.includes("--i-confirm-production") && !DRY) {
    throw new Error("Pass --i-confirm-production or --dry-run");
  }
  const url = process.env.PRODUCTION_DATABASE_URL || process.env.DATABASE_URL || "";
  if (!url || url.includes("neon.tech")) throw new Error("Production DB required");

  const rows = parseFile();
  const prisma = new PrismaClient({ datasources: { db: { url } } });

  try {
    const admin = await prisma.user.findFirst({ orderBy: { created_at: "asc" } });
    const branch = await prisma.branch.findFirst({ where: { is_active: true } });
    const { debitId, creditId } = await ensureArchiveAccounts(prisma);

    const existing = new Set(
      (
        await prisma.journalVoucher.findMany({
          where: { reference: { contains: ARCHIVE_REF } },
          select: { voucher_no: true },
        })
      ).map((v) => v.voucher_no),
    );

    let created = 0;
    let skipped = 0;

    for (const j of rows) {
      if (existing.has(j.voucher)) {
        skipped++;
        continue;
      }
      const amt = Math.abs(j.amount);
      if (amt < 0.005) continue;

      const voided = j.status !== "POSTED";
      const narration = `[${j.type}]${voided ? " [VOID]" : ""} ${j.narration}`.slice(0, 500);
      const voucherDate = new Date(j.date + "T12:00:00");

      if (DRY) {
        created++;
        continue;
      }

      try {
        await prisma.journalVoucher.create({
          data: {
            voucher_no: j.voucher,
            voucher_date: voucherDate,
            narration,
            reference: `${ARCHIVE_REF};old_status=${j.status};old_type=${j.type}`,
            branch_id: branch?.id ?? null,
            total: new Prisma.Decimal(amt),
            created_by: admin?.id ?? null,
            lines: {
              create: [
                {
                  account_id: debitId,
                  debit: new Prisma.Decimal(amt),
                  credit: new Prisma.Decimal(0),
                  description: j.type,
                },
                {
                  account_id: creditId,
                  debit: new Prisma.Decimal(0),
                  credit: new Prisma.Decimal(amt),
                  description: j.type,
                },
              ],
            },
          },
        });
        created++;
        if (created % 200 === 0) process.stdout.write(`\rImported ${created}...`);
      } catch (e: any) {
        if (e?.code === "P2002") {
          skipped++;
          continue;
        }
        throw e;
      }
    }

    console.log(DRY ? "\nDRY RUN:" : "\nDone:", { created, skipped, total: rows.length });
    console.log("Archive vouchers use reference", ARCHIVE_REF, "and do not affect COA totals.");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
