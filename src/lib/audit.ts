import { prisma } from "@/lib/db";

export async function writeAudit(input: {
  actorId?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  ipAddress?: string | null;
  metadata?: Record<string, unknown>;
}) {
  await prisma.auditLog.create({
    data: {
      actorId: input.actorId ?? undefined,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId ?? undefined,
      ipAddress: input.ipAddress ?? undefined,
      metadata: input.metadata as object | undefined,
    },
  });
}
