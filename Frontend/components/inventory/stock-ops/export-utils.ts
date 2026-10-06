import * as XLSX from "xlsx";
import { prepareLogoForPdf } from "@/lib/stock-in-receipt-pdf";

export function downloadCsv(filename: string, headers: string[], rows: (string | number)[][]) {
  const csv = [
    headers.join(","),
    ...rows.map((row) =>
      row.map((cell) => `"${String(cell ?? "").replace(/"/g, '""')}"`).join(","),
    ),
  ].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  URL.revokeObjectURL(link.href);
}

export function downloadExcel(
  filename: string,
  sheetName: string,
  headers: string[],
  rows: (string | number)[][],
) {
  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  XLSX.writeFile(wb, filename);
}

/** Yield so React can paint loading UI before heavy export work. */
export function yieldForUi(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 40));
}

export interface BrandedPdfColumn {
  header: string;
  align?: "left" | "right";
  /** Relative width weight (default 1). */
  width?: number;
}

export interface BrandedReportSummaryItem {
  label: string;
  value: string;
}

export interface DownloadBrandedPdfOptions {
  filename: string;
  title: string;
  subtitle?: string;
  logoDataUri?: string;
  generatedAt?: Date | string;
  summary?: BrandedReportSummaryItem[];
  columns: BrandedPdfColumn[];
  rows: (string | number)[][];
  orientation?: "landscape" | "portrait";
  footerNote?: string;
}

/**
 * Builds a branded inventory PDF with jsPDF and triggers a file download
 * (does not open the browser print dialog).
 */
export async function downloadBrandedPdf(
  options: DownloadBrandedPdfOptions,
): Promise<void> {
  const {
    filename,
    title,
    subtitle = "",
    logoDataUri = "",
    generatedAt = new Date(),
    summary = [],
    columns,
    rows,
    orientation = "landscape",
    footerNote = "Pehnawa Boutique Pos · Confidential inventory report",
  } = options;

  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({
    unit: "mm",
    format: "a4",
    orientation,
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 12;
  const usableWidth = pageWidth - margin * 2;
  const bottomLimit = pageHeight - 14;

  const when =
    typeof generatedAt === "string"
      ? generatedAt
      : generatedAt.toLocaleString(undefined, {
          dateStyle: "medium",
          timeStyle: "short",
        });

  // ----- Header band -----
  const bandHeight = 26;
  doc.setFillColor(17, 24, 39);
  doc.rect(0, 0, pageWidth, bandHeight, "F");

  let textX = margin;
  if (logoDataUri) {
    try {
      const transparentLogo = await prepareLogoForPdf(logoDataUri);
      const img = await loadImage(transparentLogo);
      const aspect = img.naturalWidth / img.naturalHeight || 2.5;
      let imgH = 12;
      let imgW = imgH * aspect;
      if (imgW > 52) {
        imgW = 52;
        imgH = imgW / aspect;
      }
      doc.addImage(transparentLogo, "PNG", margin, (bandHeight - imgH) / 2, imgW, imgH);
      textX = margin + imgW + 4;
    } catch {
      // continue without logo
    }
  }

  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text("Pehnawa Boutique Pos", textX, 11);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(title, textX, 17);
  if (subtitle) {
    doc.setFontSize(7.5);
    doc.setTextColor(203, 213, 225);
    doc.text(subtitle, textX, 22);
  }

  doc.setTextColor(226, 232, 240);
  doc.setFontSize(7.5);
  doc.text(`Generated ${when}`, pageWidth - margin, 11, { align: "right" });
  doc.text(`${rows.length.toLocaleString()} records`, pageWidth - margin, 16.5, {
    align: "right",
  });

  let y = bandHeight + 8;

  // ----- Summary tiles (wrap into rows of up to 4) -----
  if (summary.length > 0) {
    const gap = 3;
    const cols = Math.min(4, Math.max(summary.length, 1));
    const boxW = (usableWidth - gap * (cols - 1)) / cols;
    const boxH = 16;
    const rowGap = 3;
    summary.forEach((item, i) => {
      const col = i % cols;
      if (col === 0 && i > 0) y += boxH + rowGap;
      const x = margin + col * (boxW + gap);
      doc.setDrawColor(226, 232, 240);
      doc.setFillColor(248, 250, 252);
      doc.roundedRect(x, y, boxW, boxH, 1.5, 1.5, "FD");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(6);
      doc.setTextColor(100, 116, 139);
      doc.text(item.label.toUpperCase(), x + 2.5, y + 5, { maxWidth: boxW - 5 });
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(15, 23, 42);
      const value = String(item.value);
      doc.text(value.length > 28 ? `${value.slice(0, 27)}…` : value, x + 2.5, y + 11.5, {
        maxWidth: boxW - 5,
      });
    });
    y += boxH + 8;
  }

  // ----- Table -----
  const totalWeight = columns.reduce((sum, c) => sum + (c.width ?? 1), 0);
  const colWidths = columns.map((c) => ((c.width ?? 1) / totalWeight) * usableWidth);
  const rowH = 6.2;
  const headerH = 7;

  const drawTableHeader = () => {
    doc.setFillColor(17, 24, 39);
    doc.rect(margin, y, usableWidth, headerH, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    doc.setTextColor(255, 255, 255);
    let x = margin;
    columns.forEach((col, i) => {
      const w = colWidths[i];
      const align = col.align === "right" ? "right" : "left";
      const tx = align === "right" ? x + w - 1.5 : x + 1.5;
      doc.text(col.header, tx, y + 4.6, {
        align,
        maxWidth: w - 3,
      });
      x += w;
    });
    y += headerH;
  };

  const ensureSpace = (needed: number) => {
    if (y + needed > bottomLimit) {
      doc.addPage();
      y = margin;
      drawTableHeader();
    }
  };

  drawTableHeader();

  rows.forEach((row, rowIndex) => {
    ensureSpace(rowH);
    if (rowIndex % 2 === 1) {
      doc.setFillColor(248, 250, 252);
      doc.rect(margin, y, usableWidth, rowH, "F");
    }
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(31, 41, 55);
    let x = margin;
    columns.forEach((col, i) => {
      const w = colWidths[i];
      const align = col.align === "right" ? "right" : "left";
      const tx = align === "right" ? x + w - 1.5 : x + 1.5;
      const cell = String(row[i] ?? "");
      doc.text(cell, tx, y + 4.2, {
        align,
        maxWidth: w - 3,
      });
      x += w;
    });
    y += rowH;
  });

  // ----- Footer on each page -----
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(107, 114, 128);
    doc.text(footerNote, margin, pageHeight - 7);
    doc.text(`Page ${i} of ${pageCount}`, pageWidth - margin, pageHeight - 7, {
      align: "right",
    });
  }

  const safeName = filename.endsWith(".pdf") ? filename : `${filename}.pdf`;
  doc.save(safeName);
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

/** @deprecated Use downloadBrandedPdf — print dialog was confusing users. */
export async function printBrandedReport(
  options: Omit<DownloadBrandedPdfOptions, "filename" | "columns" | "rows"> & {
    tableHtml?: string;
    filename?: string;
    columns?: BrandedPdfColumn[];
    rows?: (string | number)[][];
  },
): Promise<void> {
  if (options.columns && options.rows) {
    await downloadBrandedPdf({
      filename: options.filename || `${slugify(options.title)}.pdf`,
      title: options.title,
      subtitle: options.subtitle,
      logoDataUri: options.logoDataUri,
      generatedAt: options.generatedAt,
      summary: options.summary,
      columns: options.columns,
      rows: options.rows,
      footerNote: options.footerNote,
    });
    return;
  }
  throw new Error("downloadBrandedPdf requires columns and rows");
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "") || "report";
}

/** Kept for older call sites that still write HTML into a print window. */
export function printHtmlDocument(title: string, bodyHtml: string) {
  const win = window.open("", "_blank", "width=900,height=700");
  if (!win) return false;
  win.document.write(`<!DOCTYPE html><html><head><title>${title}</title>
    <style>
      body { font-family: Arial, sans-serif; padding: 24px; color: #111; }
      h1 { font-size: 18px; margin: 0 0 4px; }
      p.meta { color: #666; font-size: 12px; margin: 0 0 16px; }
      table { width: 100%; border-collapse: collapse; font-size: 11px; }
      th, td { border: 1px solid #ddd; padding: 6px 8px; text-align: left; }
      th { background: #f5f5f5; }
      .num { text-align: right; }
    </style></head><body>${bodyHtml}</body></html>`);
  win.document.close();
  win.focus();
  win.print();
  return true;
}

export function formatMoney(value: unknown) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}

export function formatQty(value: unknown) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "0";
  if (Number.isInteger(n)) return n.toLocaleString();
  return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

export function getStockRowImage(product: any): string | null {
  const url =
    product?.ProductImage?.[0]?.image ||
    product?.images?.[0]?.image ||
    product?.images?.[0];
  return url || null;
}

export function getProductBarcode(product: any) {
  return product?.barcode || product?.sku || product?.code || "—";
}
