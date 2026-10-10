"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CSV_TARGET_TOTAL = exports.LEGACY_PERIOD_FROM = exports.LEGACY_CUTOFF_YMD = void 0;
exports.resolveLegacyPurchaseCsvPath = resolveLegacyPurchaseCsvPath;
exports.loadPehnawaFamilyCsv = loadPehnawaFamilyCsv;
exports.getPehnawaLegacyExportReport = getPehnawaLegacyExportReport;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const client_1 = require("../prisma/client");
const timezone_1 = require("../utils/timezone");
exports.LEGACY_CUTOFF_YMD = '2026-10-03';
exports.LEGACY_PERIOD_FROM = '2026-08-28';
exports.CSV_TARGET_TOTAL = 9_494_716;
function parseMoney(s) {
    return Number(String(s).replace(/,/g, '').replace(/"/g, '').trim()) || 0;
}
function parseCsvLine(line) {
    const out = [];
    let cur = '';
    let q = false;
    for (const c of line) {
        if (c === '"') {
            q = !q;
            continue;
        }
        if (c === ',' && !q) {
            out.push(cur);
            cur = '';
            continue;
        }
        cur += c;
    }
    out.push(cur);
    return out;
}
function resolveLegacyPurchaseCsvPath() {
    const candidates = [
        process.env.LEGACY_PURCHASE_CSV_PATH,
        path_1.default.resolve(__dirname, '../../data/legacy-all-purchase.csv'),
        path_1.default.resolve(process.cwd(), 'All pUrchase (3).csv'),
        path_1.default.resolve(process.cwd(), '../All pUrchase (3).csv'),
        path_1.default.resolve(process.cwd(), 'data/legacy-all-purchase.csv'),
        path_1.default.resolve(__dirname, '../../../All pUrchase (3).csv'),
    ].filter(Boolean);
    for (const p of candidates) {
        if (fs_1.default.existsSync(p))
            return p;
    }
    return null;
}
function loadPehnawaFamilyCsv() {
    const csvPath = resolveLegacyPurchaseCsvPath();
    if (!csvPath)
        throw new Error('Legacy purchase CSV not found on server (All pUrchase (3).csv)');
    const buf = fs_1.default.readFileSync(csvPath);
    const text = buf.toString('latin1');
    const lines = text.split(/\r?\n/).filter(Boolean);
    const header = parseCsvLine(lines[0]);
    const idx = (n) => header.indexOf(n);
    const rows = [];
    for (let i = 1; i < lines.length; i++) {
        const c = parseCsvLine(lines[i]);
        const supplier_name = c[idx('supplier_name')]?.trim() ?? '';
        if (!/^(Pehnawa|Zainab-Pehnawa)$/i.test(supplier_name))
            continue;
        const reference_no = c[idx('reference_no')]?.trim() ?? '';
        const product_code = c[idx('product_code')]?.trim() ?? '';
        const product_name = c[idx('product_name')]?.trim() ?? '';
        const quantity = parseMoney(c[idx('quantity')] ?? '0');
        const unit_cost = parseMoney(c[idx('unit_cost')] ?? '0');
        const purchase_amount = parseMoney(c[idx('purchase_amount')] ?? '0');
        const strictKey = `${reference_no}|${product_code}|${quantity}|${unit_cost}|${purchase_amount}`;
        const looseKey = `${reference_no}|${quantity}|${unit_cost}|${purchase_amount}`;
        rows.push({
            reference_no,
            supplier_name,
            product_code,
            product_name,
            quantity,
            unit_cost,
            purchase_amount,
            strictKey,
            looseKey,
        });
    }
    return rows;
}
function purchaseKeys(p) {
    const ref = (p.invoice_ref || '').trim();
    const qty = Number(p.quantity);
    const cost = Number(p.cost_price);
    const amt = Math.round(qty * cost * 100) / 100;
    const loose = `${ref}|${qty}|${cost}|${amt}`;
    const codes = [p.product.custom_code, p.product.sku].filter(Boolean);
    const strict = (codes.length ? codes : ['']).map((code) => `${ref}|${code}|${qty}|${cost}|${amt}`);
    return { strict, loose };
}
function isBackfill(notes) {
    return !!(notes || '').includes('legacy_backfill=1');
}
async function getPehnawaLegacyExportReport(supplierId) {
    const supplier = await client_1.prisma.supplier.findUnique({
        where: { id: supplierId },
        select: { id: true, name: true, code: true },
    });
    if (!supplier)
        return null;
    if (!/^pehnawa$/i.test(supplier.name.trim()))
        return null;
    const csvRows = loadPehnawaFamilyCsv();
    const csvTotal = csvRows.reduce((s, r) => s + r.purchase_amount, 0);
    const looseToCsv = new Map();
    for (const r of csvRows) {
        const list = looseToCsv.get(r.looseKey) ?? [];
        list.push(r);
        looseToCsv.set(r.looseKey, list);
    }
    const purchases = await client_1.prisma.purchase.findMany({
        where: { supplier_id: supplierId, purchase_invoice_id: { not: null } },
        include: { product: { select: { name: true, sku: true, custom_code: true } } },
        orderBy: { purchase_date: 'asc' },
    });
    const legacyInvoiced = purchases.filter((p) => (0, timezone_1.toBusinessYmd)(p.purchase_date) <= exports.LEGACY_CUTOFF_YMD);
    function matchesCsvRow(p, row) {
        const { strict, loose } = purchaseKeys(p);
        if (strict.includes(row.strictKey))
            return 'strict';
        if (loose === row.looseKey) {
            if (p.product.name.toLowerCase().includes(row.product_name.slice(0, 20).toLowerCase()) ||
                row.product_name.toLowerCase().includes(p.product.name.slice(0, 20).toLowerCase())) {
                return 'loose';
            }
            const bucket = looseToCsv.get(loose);
            if (bucket?.length === 1)
                return 'loose';
        }
        return null;
    }
    function rank(p, how) {
        let s = how === 'strict' ? 10 : 5;
        if (isBackfill(p.notes))
            s -= 4;
        if ((p.notes || '').includes('legacy_purchase_id='))
            s += 1;
        return s;
    }
    const usedPurchaseIds = new Set();
    const matchedLines = [];
    for (const csvRow of csvRows) {
        const cands = [];
        for (const p of legacyInvoiced) {
            if (usedPurchaseIds.has(p.id))
                continue;
            const how = matchesCsvRow(p, csvRow);
            if (how)
                cands.push({ p, how });
        }
        let pick = null;
        let how = null;
        if (cands.length) {
            cands.sort((a, b) => rank(b.p, b.how) - rank(a.p, a.how));
            pick = cands[0].p;
            how = cands[0].how;
            usedPurchaseIds.add(pick.id);
        }
        matchedLines.push({
            reference_no: csvRow.reference_no,
            supplier_name: csvRow.supplier_name,
            product_code: csvRow.product_code,
            product_name: csvRow.product_name,
            quantity: csvRow.quantity,
            unit_cost: csvRow.unit_cost,
            purchase_amount: csvRow.purchase_amount,
            in_pos: !!pick,
            pos_product_name: pick?.product.name ?? null,
            match: how,
        });
    }
    const extraInPos = legacyInvoiced
        .filter((p) => !usedPurchaseIds.has(p.id))
        .map((p) => ({
        date: (0, timezone_1.toBusinessYmd)(p.purchase_date),
        reference: p.invoice_ref,
        product: p.product.name,
        quantity: Number(p.quantity),
        unit_cost: Number(p.cost_price),
        amount: Math.round(Number(p.quantity) * Number(p.cost_price) * 100) / 100,
        notes: p.notes,
    }));
    const invoices = await client_1.prisma.purchaseInvoice.findMany({
        where: { supplier_id: supplierId },
        select: { total_amount: true },
    });
    const invoiceHeaderSum = invoices.reduce((s, i) => s + Number(i.total_amount), 0);
    const keepTotal = matchedLines.filter((l) => l.in_pos).reduce((s, l) => s + l.purchase_amount, 0);
    const extraTotal = extraInPos.reduce((s, l) => s + l.amount, 0);
    const missingLines = matchedLines.filter((l) => !l.in_pos);
    const removedAdjustments = await client_1.prisma.stockMovement.findMany({
        where: {
            notes: { contains: 'Align Pehnawa ledger to old POS CSV export' },
        },
        include: { product: { select: { name: true } } },
        orderBy: { created_at: 'asc' },
    });
    const removedDuplicates = removedAdjustments.map((m) => ({
        date: (0, timezone_1.toBusinessYmd)(m.created_at),
        product: m.product.name,
        quantity: Math.abs(Number(m.quantity_change)),
        unit_cost: Number(m.unit_cost),
        amount: Math.round(Math.abs(Number(m.quantity_change)) * Number(m.unit_cost) * 100) / 100,
    }));
    const removedTotal = removedDuplicates.reduce((s, r) => s + r.amount, 0);
    const aligned = Math.abs(invoiceHeaderSum - exports.CSV_TARGET_TOTAL) < 1 && extraInPos.length === 0;
    return {
        supplier: { id: supplier.id, name: supplier.name, code: supplier.code },
        period: { from: exports.LEGACY_PERIOD_FROM, to: exports.LEGACY_CUTOFF_YMD },
        old_pos_export: {
            source: 'All pUrchase (3).csv (Pehnawa + Zainab-Pehnawa)',
            line_count: csvRows.length,
            total: Math.round(csvTotal),
        },
        current_pos: {
            legacy_invoice_total: Math.round(invoiceHeaderSum),
            matched_line_count: matchedLines.filter((l) => l.in_pos).length,
            matched_amount: Math.round(keepTotal),
            extra_duplicate_lines: extraInPos.length,
            extra_duplicate_amount: Math.round(extraTotal),
            missing_from_pos: missingLines.length,
            missing_amount: Math.round(missingLines.reduce((s, l) => s + l.purchase_amount, 0)),
            aligned_with_old_export: aligned,
        },
        cleanup: {
            removed_duplicate_lines: removedDuplicates.length,
            removed_duplicate_amount: Math.round(removedTotal),
            explanation: [
                'Duplicate import and legacy backfill rows that counted the same old POS stock twice.',
                'Extra lines on bills such as PO/2026/08/0010 where the same goods were already imported under product codes.',
            ],
        },
        export_rows: {
            old_pos_lines: matchedLines,
            removed_duplicates: removedDuplicates,
            still_extra_in_pos: extraInPos,
            still_missing_from_pos: missingLines.map((l) => ({
                reference_no: l.reference_no,
                supplier_name: l.supplier_name,
                product_name: l.product_name,
                purchase_amount: l.purchase_amount,
            })),
        },
    };
}
//# sourceMappingURL=pehnawa-legacy-csv.service.js.map