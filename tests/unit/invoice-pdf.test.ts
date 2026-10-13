import { describe, expect, it } from "vitest";
import { createInvoicePdf, type InvoiceSnapshot } from "@/lib/account/invoice-pdf";

const snapshot: InvoiceSnapshot = {
  invoiceNo: "INV-NRF26ABC123",
  issuedAt: "2026-10-13T12:00:00.000Z",
  footer: "Thank you for shopping locally.",
  store: { name: "New Raj Fashion", address: "Gandhi Chowk", city: "Sidhi", state: "Madhya Pradesh", postalCode: "486661" },
  order: { orderNumber: "NRF26ABC123", recipient: "Asha Customer", address: "Gandhi Chowk\nSidhi, Madhya Pradesh 486661", payment: "RAZORPAY / PAID", currency: "INR", subtotalPaise: 12500, discountPaise: 500, shippingPaise: 0, taxPaise: 600, totalPaise: 12600 },
  items: [{ name: "Banarasi Saree", sku: "SAR-01", variant: "Red · Free size", quantity: 1, unitPricePaise: 12500, taxPaise: 600, discountPaise: 500, totalPaise: 12600 }],
};

describe("invoice PDF generation", () => {
  it("creates a private-download PDF with correct xref and configured invoice data", () => {
    const pdf = createInvoicePdf(snapshot);
    const source = pdf.toString("ascii");
    expect(source.startsWith("%PDF-1.4")).toBe(true);
    expect(source).toContain("INV-NRF26ABC123");
    expect(source).toContain("Thank you for shopping locally.");
    const xrefOffset = Number(source.match(/startxref\n(\d+)/)?.[1]);
    expect(source.slice(xrefOffset, xrefOffset + 5)).toBe("xref\n");
    expect(source.endsWith("%%EOF")).toBe(true);
  });
});
