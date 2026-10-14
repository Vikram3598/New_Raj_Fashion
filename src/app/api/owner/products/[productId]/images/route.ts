import { DeleteObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import sharp from "sharp";
import { z } from "zod";
import { requireOwner } from "@/lib/auth/session";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";
const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
const allowedContentTypes = new Set(["image/jpeg", "image/png", "image/webp", "image/avif"]);

function storage() {
  const bucket = process.env.S3_BUCKET;
  if (!bucket) throw new Error("S3_BUCKET is not configured.");
  const accessKeyId = process.env.S3_ACCESS_KEY;
  const secretAccessKey = process.env.S3_SECRET_KEY;
  const client = new S3Client({
    region: process.env.S3_REGION || "ap-south-1",
    endpoint: process.env.S3_ENDPOINT || undefined,
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE === "true",
    ...(accessKeyId && secretAccessKey ? { credentials: { accessKeyId, secretAccessKey } } : {}),
  });
  return { client, bucket };
}

function publicUrl(key: string) {
  const base = process.env.S3_PUBLIC_URL?.replace(/\/+$/, "");
  const encodedKey = key.split("/").map(encodeURIComponent).join("/");
  if (base) return `${base}/${encodedKey}`;
  const endpoint = process.env.S3_ENDPOINT?.replace(/\/+$/, "");
  if (endpoint) return `${endpoint}/${encodeURIComponent(process.env.S3_BUCKET!)}/${encodedKey}`;
  const region = process.env.S3_REGION || "ap-south-1";
  return `https://${process.env.S3_BUCKET}.s3.${region}.amazonaws.com/${encodedKey}`;
}

export async function POST(request: Request, { params }: { params: Promise<{ productId: string }> }) {
  let actor;
  try { actor = await requireOwner(); } catch { return NextResponse.json({ error: "Owner access is required." }, { status: 403 }); }
  const { productId } = await params;
  const product = await prisma.product.findUnique({ where: { id: productId }, select: { id: true } });
  if (!product) return NextResponse.json({ error: "Product not found." }, { status: 404 });
  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  const parsed = z.object({ alt: z.string().trim().min(1).max(180), altHi: z.string().trim().max(180).optional() }).safeParse({ alt: form?.get("alt"), altHi: form?.get("altHi") || undefined });
  if (!(file instanceof File) || !parsed.success) return NextResponse.json({ error: "Choose an image and enter useful alternative text." }, { status: 400 });
  if (!allowedContentTypes.has(file.type) || file.size < 1 || file.size > MAX_UPLOAD_BYTES) return NextResponse.json({ error: "Use a JPEG, PNG, WebP or AVIF image under 5 MB." }, { status: 400 });
  let bytes: Buffer;
  try {
    const input = Buffer.from(await file.arrayBuffer());
    const image = sharp(input, { limitInputPixels: 24_000_000, animated: false });
    const metadata = await image.metadata();
    if (!metadata.width || !metadata.height || (metadata.pages ?? 1) > 1 || !["jpeg", "png", "webp", "avif"].includes(metadata.format ?? "")) {
      return NextResponse.json({ error: "This image format is not supported." }, { status: 400 });
    }
    bytes = await image.rotate().resize({ width: 2000, height: 2000, fit: "inside", withoutEnlargement: true }).webp({ quality: 84 }).toBuffer();
  } catch {
    return NextResponse.json({ error: "The uploaded file is not a valid image." }, { status: 400 });
  }
  const key = `products/${productId}/${randomBytes(16).toString("hex")}.webp`;
  try {
    const { client, bucket } = storage();
    await client.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: bytes, ContentType: "image/webp", CacheControl: "public, max-age=31536000, immutable" }));
  } catch {
    return NextResponse.json({ error: "Image storage is not configured or the upload failed." }, { status: 503 });
  }
  try {
    const sortOrder = await prisma.productImage.count({ where: { productId } });
    const image = await prisma.$transaction(async (tx) => {
      const created = await tx.productImage.create({ data: { productId, url: publicUrl(key), storageKey: key, alt: parsed.data.alt, altHi: parsed.data.altHi, sortOrder } });
      await tx.productChange.create({ data: { productId, actorId: actor.id, summary: "Product image uploaded", payload: { imageId: created.id, sortOrder } } });
      await tx.auditLog.create({ data: { actorId: actor.id, action: "product.image.upload", entityType: "Product", entityId: productId } });
      return created;
    });
    return NextResponse.json({ image }, { status: 201 });
  } catch {
    try { const { client, bucket } = storage(); await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key })); } catch { /* The next storage cleanup can remove unreferenced uploads. */ }
    return NextResponse.json({ error: "Image could not be attached to the product." }, { status: 500 });
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ productId: string }> }) {
  let actor;
  try { actor = await requireOwner(); } catch { return NextResponse.json({ error: "Owner access is required." }, { status: 403 }); }
  const { productId } = await params;
  const parsed = z.object({ imageIds: z.array(z.string()).min(1).max(30) }).safeParse(await request.json().catch(() => null));
  if (!parsed.success || new Set(parsed.data.imageIds).size !== parsed.data.imageIds.length) return NextResponse.json({ error: "Invalid image order." }, { status: 400 });
  const images = await prisma.productImage.findMany({ where: { productId, id: { in: parsed.data.imageIds } }, select: { id: true } });
  if (images.length !== parsed.data.imageIds.length) return NextResponse.json({ error: "Image list does not match this product." }, { status: 400 });
  await prisma.$transaction(async (tx) => {
    for (const [sortOrder, id] of parsed.data.imageIds.entries()) await tx.productImage.update({ where: { id }, data: { sortOrder } });
    await tx.productChange.create({ data: { productId, actorId: actor.id, summary: "Product image order updated", payload: { count: images.length } } });
    await tx.auditLog.create({ data: { actorId: actor.id, action: "product.image.reorder", entityType: "Product", entityId: productId } });
  });
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request, { params }: { params: Promise<{ productId: string }> }) {
  let actor;
  try { actor = await requireOwner(); } catch { return NextResponse.json({ error: "Owner access is required." }, { status: 403 }); }
  const { productId } = await params;
  const parsed = z.object({ imageId: z.string() }).safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid image." }, { status: 400 });
  const image = await prisma.productImage.findFirst({ where: { id: parsed.data.imageId, productId } });
  if (!image) return NextResponse.json({ error: "Image not found." }, { status: 404 });
  await prisma.$transaction(async (tx) => {
    await tx.productImage.delete({ where: { id: image.id } });
    await tx.productChange.create({ data: { productId, actorId: actor.id, summary: "Product image removed", payload: { imageId: image.id } } });
    await tx.auditLog.create({ data: { actorId: actor.id, action: "product.image.remove", entityType: "Product", entityId: productId } });
  });
  if (image.storageKey) {
    try { const { client, bucket } = storage(); await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: image.storageKey })); }
    catch { /* The database no longer serves this image; storage cleanup can retry the delete. */ }
  }
  return NextResponse.json({ ok: true });
}
