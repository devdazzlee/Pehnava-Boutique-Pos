import { prisma } from '../src/prisma/client';
import { SupplierService } from '../src/services/supplier.service';
(async () => {
  const s = new SupplierService();
  const list = await s.listSuppliers({ page: 1, limit: 5 });
  console.log('list', list.meta.total, JSON.stringify(list.data.map((r) => ({ n: r.name, due: r.balance_due, od: r.overdue_amount, last: r.last_purchase_date }))));
  const sum = await s.payablesSummary();
  console.log('summary', JSON.stringify(sum.totals), JSON.stringify(sum.aging), JSON.stringify(sum.trend));
  const id = list.data.find((r) => r.purchase_count > 0)?.id ?? list.data[0]?.id;
  if (id) {
    const acc = await s.getSupplierAccount(id);
    console.log('account', acc.due, acc.overdue, acc.openBills.length, JSON.stringify(acc.openBills[0] ?? null));
    const led = await s.getSupplierLedger(id);
    console.log('ledger', JSON.stringify(led.summary), led.entries.length, JSON.stringify(led.entries[0]));
    const st = await s.getSupplierStatement(id, { from: '2026-09-01', to: '2026-10-03' });
    console.log('statement', JSON.stringify(st.summary));
    const docs = await s.getSupplierDocuments(id);
    console.log('docs', docs.orders.length, docs.invoices.length, docs.returns.length, JSON.stringify(docs.orders[0] ?? null));
    const pur = await s.getSupplierPurchases(id);
    console.log('purchases', JSON.stringify(pur.summary), JSON.stringify(pur.productSummary[0]));
    console.log('products', (await s.getSupplierProducts(id)).length);
  }
  console.log('facets', JSON.stringify(await s.facets()));
  await prisma.$disconnect();
})().catch((e) => { console.error(e); process.exit(1); });
