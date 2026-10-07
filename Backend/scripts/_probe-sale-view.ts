const BASE = "https://pehnawa.bytescentral.com";
class CookieJar {
  map = new Map<string, string>();
  ingest(r: string | null) {
    if (!r) return;
    for (const p of r.split(/,(?=\s*[^;]+=)/)) {
      const s = p.split(";")[0]?.trim();
      const i = s.indexOf("=");
      if (i < 0) continue;
      this.map.set(s.slice(0, i).trim(), s.slice(i + 1).trim());
    }
  }
  header() {
    return [...this.map.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
  }
}
const jar = new CookieJar();
async function http(url: string, init: RequestInit = {}) {
  const h = new Headers(init.headers as HeadersInit);
  const c = jar.header();
  if (c) h.set("cookie", c);
  const res = await fetch(url, { ...init, headers: h });
  jar.ingest(res.headers.get("set-cookie"));
  return res;
}
(async () => {
  const id = process.env.SALE_ID || "90";
  const identity = process.env.OLD_POS_IDENTITY!;
  const password = process.env.OLD_POS_PASSWORD!;
  const loginHtml = await (await http(`${BASE}/login`)).text();
  const token = loginHtml.match(/name="token"\s+value="([^"]+)"/)?.[1];
  if (!token) throw new Error("no token");
  await http(`${BASE}/auth/login`, {
    method: "POST",
    body: new URLSearchParams({ token, identity, password, remember: "1" }),
  });
  const view = await (await http(`${BASE}/sales/view/${id}`)).text();
  console.log("length", view.length);
  const idx = view.indexOf("order-table");
  console.log(view.slice(idx, idx + 1200));
  const modal = await (await http(`${BASE}/sales/modal_view/${id}`)).text();
  console.log("modal len", modal.length, modal.slice(0, 500));
})();
