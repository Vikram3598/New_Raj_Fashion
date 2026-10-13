import { cookies } from "next/headers";
import { prisma } from "@/lib/db";
import { hashSessionToken, randomToken } from "@/lib/crypto";
import type { PermissionKey } from "@/lib/permissions";
import { PERMISSIONS, resolveAuthorization } from "@/lib/permissions";

const COOKIE = process.env.SESSION_COOKIE_NAME ?? "nrf_session";
const TTL_DAYS = Number(process.env.SESSION_TTL_DAYS ?? 14);

export type AuthUser = {
  id: string;
  username: string;
  customerCode: string;
  status: string;
  roles: string[];
  permissions: PermissionKey[];
  mfaEnabled: boolean;
  mfaSatisfied: boolean;
};

export async function createSession(userId: string, opts?: { userAgent?: string; ip?: string; mfaSatisfied?: boolean }) {
  const token = randomToken(32);
  const expiresAt = new Date(Date.now() + TTL_DAYS * 24 * 60 * 60 * 1000);
  await prisma.userSession.create({
    data: {
      userId,
      tokenHash: hashSessionToken(token),
      userAgent: opts?.userAgent,
      ipAddress: opts?.ip,
      expiresAt,
      mfaSatisfiedAt: opts?.mfaSatisfied ? new Date() : null,
    },
  });
  const jar = await cookies();
  jar.set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  });
  return token;
}

export async function destroySession() {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (token) {
    await prisma.userSession.updateMany({
      where: { tokenHash: hashSessionToken(token), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
  jar.set(COOKIE, "", { httpOnly: true, path: "/", maxAge: 0 });
}

export async function getSessionUser(): Promise<AuthUser | null> {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (!token) return null;
  const session = await prisma.userSession.findUnique({
    where: { tokenHash: hashSessionToken(token) },
    include: {
      user: {
        include: {
          totp: true,
          roles: { include: { role: { include: { permissions: { include: { permission: true } } } } } },
          staffProfile: { include: { grants: { include: { permission: true } } } },
        },
      },
    },
  });
  if (!session || session.revokedAt || session.expiresAt < new Date()) return null;
  if (session.user.status !== "ACTIVE") return null;

  await prisma.userSession.update({
    where: { id: session.id },
    data: { lastSeenAt: new Date() },
  });

  const authorization = resolveAuthorization({
    assignedRoles: session.user.roles.map((r) => r.role.name),
    rolePermissions: session.user.roles.flatMap((r) => r.role.permissions.map((p) => ({ role: r.role.name, key: p.permission.key }))),
    staffStatus: session.user.staffProfile?.status ?? null,
    staffGrants: session.user.staffProfile?.grants.map((g) => ({ key: g.permission.key, granted: g.granted })) ?? [],
  });
  const { roles, permissions } = authorization;

  const mfaEnabled = Boolean(session.user.totp?.enabledAt);
  return {
    id: session.user.id,
    username: session.user.username,
    customerCode: session.user.customerCode,
    status: session.user.status,
    roles,
    permissions,
    mfaEnabled,
    mfaSatisfied: Boolean(session.mfaSatisfiedAt) || !mfaEnabled,
  };
}

export async function requireUser() {
  const user = await getSessionUser();
  if (!user) throw new AuthError("UNAUTHENTICATED", "Please sign in to continue.");
  if (user.mfaEnabled && !user.mfaSatisfied) {
    throw new AuthError("MFA_REQUIRED", "Authenticator verification is required.");
  }
  return user;
}

export async function requirePermission(permission: PermissionKey) {
  const user = await requireUser();
  if (!user.permissions.includes(permission) && !user.roles.includes("OWNER")) {
    throw new AuthError("FORBIDDEN", "You do not have permission to perform this action.");
  }
  return user;
}

export async function requireOwner() {
  const user = await requireUser();
  if (!user.roles.includes("OWNER")) {
    throw new AuthError("FORBIDDEN", "Owner access is required.");
  }
  return user;
}

export async function requireShopkeeper() {
  const user = await requireUser();
  const staffOk = user.roles.includes("STAFF") || user.roles.includes("OWNER");
  if (!staffOk) throw new AuthError("FORBIDDEN", "Shopkeeper access is required.");
  return user;
}

export async function markMfaSatisfied() {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (!token) return;
  await prisma.userSession.updateMany({
    where: { tokenHash: hashSessionToken(token), revokedAt: null },
    data: { mfaSatisfiedAt: new Date() },
  });
}

export async function revokeAllSessions(userId: string, exceptTokenHash?: string) {
  await prisma.userSession.updateMany({
    where: {
      userId,
      revokedAt: null,
      ...(exceptTokenHash ? { tokenHash: { not: exceptTokenHash } } : {}),
    },
    data: { revokedAt: new Date() },
  });
}

export class AuthError extends Error {
  constructor(
    public code: "UNAUTHENTICATED" | "FORBIDDEN" | "MFA_REQUIRED",
    message: string,
  ) {
    super(message);
  }
}

export function hasOwnerProductWrite(user: AuthUser) {
  return user.roles.includes("OWNER") && user.permissions.includes(PERMISSIONS.PRODUCT_WRITE);
}

