import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { NextResponse } from "next/server";
import { getSessionUser, requireOwner, requirePermission } from "@/lib/auth/session";
import { PERMISSIONS } from "@/lib/permissions";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function storage() {
  const bucket = process.env.S3_PRIVATE_BUCKET;
  if (!bucket) throw new Error("S3_PRIVATE_BUCKET is not configured.");
  const client = new S3Client({ region: process.env.S3_REGION || "ap-south-1", endpoint: process.env.S3_ENDPOINT || undefined, forcePathStyle: process.env.S3_FORCE_PATH_STYLE === "true", ...(process.env.S3_ACCESS_KEY && process.env.S3_SECRET_KEY ? { credentials: { accessKeyId: process.env.S3_ACCESS_KEY, secretAccessKey: process.env.S3_SECRET_KEY } } : {}) });
  return { client, bucket };
}

export async function GET(_request: Request, { params }: { params: Promise<{ imageId: string }> }) {
  const { imageId } = await params;
  if (!/^[a-f0-9]{36}$/.test(imageId)) return NextResponse.json({ error: "Image not found." }, { status: 404 });
  const referenceImageUrl = `/api/store-visits/reference-image/${imageId}`;
  let authorized = false;
  try { await requireOwner(); authorized = true; } catch { /* Check narrower permissions below. */ }
  if (!authorized) {
    const user = await getSessionUser();
    if (user) {
      const ownVisit = await prisma.storeVisit.findFirst({ where: { userId: user.id, referenceImageUrl }, select: { id: true } });
      authorized = Boolean(ownVisit);
    }
  }
  if (!authorized) {
    try {
      const staff = await requirePermission(PERMISSIONS.STORE_VISIT_READ);
      const assignedVisit = await prisma.storeVisit.findFirst({ where: { assignedStaffId: staff.id, referenceImageUrl }, select: { id: true } });
      authorized = Boolean(assignedVisit);
    } catch { /* Anonymous and unassigned staff requests are denied. */ }
  }
  if (!authorized) return NextResponse.json({ error: "Image not found." }, { status: 404 });
  try {
    const { client, bucket } = storage();
    const result = await client.send(new GetObjectCommand({ Bucket: bucket, Key: `visit-references/${imageId}.webp` }));
    if (!result.Body) return NextResponse.json({ error: "Image not found." }, { status: 404 });
    const bytes = await result.Body.transformToByteArray();
    const body = new ArrayBuffer(bytes.byteLength);
    new Uint8Array(body).set(bytes);
    return new Response(body, { headers: { "content-type": "image/webp", "cache-control": "private, no-store", "x-content-type-options": "nosniff" } });
  } catch { return NextResponse.json({ error: "Image not found." }, { status: 404 }); }
}
