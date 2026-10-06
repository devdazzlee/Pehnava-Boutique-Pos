/**
 * Stock In (GRN) receipt PDF — clean invoice layout (not the dark report template).
 * Also punches white backgrounds out of the logo so it sits cleanly on the page.
 */

export type StockInReceiptLine = {
  name: string;
  sku?: string;
  qty: number;
  cost: number;
  total: number;
};

export type StockInReceiptData = {
  reference: string;
  status: string;
  supplier: string;
  branch: string;
  dateLabel: string;
  recordedBy: string;
  source?: string;
  payment?: string;
  batchNo?: string;
  expiryDate?: string;
  notes?: string;
  lines: StockInReceiptLine[];
  billQty: number;
  billTotal: number;
  logoDataUri?: string;
};

function formatMoney(n: number) {
  return Number(n || 0).toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}

function formatQty(n: number) {
  return Number(n || 0).toLocaleString(undefined, {
    maximumFractionDigits: 3,
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

/** Convert near-white pixels to transparent so logo works on any header. */
async function logoWithTransparentBg(dataUri: string): Promise<string> {
  try {
    const img = await loadImage(dataUri);
    const canvas = document.createElement("canvas");
    canvas.width = img.naturalWidth || img.width;
    canvas.height = img.naturalHeight || img.height;
    const ctx = canvas.getContext("2d");
    if (!ctx || !canvas.width || !canvas.height) return dataUri;
    ctx.drawImage(img, 0, 0);
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const d = imageData.data;
    for (let i = 0; i < d.length; i += 4) {
      const r = d[i];
      const g = d[i + 1];
      const b = d[i + 2];
      // Treat near-white / light gray as background
      if (r > 235 && g > 235 && b > 235) {
        d[i + 3] = 0;
      }
    }
    ctx.putImageData(imageData, 0, 0);
    return canvas.toDataURL("image/png");
  } catch {
    return dataUri;
  }
}

export async function downloadStockInReceiptPdf(
  data: StockInReceiptData,
  filename?: string,
): Promise<void> {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });

  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 16;
  const usable = pageW - margin * 2;
  let y = margin;

  // Accent bar
  doc.setFillColor(15, 23, 42);
  doc.rect(0, 0, pageW, 3, "F");

  // Logo (transparent bg)
  if (data.logoDataUri) {
    try {
      const logo = await logoWithTransparentBg(data.logoDataUri);
      const img = await loadImage(logo);
      const aspect = img.naturalWidth / img.naturalHeight || 1.6;
      let imgH = 18;
      let imgW = imgH * aspect;
      if (imgW > 48) {
        imgW = 48;
        imgH = imgW / aspect;
      }
      doc.addImage(logo, "PNG", margin, y, imgW, imgH);
      // Brand text to the right of logo
      const tx = margin + imgW + 5;
      doc.setTextColor(15, 23, 42);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(14);
      doc.text("Pehnawa Boutique", tx, y + 7);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.setTextColor(71, 85, 105);
      doc.text("Stock In Receipt (GRN)", tx, y + 13);
      y += Math.max(imgH, 16) + 6;
    } catch {
      doc.setTextColor(15, 23, 42);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(14);
      doc.text("Pehnawa Boutique", margin, y + 6);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.setTextColor(71, 85, 105);
      doc.text("Stock In Receipt (GRN)", margin, y + 12);
      y += 18;
    }
  } else {
    doc.setTextColor(15, 23, 42);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.text("Pehnawa Boutique", margin, y + 6);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(71, 85, 105);
    doc.text("Stock In Receipt (GRN)", margin, y + 12);
    y += 18;
  }

  // Title + reference
  doc.setDrawColor(226, 232, 240);
  doc.setLineWidth(0.4);
  doc.line(margin, y, pageW - margin, y);
  y += 8;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(15, 23, 42);
  doc.text("SUPPLIER DELIVERY RECEIPT", margin, y);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(100, 116, 139);
  doc.text(data.reference, pageW - margin, y, { align: "right" });
  y += 8;

  // Meta grid — two columns of label/value (no cramped tiles)
  const meta: [string, string][] = [
    ["Reference", data.reference],
    ["Status", data.status],
    ["Supplier", data.supplier],
    ["Branch", data.branch],
    ["Date", data.dateLabel],
    ["Recorded by", data.recordedBy],
  ];
  if (data.source) meta.push(["Source", data.source]);
  if (data.payment) meta.push(["Payment", data.payment]);
  if (data.batchNo) meta.push(["Batch", data.batchNo]);
  if (data.expiryDate) meta.push(["Expiry", data.expiryDate]);

  const colW = usable / 2;
  const rowH = 7;
  doc.setFillColor(248, 250, 252);
  const metaRows = Math.ceil(meta.length / 2);
  doc.roundedRect(margin, y, usable, metaRows * rowH + 4, 2, 2, "F");
  y += 5;

  meta.forEach(([label, value], i) => {
    const col = i % 2;
    const row = Math.floor(i / 2);
    const x = margin + 3 + col * colW;
    const yy = y + row * rowH;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(100, 116, 139);
    doc.text(label.toUpperCase(), x, yy);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.5);
    doc.setTextColor(15, 23, 42);
    const v = value.length > 36 ? `${value.slice(0, 35)}…` : value;
    doc.text(v, x, yy + 3.8);
  });
  y += metaRows * rowH + 8;

  // Items table
  const cols = [
    { h: "#", w: usable * 0.06, align: "left" as const },
    { h: "Product", w: usable * 0.38, align: "left" as const },
    { h: "SKU", w: usable * 0.2, align: "left" as const },
    { h: "Qty", w: usable * 0.1, align: "right" as const },
    { h: "Cost", w: usable * 0.12, align: "right" as const },
    { h: "Total", w: usable * 0.14, align: "right" as const },
  ];

  const drawHeader = () => {
    doc.setFillColor(15, 23, 42);
    doc.rect(margin, y, usable, 8, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(255, 255, 255);
    let x = margin;
    cols.forEach((c) => {
      const tx = c.align === "right" ? x + c.w - 2 : x + 2;
      doc.text(c.h, tx, y + 5.2, { align: c.align });
      x += c.w;
    });
    y += 8;
  };

  drawHeader();

  data.lines.forEach((line, idx) => {
    if (y > pageH - 40) {
      doc.addPage();
      y = margin;
      drawHeader();
    }
    if (idx % 2 === 1) {
      doc.setFillColor(248, 250, 252);
      doc.rect(margin, y, usable, 7.5, "F");
    }
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(30, 41, 59);
    const cells = [
      String(idx + 1),
      line.name,
      line.sku || "—",
      formatQty(line.qty),
      formatMoney(line.cost),
      formatMoney(line.total),
    ];
    let x = margin;
    cols.forEach((c, i) => {
      const tx = c.align === "right" ? x + c.w - 2 : x + 2;
      const text = cells[i];
      const clipped =
        c.h === "Product" && text.length > 32
          ? `${text.slice(0, 31)}…`
          : c.h === "SKU" && text.length > 18
            ? `${text.slice(0, 17)}…`
            : text;
      doc.text(clipped, tx, y + 5, { align: c.align, maxWidth: c.w - 3 });
      x += c.w;
    });
    y += 7.5;
  });

  // Totals
  y += 4;
  doc.setDrawColor(226, 232, 240);
  doc.line(margin, y, pageW - margin, y);
  y += 8;

  const totalsX = pageW - margin - 70;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(100, 116, 139);
  doc.text("Total quantity", totalsX, y);
  doc.setTextColor(15, 23, 42);
  doc.text(formatQty(data.billQty), pageW - margin, y, { align: "right" });
  y += 6;

  doc.setFillColor(15, 23, 42);
  doc.roundedRect(totalsX - 4, y - 4, 74, 12, 1.5, 1.5, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(255, 255, 255);
  doc.text("Bill total", totalsX, y + 3.5);
  doc.text(`Rs ${formatMoney(data.billTotal)}`, pageW - margin - 2, y + 3.5, {
    align: "right",
  });
  y += 16;

  if (data.notes) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    doc.text("NOTES", margin, y);
    y += 4;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(51, 65, 85);
    const noteLines = doc.splitTextToSize(data.notes, usable);
    doc.text(noteLines, margin, y);
    y += noteLines.length * 4 + 4;
  }

  // Footer
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(148, 163, 184);
  doc.text(
    "Pehnawa Boutique Pos · Stock In receipt · For internal records",
    margin,
    pageH - 10,
  );
  doc.text(`Generated ${new Date().toLocaleString()}`, pageW - margin, pageH - 10, {
    align: "right",
  });

  const safe =
    filename ||
    `stock-in-receipt-${data.reference.replace(/[^\w.-]+/g, "_")}.pdf`;
  doc.save(safe.endsWith(".pdf") ? safe : `${safe}.pdf`);
}

/** Shared helper for other PDF exports that use a dark header. */
export async function prepareLogoForPdf(logoDataUri: string): Promise<string> {
  if (!logoDataUri) return "";
  return logoWithTransparentBg(logoDataUri);
}
