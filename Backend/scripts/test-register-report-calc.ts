import { buildRegisterReport, ReportSale, ReportSession } from '../src/services/register-report.calc';

const session = (overrides: Partial<ReportSession> = {}): ReportSession => ({
  id: 's1',
  branchId: 'b1',
  registerName: 'Main Register',
  registerNumber: 'REG-1',
  cashierId: 'u1',
  cashierName: 'pehnawa',
  openedAt: '2026-09-30T09:00:00.000Z',
  closedAt: '2026-09-30T21:00:00.000Z',
  opening: 1000,
  closing: 1000,
  status: 'CLOSED',
  ...overrides,
});

const sale = (overrides: Partial<ReportSale> = {}): ReportSale => ({
  id: 'sale-1',
  saleNumber: 'SALE-1',
  invoiceNumber: null,
  saleDate: '2026-09-30T10:00:00.000Z',
  customerName: 'Ayesha',
  cashierId: 'u1',
  cashierName: 'pehnawa',
  branchId: 'b1',
  subtotal: 1000,
  discount: 0,
  tax: 0,
  total: 1000,
  paymentMethod: 'CASH',
  status: 'COMPLETED',
  originalSaleId: null,
  notes: null,
  ...overrides,
});

const run = (name: string, check: () => void) => {
  try {
    check();
    console.log(`PASS ${name}`);
  } catch (error: any) {
    console.error(`FAIL ${name}: ${error.message}`);
    process.exitCode = 1;
  }
};

const assert = (condition: boolean, message: string) => {
  if (!condition) throw new Error(message);
};

run('1 opening cash + cash sale', () => {
  const report = buildRegisterReport({
    sessions: [session({ opening: 500, closing: 800 })],
    sales: [sale({ subtotal: 300, total: 300 })],
    expenses: [],
    customerPayments: [],
  });
  assert(report.cash.expectedCash === 800, `expected 800 got ${report.cash.expectedCash}`);
  assert(report.cash.variance === 'Balanced', report.cash.variance || '');
  assert(report.salesSummary.saleCount === 1, 'count');
});

run('2 cash and card stay separate', () => {
  const report = buildRegisterReport({
    sessions: [session({ opening: 0, closing: 400 })],
    sales: [
      sale({ id: 'a', total: 400, subtotal: 400, paymentMethod: 'CASH' }),
      sale({ id: 'b', total: 600, subtotal: 600, paymentMethod: 'CARD' }),
    ],
    expenses: [],
    customerPayments: [],
  });
  const cash = report.payments.find((row) => row.method === 'CASH');
  const card = report.payments.find((row) => row.method === 'CARD');
  assert(cash?.amount === 400 && cash.count === 1, 'cash');
  assert(card?.amount === 600 && card.count === 1, 'card');
  assert(report.cash.expectedCash === 400, `expected cash ${report.cash.expectedCash}`);
  assert(report.cards.otherPayments === 600, 'other');
});

run('3 discount and tax', () => {
  const report = buildRegisterReport({
    sessions: [session({ opening: 0, closing: 900 })],
    sales: [sale({ subtotal: 1000, discount: 100, tax: 50, total: 900 })],
    expenses: [],
    customerPayments: [],
  });
  assert(report.salesSummary.grossSales === 1000, 'gross');
  assert(report.salesSummary.discounts === 100, 'discount');
  assert(report.salesSummary.netSales === 900, 'net');
  assert(report.salesSummary.tax === 50, 'tax');
  assert(report.salesSummary.finalSales === 950, `final ${report.salesSummary.finalSales}`);
  assert(report.payments.find((row) => row.method === 'CASH')?.amount === 900, 'charged amount');
});

run('4 return reduces sales and cash', () => {
  const report = buildRegisterReport({
    sessions: [session({ opening: 0, closing: 0 })],
    sales: [
      sale({ id: 'orig', subtotal: 430, discount: 30, total: 400, status: 'REFUNDED' }),
      sale({
        id: 'rtn',
        saleNumber: 'RTN-1',
        originalSaleId: 'orig',
        subtotal: -400,
        discount: 0,
        total: -400,
        status: 'REFUNDED',
        notes: '__META__{"returnValue":400,"exchangeValue":0}__ENDMETA__',
      }),
    ],
    expenses: [],
    customerPayments: [],
  });
  assert(report.salesSummary.returns === 400, `returns ${report.salesSummary.returns}`);
  assert(report.salesSummary.netSales === 0, `net ${report.salesSummary.netSales}`);
  assert(report.cash.cashRefunds === 400, 'cash refund');
  assert(report.cash.expectedCash === 0, `expected ${report.cash.expectedCash}`);
  assert(report.salesSummary.saleCount === 1, 'original counted once');
});

run('5 cash in from customer payment', () => {
  const report = buildRegisterReport({
    sessions: [session({ opening: 200, closing: 350 })],
    sales: [],
    expenses: [],
    customerPayments: [
      {
        id: 'p1',
        amount: 150,
        date: '2026-09-30T12:00:00.000Z',
        method: 'CASH',
        customerName: 'Ali',
        cashierId: 'u1',
        cashierName: 'pehnawa',
        reference: 'CP-1',
      },
    ],
  });
  assert(report.cash.cashReceived === 150, 'received');
  assert(report.cash.expectedCash === 350, `expected ${report.cash.expectedCash}`);
  assert(report.cash.variance === 'Balanced', report.cash.variance || '');
});

run('6 cash out', () => {
  const report = buildRegisterReport({
    sessions: [session({ opening: 500, closing: 420 })],
    sales: [],
    expenses: [
      {
        id: 'e1',
        particular: 'Tea',
        amount: 80,
        date: '2026-09-30T13:00:00.000Z',
        paymentMethod: 'CASH',
        status: 'APPROVED',
        cashierId: 'u1',
        cashierName: 'pehnawa',
        branchId: 'b1',
      },
    ],
    customerPayments: [],
  });
  assert(report.cash.cashPaidOut === 80, 'paid out');
  assert(report.cash.expectedCash === 420, `expected ${report.cash.expectedCash}`);
});

run('7 several sales in one session', () => {
  const report = buildRegisterReport({
    sessions: [session({ opening: 100, closing: 400 })],
    sales: [
      sale({ id: '1', subtotal: 100, total: 100 }),
      sale({ id: '2', subtotal: 200, total: 200 }),
    ],
    expenses: [],
    customerPayments: [],
  });
  assert(report.salesSummary.saleCount === 2, 'count');
  assert(report.salesSummary.netSales === 300, 'net');
  assert(report.cash.expectedCash === 400, 'expected');
});

run('8 zero transactions', () => {
  const report = buildRegisterReport({
    sessions: [session({ opening: 250, closing: 250 })],
    sales: [],
    expenses: [],
    customerPayments: [],
  });
  assert(report.salesSummary.saleCount === 0, 'count');
  assert(report.cash.expectedCash === 250, 'expected');
  assert(report.cash.variance === 'Balanced', report.cash.variance || '');
  assert(report.transactions.length === 0, 'rows');
});

run('9 overage', () => {
  const report = buildRegisterReport({
    sessions: [session({ opening: 100, closing: 180 })],
    sales: [sale({ subtotal: 50, total: 50 })],
    expenses: [],
    customerPayments: [],
  });
  assert(report.cash.expectedCash === 150, 'expected');
  assert(report.cash.difference === 30, `diff ${report.cash.difference}`);
  assert(report.cash.variance === 'Over', report.cash.variance || '');
});

run('10 shortage', () => {
  const report = buildRegisterReport({
    sessions: [session({ opening: 100, closing: 120 })],
    sales: [sale({ subtotal: 50, total: 50 })],
    expenses: [],
    customerPayments: [],
  });
  assert(report.cash.expectedCash === 150, 'expected');
  assert(report.cash.difference === -30, `diff ${report.cash.difference}`);
  assert(report.cash.variance === 'Short', report.cash.variance || '');
});

run('cancelled and regenerated bills are not counted', () => {
  const report = buildRegisterReport({
    sessions: [session({ opening: 0, closing: 100 })],
    sales: [
      sale({ id: 'ok', total: 100, subtotal: 100 }),
      sale({ id: 'void', status: 'CANCELLED', total: 999, subtotal: 999 }),
      sale({ id: 'copy', notes: 'Regenerated bill copy', total: 100, subtotal: 100 }),
    ],
    expenses: [],
    customerPayments: [],
  });
  assert(report.salesSummary.saleCount === 1, 'only the real sale');
  assert(report.cash.cashSales === 100, 'cash');
});

if (process.exitCode) {
  console.error('Register report calculations failed');
} else {
  console.log('All register report calculations passed');
}
