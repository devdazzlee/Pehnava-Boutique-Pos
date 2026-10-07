/**
 * Export live data from legacy Stock Manager (pehnawa.bytescentral.com) via logged-in DataTables APIs.
 *
 * Usage (do NOT commit credentials):
 *   OLD_POS_IDENTITY=admin@admin.com OLD_POS_PASSWORD='...' \
 *     npx ts-node scripts/export-previous-pos-live.ts
 *
 * Writes JSON (+ optional CSV summaries) to ../../Previous Pos Data/live-export/
 */
import * as fs from "fs";
import * as path from "path";

const BASE = (process.env.OLD_POS_URL || "https://pehnawa.bytescentral.com").replace(/\/$/, "");
const OUT_DIR = path.resolve(__dirname, "../../Previous Pos Data/live-export");
const FROM = process.env.OLD_POS_FROM || "01/01/2020";
const TO = process.env.OLD_POS_TO || new Date().toLocaleDateString("en-GB").replace(/\//g, "/");

class CookieJar {
  private map = new Map<string, string>();

  ingest(raw: string | null) {
    if (!raw) return;
    for (const part of raw.split(/,(?=\s*[^;]+=)/)) {
      const seg = part.split(";")[0]?.trim();
      const i = seg.indexOf("=");
      if (i < 0) continue;
      this.map.set(seg.slice(0, i).trim(), seg.slice(i + 1).trim());
    }
  }

  header() {
    return [...this.map.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
  }
}

const jar = new CookieJar();

async function http(url: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  const cookie = jar.header();
  if (cookie) headers.set("cookie", cookie);
  if (init.body && !headers.has("content-type")) {
    headers.set("content-type", "application/x-www-form-urlencoded");
  }
  const res = await fetch(url, { ...init, headers, redirect: "follow" });
  jar.ingest(res.headers.get("set-cookie"));
  return res;
}

function parseLoginToken(html: string): string {
  const m = html.match(/name="token"\s+value="([^"]+)"/);
  if (!m) throw new Error("CSRF token not found on login page");
  return m[1];
}

async function login(identity: string, password: string) {
  const loginHtml = await (await http(`${BASE}/login`)).text();
  const token = parseLoginToken(loginHtml);
  const body = new URLSearchParams({
    token,
    identity,
    password,
    remember: "1",
  });
  const res = await http(`${BASE}/auth/login`, { method: "POST", body });
  const text = await res.text();
  if (!jar.header().includes("sess=")) {
    throw new Error(`Login failed (no session cookie). HTTP ${res.status}`);
  }
  const welcome = await (await http(`${BASE}/welcome`)).text();
  if (!/logout|mm_dashboard|welcome/i.test(welcome)) {
    throw new Error("Login may have failed — welcome page unexpected");
  }
  console.log("Logged in to", BASE);
}

type DataTableResponse = {
  iTotalRecords: number;
  aaData: unknown[];
};

async function fetchDataTable(url: string, params: Record<string, string>): Promise<DataTableResponse> {
  const q = new URLSearchParams({
    sEcho: "1",
    iDisplayStart: "0",
    iDisplayLength: "-1",
    ...params,
  });
  const res = await http(`${url}?${q}`);
  if (!res.ok) throw new Error(`DataTable ${url} HTTP ${res.status}`);
  const json = (await res.json()) as DataTableResponse;
  if (!Array.isArray(json.aaData)) throw new Error(`Bad DataTable response from ${url}`);
  return json;
}

function writeJson(name: string, data: unknown) {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const file = path.join(OUT_DIR, name);
  fs.writeFileSync(file, JSON.stringify(data, null, 2), "utf8");
  console.log("Wrote", file);
}

async function main() {
  const identity = process.env.OLD_POS_IDENTITY?.trim();
  const password = process.env.OLD_POS_PASSWORD;
  if (!identity || !password) {
    throw new Error("Set OLD_POS_IDENTITY and OLD_POS_PASSWORD environment variables");
  }

  await login(identity, password);

  const exports: { name: string; url: string; params: Record<string, string> }[] = [
    {
      name: "sales-all.json",
      url: `${BASE}/sales/getSales`,
      params: { view_mode: "all", from: FROM, to: TO },
    },
    {
      name: "sales-by-customer.json",
      url: `${BASE}/sales/getSales`,
      params: { view_mode: "customer", from: FROM, to: TO },
    },
    {
      name: "products.json",
      url: `${BASE}/products/getProducts`,
      params: {},
    },
    {
      name: "purchases.json",
      url: `${BASE}/purchases/getPurchases`,
      params: { view_mode: "supplier", from: FROM, to: TO },
    },
    {
      name: "expenses.json",
      url: `${BASE}/purchases/getExpenses`,
      params: { from: FROM, to: TO },
    },
    {
      name: "customers.json",
      url: `${BASE}/customers/getCustomers`,
      params: {},
    },
    {
      name: "suppliers.json",
      url: `${BASE}/suppliers/getSuppliers`,
      params: {},
    },
    {
      name: "adjustments.json",
      url: `${BASE}/products/getAdjustments`,
      params: {},
    },
    {
      name: "register-logs.json",
      url: `${BASE}/reports/getRrgisterlogs`,
      params: {},
    },
    {
      name: "gift-cards.json",
      url: `${BASE}/sales/getGiftCards`,
      params: {},
    },
    {
      name: "transfers.json",
      url: `${BASE}/transfers/getTransfers`,
      params: {},
    },
    {
      name: "auth-users.json",
      url: `${BASE}/auth/getUsers`,
      params: {},
    },
  ];

  const summary: Record<string, number> = {};

  for (const job of exports) {
    const dt = await fetchDataTable(job.url, job.params);
    writeJson(job.name, { exported_at: new Date().toISOString(), from: FROM, to: TO, ...dt });
    summary[job.name] = dt.iTotalRecords ?? dt.aaData.length;
  }

  writeJson("_summary.json", { base: BASE, from: FROM, to: TO, counts: summary });
  console.log("Counts:", summary);
  console.log("\nNOT exported automatically (needs ledger/COA/bank UI or custom endpoints):");
  console.log("  - Chart of accounts (/coa), journal vouchers (/journal)");
  console.log("  - Bank accounts & transfers (/banks)");
  console.log("  - Register logs (/reports/getRrgisterlogs)");
  console.log("  - Customer/supplier ledger detail (export from Ledgers menu in old POS)");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
