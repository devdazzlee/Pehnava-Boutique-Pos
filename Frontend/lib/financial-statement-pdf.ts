import { format } from "date-fns";

const GOLD: [number, number, number] = [166, 124, 46];
const INK: [number, number, number] = [42, 32, 18];
const MUTED: [number, number, number] = [120, 100, 72];
const CREAM: [number, number, number] = [252, 248, 242];
const LINE: [number, number, number] = [232, 220, 196];
const WHITE: [number, number, number] = [255, 255, 255];

interface StatementLine {
  label: string;
  amount: number;
  section: string;
  emphasis?: boolean;
}

interface StatementReport {
  lines: StatementLine[];
  income: { netRevenue: number; billCount: number };
  grossProfit: number;
  netProfit: number;
  marginPercent: number;
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

export async function downloadFinancialStatementPdf(
  report: StatementReport,
  meta: { from: string; to: string; branchLabel: string },
) {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 14;
  const usable = pageWidth - margin * 2;
  const logo = await loadLogo();
  const period = `${format(new Date(`${meta.from}T00:00:00`), "dd MMM yyyy")} – ${format(new Date(`${meta.to}T00:00:00`), "dd MMM yyyy")}`;

  doc.setFillColor(...CREAM);
  doc.rect(0, 0, pageWidth, 32, "F");
  doc.setFillColor(...GOLD);
  doc.rect(0, 32, pageWidth, 1.2, "F");
  if (logo) {
    const imgH = 14;
    const imgW = imgH * (330 / 67);
    doc.addImage(logo, "PNG", margin, 8, imgW, imgH);
  }
  doc.setTextColor(...INK);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text("Financial Statement", logo ? margin + 70 : margin, 16);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...MUTED);
  doc.text(`${period}  ·  ${meta.branchLabel}`, logo ? margin + 70 : margin, 23);

  let y = 42;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(...INK);
  doc.text("Particulars", margin, y);
  doc.text("Amount (PKR)", pageWidth - margin, y, { align: "right" });
  y += 3;
  doc.setDrawColor(...LINE);
  doc.line(margin, y, pageWidth - margin, y);
  y += 6;

  report.lines.forEach((line) => {
    if (y > pageHeight - 20) {
      doc.addPage();
      y = 20;
    }
    if (line.emphasis) {
      doc.setFillColor(...CREAM);
      doc.rect(margin, y - 4, usable, 8, "F");
      doc.setFont("helvetica", "bold");
    } else {
      doc.setFont("helvetica", "normal");
    }
    doc.setFontSize(10);
    doc.setTextColor(...INK);
    doc.text(line.label, margin + 2, y);
    doc.text(money(line.amount), pageWidth - margin - 2, y, { align: "right" });
    y += 8;
  });

  y += 4;
  doc.setFillColor(...GOLD);
  doc.rect(margin, y, usable, 12, "F");
  doc.setTextColor(...WHITE);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text(`Net profit  ·  Margin ${money(report.marginPercent)}%`, margin + 3, y + 7.5);
  doc.text(money(report.netProfit), pageWidth - margin - 3, y + 7.5, { align: "right" });

  doc.setDrawColor(...LINE);
  doc.line(margin, pageHeight - 12, pageWidth - margin, pageHeight - 12);
  doc.setFontSize(8);
  doc.setTextColor(...MUTED);
  doc.text("Pehnawa Boutique Pos  ·  Financial statement", margin, pageHeight - 7);
  doc.text("Page 1", pageWidth - margin, pageHeight - 7, { align: "right" });

  doc.save(`financial-statement-${meta.from}-to-${meta.to}.pdf`);
}
