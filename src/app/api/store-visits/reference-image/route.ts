import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import sharp from "sharp";
import { assertRateLimit } from "@/lib/auth/rate-limit";
import { getSessionUser } from "@/lib/auth/session";

export const runtime = "nodejs";
const allowed = new Set(["image/jpeg", "image/png", "image/webp", "image/avif"]);

function createStorage() {
  const bucket = process.env.S3_PRIVATE_BUCKET;
  if (!bucket) throw new Error("S3_PRIVATE_BUCKET is not configured.");
  const client = new S3Client({ region: process.env.S3_REGION || "ap-south-1", endpoint: process.env.S3_ENDPOINT || undefined, forcePathStyle: process.env.S3_FORCE_PATH_STYLE === "true", ...(process.env.S3_ACCESS_KEY && process.env.S3_SECRET_KEY ? { credentials: { accessKeyId: process.env.S3_ACCESS_KEY, secretAccessKey: process.env.S3_SECRET_KEY } } : {}) });
  return { client, bucket };
}

export async function POST(request: Request) {
  const user = await getSessionUser();
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  try { await assertRateLimit(`visit-image:${user?.id ?? ip}`, 5, 60 * 60 * 1000); }
  catch { return NextResponse.json({ error: "Too many uploads. Please try again later." }, { status: 429 }); }
  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File) || !allowed.has(file.type) || file.size < 1 || file.size > 5 * 1024 * 1024) return NextResponse.json({ error: "Upload one JPEG, PNG, WebP or AVIF reference image under 5 MB." }, { status: 400 });
  let bytes: Buffer;
  try {
    const image = sharp(Buffer.from(await file.arrayBuffer()), { limitInputPixels: 16_000_000, animated: false });
    const metadata = await image.metadata();
    if (!metadata.width || !metadata.height || (metadata.pages ?? 1) > 1 || !["jpeg", "png", "webp", "avif"].includes(metadata.format ?? "")) return NextResponse.json({ error: "This image format is not supported." }, { status: 400 });
    bytes = await image.rotate().resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true }).webp({ quality: 80 }).toBuffer();
  } catch { return NextResponse.json({ error: "The uploaded file is not a valid image." }, { status: 400 }); }
  const key = `visit-references/${randomBytes(18).toString("hex")}.webp`;
  try {
    const { client, bucket } = createStorage();
    await client.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: bytes, ContentType: "image/webp", CacheControl: "private, max-age=86400" }));
    const imageId = key.slice("visit-references/".length).replace(/\.webp$/, "");
    return NextResponse.json({ url: `/api/store-visits/reference-image/${imageId}` }, { status: 201 });
  } catch { return NextResponse.json({ error: "Reference image storage is unavailable. You may still submit the visit request without an image." }, { status: 503 }); }
}
