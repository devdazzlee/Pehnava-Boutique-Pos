import { format } from "date-fns";

const GOLD: [number, number, number] = [166, 124, 46];
const INK: [number, number, number] = [42, 32, 18];
const MUTED: [number, number, number] = [120, 100, 72];
const CREAM: [number, number, number] = [252, 248, 242];
const LINE: [number, number, number] = [232, 220, 196];
const WHITE: [number, number, number] = [255, 255, 255];

interface PdfLine {
  date: string;
  voucher: string;
  type: string;
  customer: string;
  sku: string;
  item: string;
  unit: string;
  quantity: number;
  rate: number;
  amount: number;
}

interface PdfReport {
  lines: PdfLine[];
  totals: { quantity: number; amount: number; count: number };
}

const money = (value: number) =>
  Number(value || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

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

export async function downloadSalesReportPdf(
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

  const columns = [
    { label: "Date", weight: 0.9 },
    { label: "Voucher", weight: 1.1 },
    { label: "Type", weight: 0.5 },
    { label: "Customer", weight: 1.3 },
    { label: "SKU", weight: 1 },
    { label: "Item", weight: 1.8 },
    { label: "Unit", weight: 0.55 },
    { label: "Qty", weight: 0.7, right: true },
    { label: "Rate", weight: 0.8, right: true },
    { label: "Amount", weight: 0.95, right: true },
  ];
  const weightSum = columns.reduce((sum, column) => sum + column.weight, 0);
  const widths = columns.map((column) => (column.weight / weightSum) * usable);

  const drawFooter = () => {
    const pages = doc.getNumberOfPages();
    for (let page = 1; page <= pages; page += 1) {
      doc.setPage(page);
      doc.setDrawColor(...LINE);
      doc.line(margin, pageHeight - 10, pageWidth - margin, pageHeight - 10);
      doc.setFontSize(8);
      doc.setTextColor(...MUTED);
      doc.text("Pehnawa Boutique Pos  ·  Item-wise sales report", margin, pageHeight - 6);
      doc.text(`Page ${page} of ${pages}`, pageWidth - margin, pageHeight - 6, { align: "right" });
    }
  };

  const drawHeader = (continued: boolean) => {
    doc.setFillColor(...CREAM);
    doc.rect(0, 0, pageWidth, continued ? 18 : 30, "F");
    doc.setFillColor(...GOLD);
    doc.rect(0, continued ? 18 : 30, pageWidth, 1.2, "F");
    let textX = margin;
    if (logo) {
      const imgH = continued ? 10 : 15;
      const imgW = imgH * (330 / 67);
      doc.addImage(logo, "PNG", margin, continued ? 4 : 7, imgW, imgH);
      textX = margin + imgW + 8;
    }
    doc.setTextColor(...INK);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(continued ? 12 : 15);
    doc.text("Sales Report — Itemwise", textX, continued ? 11 : 15);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(...MUTED);
    doc.text(continued ? "Continued" : meta.filterLabel, textX, continued ? 15.5 : 21);
    doc.setTextColor(...INK);
    doc.text(period, pageWidth - margin, continued ? 11 : 15, { align: "right" });
    return continued ? 24 : 38;
  };

  const drawHead = (y: number) => {
    doc.setFillColor(...INK);
    doc.rect(margin, y, usable, 7, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(...WHITE);
    let x = margin;
    columns.forEach((column, index) => {
      const pad = column.right ? widths[index] - 1.5 : 1.5;
      doc.text(column.label, x + pad, y + 4.6, { align: column.right ? "right" : "left" });
      x += widths[index];
    });
    return y + 7;
  };

  let y = drawHead(drawHeader(false));
  report.lines.forEach((line, index) => {
    if (y > pageHeight - 22) {
      doc.addPage();
      y = drawHead(drawHeader(true));
    }
    if (index % 2 === 0) {
      doc.setFillColor(...CREAM);
      doc.rect(margin, y, usable, 6.5, "F");
    }
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...INK);
    const values = [
      format(new Date(line.date), "dd-MMM-yy"),
      line.voucher,
      line.type,
      line.customer,
      line.sku,
      line.item,
      line.unit,
      money(line.quantity),
      money(line.rate),
      money(line.amount),
    ];
    let x = margin;
    values.forEach((value, colIndex) => {
      const right = Boolean(columns[colIndex].right);
      const pad = right ? widths[colIndex] - 1.5 : 1.5;
      doc.text(clip(doc, value, widths[colIndex] - 3), x + pad, y + 4.4, { align: right ? "right" : "left" });
      x += widths[colIndex];
    });
    y += 6.5;
  });

  if (y > pageHeight - 22) {
    doc.addPage();
    y = drawHeader(true);
  }
  doc.setFillColor(...GOLD);
  doc.rect(margin, y, usable, 8, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(...WHITE);
  doc.text(`${report.totals.count} lines`, margin + 1.5, y + 5.2);
  doc.text(money(report.totals.quantity), margin + widths.slice(0, 8).reduce((sum, width) => sum + width, 0) - 1.5, y + 5.2, { align: "right" });
  doc.text(money(report.totals.amount), pageWidth - margin - 1.5, y + 5.2, { align: "right" });

  drawFooter();
  doc.save(`sales-report-${meta.from}-to-${meta.to}.pdf`);
}
