import { NextResponse } from "next/server";
import { requireOwner } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { csvDocument } from "@/lib/csv";

export async function GET() {
  try { await requireOwner(); } catch { return NextResponse.json({ error: "Owner access is required." }, { status: 403 }); }
  const products = await prisma.product.findMany({ orderBy: { sku: "asc" }, include: { variants: { orderBy: { sku: "asc" } } } });
  const headers = ["product_sku", "name", "slug", "description", "category_id", "brand", "fabric", "material", "gender", "occasion", "care_instructions", "tags", "status", "variant_sku", "variant_title", "price_rupees", "mrp_rupees", "cost_rupees", "stock_on_hand", "size", "colour", "barcode"];
  const rows = products.flatMap((product) => product.variants.map((variant) => [product.sku, product.name, product.slug, product.description, product.categoryId, product.brand, product.fabric, product.material, product.gender, product.occasion, product.careInstructions, product.tags.join(";"), product.status, variant.sku, variant.title, (variant.pricePaise / 100).toFixed(2), variant.mrpPaise == null ? "" : (variant.mrpPaise / 100).toFixed(2), variant.costPaise == null ? "" : (variant.costPaise / 100).toFixed(2), variant.stockOnHand, variant.size, variant.colour, variant.barcode]));
  const csv = `\uFEFF${csvDocument(headers, rows)}`;
  return new Response(csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": "attachment; filename=raj-fashion-products.csv", "Cache-Control": "private, no-store" } });
}
