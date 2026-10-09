"use client";

import { useEffect, useState } from "react";
import { format } from "date-fns";
import { FileSpreadsheet, Loader2, Printer, Scale } from "lucide-react";
import * as XLSX from "xlsx";
import { Button } from "@/components/ui/button";
import { escapeHtml, printDocument } from "@/components/accounts/coa-shared";
import { StatTile } from "@/components/accounts/coa-ui";
import { rs, type SupplierRow, supplierApi, type LegacyExportReport } from "./supplier-api";

const day = (iso: string) => format(new Date(iso.includes("T") ? iso : `${iso}T12:00:00`), "d MMM yyyy");

function buildPdfHtml(data: LegacyExportReport) {
  const sumRow = (label: string, value: string) =>
    `<tr><td style="padding:6px 8px;border-bottom:1px solid #eee">${escapeHtml(label)}</td><td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:right;font-weight:600">${escapeHtml(value)}</td></tr>`;
  const tableHead = `<tr style="background:#f5f5f4;font-size:11px;text-transform:uppercase"><th style="padding:6px 8px;text-align:left">Date</th><th style="padding:6px 8px;text-align:left">Bill / ref</th><th style="padding:6px 8px;text-align:left">Product</th><th style="padding:6px 8px;text-align:right">Amount</th></tr>`;
  const removedRows = data.export_rows.removed_duplicates
    .map(
      (r) =>
        `<tr><td style="padding:5px 8px;border-bottom:1px solid #f0f0f0">${escapeHtml(r.date)}</td><td style="padding:5px 8px;border-bottom:1px solid #f0f0f0">—</td><td style="padding:5px 8px;border-bottom:1px solid #f0f0f0">${escapeHtml(r.product)}</td><td style="padding:5px 8px;border-bottom:1px solid #f0f0f0;text-align:right">${rs(r.amount)}</td></tr>`,
    )
    .join("");
  const extraRows = data.export_rows.still_extra_in_pos
    .slice(0, 40)
    .map(
      (r) =>
        `<tr><td style="padding:5px 8px;border-bottom:1px solid #f0f0f0">${escapeHtml(r.date)}</td><td style="padding:5px 8px;border-bottom:1px solid #f0f0f0">${escapeHtml(r.reference ?? "")}</td><td style="padding:5px 8px;border-bottom:1px solid #f0f0f0">${escapeHtml(r.product)}</td><td style="padding:5px 8px;border-bottom:1px solid #f0f0f0;text-align:right">${rs(r.amount)}</td></tr>`,
    )
    .join("");

  return `
    <div style="font-size:13px;line-height:1.45;color:#1a1a1a">
      <p style="margin:0 0 12px">Comparison of the <b>old POS purchase export</b> with this supplier&apos;s legacy bills in the new system (period ${escapeHtml(data.period.from)} to ${escapeHtml(data.period.to)}).</p>
      <table style="width:100%;max-width:520px;border-collapse:collapse;margin-bottom:16px">
        ${sumRow("Old POS export total (825 lines)", rs(data.old_pos_export.total))}
        ${sumRow("Legacy invoice total in new POS", rs(data.current_pos.legacy_invoice_total))}
        ${sumRow("Removed duplicate lines (cleanup)", `− ${rs(data.cleanup.removed_duplicate_amount)}`)}
        ${sumRow("Status", data.current_pos.aligned_with_old_export ? "Matches old export" : "Review needed")}
      </table>
      <h4 style="margin:16px 0 8px;font-size:13px">Why extra amount appeared (before cleanup)</h4>
      <ul style="margin:0 0 16px;padding-left:18px">${data.cleanup.explanation.map((e) => `<li>${escapeHtml(e)}</li>`).join("")}</ul>
      ${
        data.export_rows.removed_duplicates.length
          ? `<h4 style="margin:16px 0 8px;font-size:13px">Duplicate lines removed (${data.export_rows.removed_duplicates.length})</h4>
      <table style="width:100%;border-collapse:collapse;font-size:12px">${tableHead}${removedRows}</table>`
          : ""
      }
      ${
        data.export_rows.still_extra_in_pos.length
          ? `<h4 style="margin:16px 0 8px;font-size:13px;color:#b91c1c">Still extra in POS (${data.export_rows.still_extra_in_pos.length})</h4>
      <table style="width:100%;border-collapse:collapse;font-size:12px">${tableHead}${extraRows}</table>`
          : ""
      }
    </div>`;
}

function exportExcel(data: LegacyExportReport, supplierName: string) {
  const summary = [
    { Field: "Supplier", Value: supplierName },
    { Field: "Old POS period", Value: `${data.period.from} to ${data.period.to}` },
    { Field: "Old export source", Value: data.old_pos_export.source },
    { Field: "Old export lines", Value: data.old_pos_export.line_count },
    { Field: "Old export total (Rs)", Value: data.old_pos_export.total },
    { Field: "Legacy invoice total in POS (Rs)", Value: data.current_pos.legacy_invoice_total },
    { Field: "Removed duplicates (Rs)", Value: data.cleanup.removed_duplicate_amount },
    { Field: "Aligned with old export", Value: data.current_pos.aligned_with_old_export ? "Yes" : "No" },
  ];
  const oldLines = data.export_rows.old_pos_lines.map((r) => ({
    "Old supplier": r.supplier_name,
    "Bill ref": r.reference_no,
    "Product code": r.product_code,
    "Product (export)": r.product_name,
    Qty: r.quantity,
    "Unit cost": r.unit_cost,
    "Line total": r.purchase_amount,
    "In new POS": r.in_pos ? "Yes" : "No",
    "POS product name": r.pos_product_name ?? "",
    Match: r.match ?? "",
  }));
  const removed = data.export_rows.removed_duplicates.map((r) => ({
    Date: r.date,
    Product: r.product,
    Qty: r.quantity,
    "Unit cost": r.unit_cost,
    Amount: r.amount,
  }));
  const extra = data.export_rows.still_extra_in_pos.map((r) => ({
    Date: r.date,
    Reference: r.reference ?? "",
    Product: r.product,
    Qty: r.quantity,
    "Unit cost": r.unit_cost,
    Amount: r.amount,
    Notes: r.notes ?? "",
  }));

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summary), "Summary");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(oldLines), "Old POS lines");
  if (removed.length) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(removed), "Removed duplicates");
  if (extra.length) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(extra), "Still extra");
  XLSX.writeFile(wb, `pehnawa-old-pos-reconciliation-${format(new Date(), "yyyyMMdd")}.xlsx`);
}

export function SupplierLegacyExportCard({ supplier }: { supplier: SupplierRow }) {
  const [data, setData] = useState<LegacyExportReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!/^pehnawa$/i.test(supplier.name.trim())) return;
    let live = true;
    setLoading(true);
    setFailed(false);
    supplierApi
      .legacyExportReconciliation(supplier.id)
      .then((d) => live && setData(d))
      .catch(() => live && setFailed(true))
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
  }, [supplier.id, supplier.name]);

  if (!/^pehnawa$/i.test(supplier.name.trim())) return null;
  if (failed) return null;

  const printPdf = () => {
    if (!data) return;
    printDocument(
      `Old POS reconciliation — ${supplier.name}`,
      `${supplier.code} · ${data.period.from} – ${data.period.to} · printed ${day(new Date().toISOString())}`,
      buildPdfHtml(data),
    );
  };

  return (
    <section className="rounded-xl border border-[#d6c7a8] bg-[#fcf8f2]">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-[#e8dcc8] px-4 py-2.5">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-[#2a2012]">
          <Scale className="h-4 w-4 text-[#a67c2e]" />
          Old POS export match
        </h3>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" className="h-8 bg-white" disabled={!data} onClick={() => data && exportExcel(data, supplier.name)}>
            <FileSpreadsheet className="mr-1.5 h-4 w-4" />
            Excel
          </Button>
          <Button size="sm" variant="outline" className="h-8 bg-white" disabled={!data} onClick={printPdf}>
            <Printer className="mr-1.5 h-4 w-4" />
            PDF
          </Button>
        </div>
      </header>
      <div className="p-4">
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-gray-600">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading old POS comparison…
          </div>
        ) : !data ? null : (
          <>
            <p className="mb-3 text-xs text-gray-600">
              Compares <span className="font-medium">{data.old_pos_export.source}</span> with legacy bills through{" "}
              <span className="font-medium">{day(`${data.period.to}T12:00:00`)}</span>. Use exports to share with your client where duplicate import lines were removed.
            </p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <StatTile label="Old POS total" value={rs(data.old_pos_export.total)} />
              <StatTile label="Legacy bills in POS" value={rs(data.current_pos.legacy_invoice_total)} tone={data.current_pos.aligned_with_old_export ? "good" : "brand"} />
              <StatTile label="Duplicates removed" value={rs(data.cleanup.removed_duplicate_amount)} hint={`${data.cleanup.removed_duplicate_lines} lines`} />
              <StatTile
                label="Status"
                value={data.current_pos.aligned_with_old_export ? "Matched" : "Check extras"}
                tone={data.current_pos.aligned_with_old_export ? "good" : undefined}
              />
            </div>
            {!data.current_pos.aligned_with_old_export && data.current_pos.extra_duplicate_lines > 0 && (
              <p className="mt-3 text-xs text-amber-800">
                {data.current_pos.extra_duplicate_lines} extra legacy line(s) ({rs(data.current_pos.extra_duplicate_amount)}) still on bills — run align script or contact support.
              </p>
            )}
          </>
        )}
      </div>
    </section>
  );
}
