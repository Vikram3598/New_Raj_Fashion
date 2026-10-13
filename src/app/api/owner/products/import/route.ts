import { NextResponse } from "next/server";
import { ProductStatus } from "@prisma/client";
import { z } from "zod";
import { requireOwner } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { parseCsv } from "@/lib/csv";

const requiredHeaders = ["product_sku", "name", "slug", "description", "variant_sku", "variant_title", "price_rupees", "stock_on_hand"];
const optionalHeaders = ["category_id", "brand", "fabric", "material", "gender", "occasion", "care_instructions", "tags", "status", "mrp_rupees", "cost_rupees", "size", "colour", "barcode"];
const productSchema = z.object({
  sku: z.string().trim().min(2).max(64), name: z.string().trim().min(2).max(160), slug: z.string().trim().min(2).max(180).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/), description: z.string().trim().min(1).max(10000),
  categoryId: z.string().trim().max(64).nullable(), brand: z.string().trim().max(120).nullable(), fabric: z.string().trim().max(120).nullable(), material: z.string().trim().max(120).nullable(), gender: z.string().trim().max(80).nullable(), occasion: z.string().trim().max(120).nullable(), careInstructions: z.string().trim().max(2000).nullable(), tags: z.array(z.string().trim().min(1).max(40)).max(30), status: z.nativeEnum(ProductStatus),
  variants: z.array(z.object({ sku: z.string().trim().min(2).max(64), title: z.string().trim().min(1).max(100), priceRupees: z.number().positive().max(10000000), mrpRupees: z.number().positive().max(10000000).nullable(), costRupees: z.number().positive().max(10000000).nullable(), stockOnHand: z.number().int().min(0).max(100000), size: z.string().trim().max(40).nullable(), colour: z.string().trim().max(60).nullable(), barcode: z.string().trim().max(100).nullable() })).min(1).max(100),
});

function nullable(value: string | undefined) { return value?.trim() || null; }

export async function POST(request: Request) {
  let actor;
  try { actor = await requireOwner(); } catch { return NextResponse.json({ error: "Owner access is required." }, { status: 403 }); }
  let file: FormDataEntryValue | null;
  try { file = (await request.formData()).get("file"); } catch { return NextResponse.json({ error: "Upload a CSV file." }, { status: 400 }); }
  if (!(file instanceof File) || !file.name.toLowerCase().endsWith(".csv") || file.size < 1 || file.size > 5 * 1024 * 1024) return NextResponse.json({ error: "Choose a CSV file up to 5 MB." }, { status: 400 });
  let rows: string[][];
  try { rows = parseCsv(await file.text()); } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "CSV could not be read." }, { status: 400 }); }
  if (rows.length < 2 || rows.length > 2001) return NextResponse.json({ error: "CSV must have a header and between 1 and 2,000 variant rows." }, { status: 400 });
  const headers = rows[0].map((header) => header.trim().toLowerCase());
  if (new Set(headers).size !== headers.length || requiredHeaders.some((header) => !headers.includes(header)) || headers.some((header) => ![...requiredHeaders, ...optionalHeaders].includes(header))) return NextResponse.json({ error: "CSV headers are missing, duplicated or unsupported. Download the product export to get the current format." }, { status: 400 });
  const index = new Map(headers.map((header, position) => [header, position]));
  const grouped = new Map<string, Record<string, unknown> & { variants: Record<string, unknown>[] }>();
  const variantSkus = new Set<string>();
  for (let line = 1; line < rows.length; line++) {
    const row = rows[line];
    if (row.length !== headers.length) return NextResponse.json({ error: `Row ${line + 1} has ${row.length} fields; expected ${headers.length}.` }, { status: 400 });
    const get = (key: string) => row[index.get(key)!]?.trim() ?? "";
    const productSku = get("product_sku");
    const price = Number(get("price_rupees"));
    const mrp = get("mrp_rupees");
    const cost = get("cost_rupees");
    const stock = Number(get("stock_on_hand"));
    const status = (get("status") || "DRAFT").toUpperCase();
    const key = productSku.toUpperCase();
    const productFields = {
      sku: productSku, name: get("name"), slug: get("slug"), description: get("description"), categoryId: nullable(get("category_id")),
      brand: nullable(get("brand")), fabric: nullable(get("fabric")), material: nullable(get("material")), gender: nullable(get("gender")), occasion: nullable(get("occasion")), careInstructions: nullable(get("care_instructions")),
      tags: get("tags") ? get("tags").split(";").map((tag) => tag.trim()).filter(Boolean) : [], status, variants: [],
    };
    let product = grouped.get(key);
    if (product) {
      const fields = ["sku", "name", "slug", "description", "categoryId", "brand", "fabric", "material", "gender", "occasion", "careInstructions", "tags", "status"];
      if (fields.some((field) => JSON.stringify(product![field]) !== JSON.stringify(productFields[field as keyof typeof productFields]))) return NextResponse.json({ error: `Product details for SKU ${productSku} differ between rows.` }, { status: 400 });
    } else {
      product = { ...productFields, variants: [] };
      grouped.set(key, product);
    }
    const variantSku = get("variant_sku");
    if (variantSkus.has(variantSku.toUpperCase())) return NextResponse.json({ error: `Variant SKU ${variantSku} is repeated in this file.` }, { status: 400 });
    variantSkus.add(variantSku.toUpperCase());
    product.variants.push({ sku: variantSku, title: get("variant_title"), priceRupees: price, mrpRupees: mrp ? Number(mrp) : null, costRupees: cost ? Number(cost) : null, stockOnHand: stock, size: nullable(get("size")), colour: nullable(get("colour")), barcode: nullable(get("barcode")) });
  }
  if (grouped.size > 250) return NextResponse.json({ error: "Import up to 250 products at a time." }, { status: 400 });
  const validated = [...grouped.values()].map((product) => productSchema.safeParse(product));
  const invalidIndex = validated.findIndex((entry) => !entry.success);
  if (invalidIndex >= 0) return NextResponse.json({ error: `Product ${[...grouped.keys()][invalidIndex]} has invalid product or variant fields.` }, { status: 400 });
  const products = validated.map((entry) => (entry as { success: true; data: z.infer<typeof productSchema> }).data);
  const existing = await prisma.product.findMany({ where: { OR: [{ sku: { in: products.map((product) => product.sku) } }, { slug: { in: products.map((product) => product.slug) } }] }, select: { sku: true, slug: true } });
  if (existing.length) return NextResponse.json({ error: `Product ${existing[0].sku} already exists. Import creates new products only; edit existing products in the catalogue.` }, { status: 409 });
  const allVariantSkus = products.flatMap((product) => product.variants.map((variant) => variant.sku));
  const existingVariant = await prisma.productVariant.findFirst({ where: { sku: { in: allVariantSkus } }, select: { sku: true } });
  if (existingVariant) return NextResponse.json({ error: `Variant SKU ${existingVariant.sku} already exists.` }, { status: 409 });
  const categoryIds = [...new Set(products.map((product) => product.categoryId).filter((id): id is string => Boolean(id)))];
  if (categoryIds.length) {
    const found = await prisma.category.findMany({ where: { id: { in: categoryIds } }, select: { id: true } });
    if (found.length !== categoryIds.length) return NextResponse.json({ error: "One or more category IDs do not exist. Use category_id values from the catalogue." }, { status: 400 });
  }
  try {
    await prisma.$transaction(async (tx) => {
      for (const product of products) {
        const created = await tx.product.create({ data: {
          sku: product.sku, name: product.name, slug: product.slug, description: product.description, categoryId: product.categoryId, brand: product.brand, fabric: product.fabric, material: product.material, gender: product.gender, occasion: product.occasion, careInstructions: product.careInstructions, tags: product.tags, status: product.status,
          variants: { create: product.variants.map((variant) => ({ sku: variant.sku, title: variant.title, pricePaise: Math.round(variant.priceRupees * 100), mrpPaise: variant.mrpRupees == null ? null : Math.round(variant.mrpRupees * 100), costPaise: variant.costRupees == null ? null : Math.round(variant.costRupees * 100), stockOnHand: variant.stockOnHand, size: variant.size, colour: variant.colour, barcode: variant.barcode })) },
        }, include: { variants: true } });
        for (const variant of created.variants) if (variant.stockOnHand > 0) await tx.inventoryMovement.create({ data: { variantId: variant.id, deltaOnHand: variant.stockOnHand, reason: "csv_initial_stock", reference: created.id, actorId: actor.id } });
        await tx.productChange.create({ data: { productId: created.id, actorId: actor.id, summary: "Product imported from CSV", payload: { sku: created.sku, name: created.name, status: created.status } } });
      }
      await tx.auditLog.create({ data: { actorId: actor.id, action: "product.csv.import", entityType: "Product", metadata: { products: products.length, variants: allVariantSkus.length } } });
    });
    return NextResponse.json({ ok: true, products: products.length, variants: allVariantSkus.length }, { status: 201 });
  } catch { return NextResponse.json({ error: "CSV import failed. No products were imported." }, { status: 400 }); }
}
