import { Buffer } from "node:buffer";

export type InvoiceSnapshot = {
  invoiceNo: string;
  issuedAt: string;
  footer?: string | null;
  store: { name: string; legalName?: string | null; address: string; city: string; state: string; postalCode: string; phone?: string | null; email?: string | null; gstin?: string | null };
  order: { orderNumber: string; recipient: string; address: string; payment: string; currency: string; subtotalPaise: number; discountPaise: number; shippingPaise: number; taxPaise: number; totalPaise: number };
  items: { name: string; sku: string; variant: string; quantity: number; unitPricePaise: number; taxPaise: number; discountPaise: number; totalPaise: number }[];
};

function ascii(value: string) {
  return value.replaceAll("₹", "INR ").normalize("NFKD").replace(/[^\x20-\x7e]/g, "?");
}

function escapePdf(value: string) {
  return ascii(value).replaceAll("\\", "\\\\").replaceAll("(", "\\(").replaceAll(")", "\\)");
}

function rupees(paise: number) {
  return `INR ${(paise / 100).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function wrap(text: string, max = 92): string[] {
  const words = ascii(text).split(/\s+/);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    if (line && `${line} ${word}`.length > max) { lines.push(line); line = word; }
    else line = line ? `${line} ${word}` : word;
  }
  if (line) lines.push(line);
  return lines;
}

export function createInvoicePdf(snapshot: InvoiceSnapshot) {
  const storeLines = [snapshot.store.legalName, snapshot.store.address, `${snapshot.store.city}, ${snapshot.store.state} ${snapshot.store.postalCode}`, snapshot.store.phone, snapshot.store.email, snapshot.store.gstin ? `GSTIN: ${snapshot.store.gstin}` : null].filter(Boolean) as string[];
  const address = snapshot.order.address.split("\n").filter(Boolean);
  const lines = [
    snapshot.store.name,
    ...storeLines,
    "",
    `TAX INVOICE  ${snapshot.invoiceNo}`,
    `Order: ${snapshot.order.orderNumber}    Issued: ${new Date(snapshot.issuedAt).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata" })}`,
    `Bill to: ${snapshot.order.recipient}`,
    ...address,
    `Payment: ${snapshot.order.payment}`,
    "",
    "Item / variant | SKU | Qty | Unit price | Tax | Total",
    ...snapshot.items.flatMap((item) => wrap(`${item.name} / ${item.variant} | ${item.sku} | ${item.quantity} | ${rupees(item.unitPricePaise)} | ${rupees(item.taxPaise)} | ${rupees(item.totalPaise)}`)),
    "",
    `Subtotal: ${rupees(snapshot.order.subtotalPaise)}`,
    `Discount: -${rupees(snapshot.order.discountPaise)}`,
    `Delivery: ${rupees(snapshot.order.shippingPaise)}`,
    `Tax: ${rupees(snapshot.order.taxPaise)}`,
    `Total: ${rupees(snapshot.order.totalPaise)}`,
    "",
    snapshot.footer || "Thank you for shopping with us.",
  ].flatMap((line) => wrap(line));
  const pages: string[][] = [];
  for (let i = 0; i < lines.length; i += 48) pages.push(lines.slice(i, i + 48));
  const objects: string[] = [];
  objects[1] = "<< /Type /Catalog /Pages 2 0 R >>";
  objects[2] = `<< /Type /Pages /Kids [${pages.map((_, index) => `${4 + index * 2} 0 R`).join(" ")}] /Count ${pages.length} >>`;
  objects[3] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>";
  pages.forEach((page, index) => {
    const pageId = 4 + index * 2;
    const contentId = pageId + 1;
    const commands = ["BT", "/F1 10 Tf", "14 TL", "50 750 Td", ...page.map((line, lineIndex) => `${lineIndex ? "T* " : ""}(${escapePdf(line)}) Tj`), "ET"].join("\n");
    objects[pageId] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ${contentId} 0 R >>`;
    objects[contentId] = `<< /Length ${Buffer.byteLength(commands, "ascii")} >>\nstream\n${commands}\nendstream`;
  });
  const chunks: Buffer[] = [Buffer.from("%PDF-1.4\n", "ascii")];
  const offsets: number[] = [0];
  let length = chunks[0].length;
  for (let id = 1; id < objects.length; id++) {
    const object = Buffer.from(`${id} 0 obj\n${objects[id]}\nendobj\n`, "ascii");
    offsets[id] = length; length += object.length; chunks.push(object);
  }
  const xrefOffset = length;
  const xref = [`xref\n0 ${objects.length}\n`, "0000000000 65535 f \n", ...offsets.slice(1).map((offset) => `${offset.toString().padStart(10, "0")} 00000 n \n`)].join("");
  const trailer = `trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  chunks.push(Buffer.from(`${xref}${trailer}`, "ascii"));
  return Buffer.concat(chunks);
}
