import { format } from "date-fns";

const GOLD: [number, number, number] = [166, 124, 46];
const INK: [number, number, number] = [42, 32, 18];
const MUTED: [number, number, number] = [120, 100, 72];
const CREAM: [number, number, number] = [252, 248, 242];
const LINE: [number, number, number] = [232, 220, 196];
const WHITE: [number, number, number] = [255, 255, 255];

interface PdfLine {
  sku: string;
  item: string;
  unit: string;
  opening: number;
  boughtQty: number;
  soldQty: number;
  closing: number;
  availableQty: number;
}

interface PdfReport {
  lines: PdfLine[];
  totals: {
    count: number;
    opening: number;
    boughtQty: number;
    soldQty: number;
    closing: number;
    availableQty: number;
  };
}

const qty = (value: number) =>
  Number(value || 0).toLocaleString("en-US", { maximumFractionDigits: 2 });

const loadLogo = async () => {
  const res = await fetch("/logo.png");
  if (!res.ok) return "";
  const blob = await res.blob();
  return await new Promise<string>((resolve) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(typeof reader.result === "string" ? reader.result : "");
    reader.onerror = () => resolve("");
    reader.readAsDataURL(blob);
  });
};

const clip = (doc: { getTextWidth: (text: string) => number }, text: string, maxW: number) => {
  let value = text || "—";
  if (doc.getTextWidth(value) <= maxW) return value;
  while (value.length > 1 && doc.getTextWidth(`${value}…`) > maxW) value = value.slice(0, -1);
  return `${value}…`;
};

export async function downloadStockQuantityReportPdf(
  report: PdfReport,
  meta: { from: string; to: string; filterLabel: string },
) {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "landscape" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 12;
  const usable = pageWidth - margin * 2;
  const logo = await loadLogo();
  const period = `${format(new Date(`${meta.from}T00:00:00`), "dd MMM yyyy")} – ${format(new Date(`${meta.to}T00:00:00`), "dd MMM yyyy")}`;

  const cols = [
    { label: "SKU", width: 28, align: "left" as const },
    { label: "Dress Name", width: 70, align: "left" as const },
    { label: "Unit", width: 18, align: "left" as const },
    { label: "Opening", width: 24, align: "right" as const },
    { label: "Bought", width: 24, align: "right" as const },
    { label: "Sold", width: 24, align: "right" as const },
    { label: "Closing", width: 24, align: "right" as const },
    { label: "Available", width: usable - 28 - 70 - 18 - 24 - 24 - 24 - 24, align: "right" as const },
  ];

  const drawFooter = () => {
    const pages = doc.getNumberOfPages();
    for (let page = 1; page <= pages; page += 1) {
      doc.setPage(page);
      doc.setDrawColor(...LINE);
      doc.line(margin, pageHeight - 10, pageWidth - margin, pageHeight - 10);
      doc.setFontSize(8);
      doc.setTextColor(...MUTED);
      doc.text("Pehnawa Boutique Pos  ·  Stock quantity report", margin, pageHeight - 6);
      doc.text(`Page ${page} of ${pages}`, pageWidth - margin, pageHeight - 6, { align: "right" });
    }
  };

  const drawHeader = (continued: boolean) => {
    doc.setFillColor(...CREAM);
    doc.rect(0, 0, pageWidth, continued ? 18 : 32, "F");
    doc.setFillColor(...GOLD);
    doc.rect(0, continued ? 18 : 32, pageWidth, 1.2, "F");
    if (logo) {
      const logoH = continued ? 10 : 14;
      const logoW = logoH * (330 / 67);
      doc.addImage(logo, "PNG", margin, continued ? 4 : 8, logoW, logoH);
    }
    const textX = logo ? margin + (continued ? 56 : 76) : margin;
    doc.setTextColor(...INK);
    doc.setFont("times", "bold");
    doc.setFontSize(continued ? 12 : 18);
    doc.text("Stock Quantity Report", textX, continued ? 12 : 16);
    if (!continued) {
      doc.setFont("times", "normal");
      doc.setFontSize(10);
      doc.setTextColor(...MUTED);
      doc.text(`${period}  ·  ${meta.filterLabel}`, textX, 24);
    }
  };

  const drawHeadRow = (y: number) => {
    doc.setFillColor(...INK);
    doc.rect(margin, y, usable, 8, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(...WHITE);
    let x = margin;
    cols.forEach((col) => {
      const pad = col.align === "right" ? col.width - 2 : 2;
      doc.text(col.label, x + pad, y + 5.4, { align: col.align });
      x += col.width;
    });
    return y + 8;
  };

  drawHeader(false);
  let y = drawHeadRow(38);

  report.lines.forEach((line, index) => {
    if (y > pageHeight - 22) {
      doc.addPage();
      drawHeader(true);
      y = drawHeadRow(24);
    }
    if (index % 2 === 0) {
      doc.setFillColor(252, 248, 242);
      doc.rect(margin, y, usable, 7, "F");
    }
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...INK);
    const values = [
      line.sku,
      line.item,
      line.unit,
      qty(line.opening),
      qty(line.boughtQty),
      qty(line.soldQty),
      qty(line.closing),
      qty(line.availableQty),
    ];
    let x = margin;
    values.forEach((value, colIndex) => {
      const col = cols[colIndex];
      const pad = col.align === "right" ? col.width - 2 : 2;
      doc.text(clip(doc, value, col.width - 4), x + pad, y + 4.8, { align: col.align });
      x += col.width;
    });
    y += 7;
  });

  if (y > pageHeight - 22) {
    doc.addPage();
    drawHeader(true);
    y = 24;
  }
  doc.setFillColor(...GOLD);
  doc.rect(margin, y, usable, 8, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(...WHITE);
  const totals = [
    `${report.totals.count} dresses`,
    "",
    "",
    qty(report.totals.opening),
    qty(report.totals.boughtQty),
    qty(report.totals.soldQty),
    qty(report.totals.closing),
    qty(report.totals.availableQty),
  ];
  let x = margin;
  totals.forEach((value, colIndex) => {
    const col = cols[colIndex];
    const pad = col.align === "right" ? col.width - 2 : 2;
    doc.text(value, x + pad, y + 5.4, { align: col.align });
    x += col.width;
  });

  drawFooter();
  doc.save(`stock-quantity-report-${meta.from}-to-${meta.to}.pdf`);
}
