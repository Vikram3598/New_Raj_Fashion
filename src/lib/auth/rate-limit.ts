import { prisma } from "@/lib/db";

export async function assertRateLimit(key: string, max: number, windowMs: number) {
  const since = new Date(Date.now() - windowMs);
  const count = await prisma.rateLimitEvent.count({
    where: { key, createdAt: { gte: since } },
  });
  if (count >= max) {
    throw new Error("Too many attempts. Please try again later.");
  }
  await prisma.rateLimitEvent.create({ data: { key } });
}

export async function recordSecurityEvent(input: {
  type: string;
  severity?: string;
  ipAddress?: string | null;
  userId?: string | null;
  detail?: Record<string, unknown>;
}) {
  await prisma.securityEvent.create({
    data: {
      type: input.type,
      severity: input.severity ?? "info",
      ipAddress: input.ipAddress ?? undefined,
      userId: input.userId ?? undefined,
      detail: input.detail as object | undefined,
    },
  });
}
