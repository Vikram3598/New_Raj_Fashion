import { Secret, TOTP } from "otpauth";
import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/db";
import { hmacSha256, randomToken, safeEqual } from "@/lib/crypto";
import { hashPassword } from "@/lib/auth/password";

function encryptSecret(plain: string) {
  return hmacSha256(`totp-store:${plain}`) + ":" + Buffer.from(plain, "utf8").toString("base64url");
}

function decryptSecret(stored: string) {
  const idx = stored.indexOf(":");
  return Buffer.from(stored.slice(idx + 1), "base64url").toString("utf8");
}

export async function beginTotpEnrollment(userId: string, username: string) {
  const secret = new Secret({ size: 20 });
  const totp = new TOTP({
    issuer: "New Raj Fashion",
    label: username,
    algorithm: "SHA1",
    digits: 6,
    period: 30,
    secret,
  });
  await prisma.totpAuthenticator.upsert({
    where: { userId },
    update: { secretEnc: encryptSecret(secret.base32), enabledAt: null },
    create: { userId, secretEnc: encryptSecret(secret.base32) },
  });
  return { otpauth: totp.toString(), secret: secret.base32 };
}

export async function verifyAndEnableTotp(userId: string, token: string) {
  const rec = await prisma.totpAuthenticator.findUnique({ where: { userId } });
  if (!rec) throw new Error("Authenticator setup has not been started.");
  const ok = verifyTotpToken(decryptSecret(rec.secretEnc), token);
  if (!ok) throw new Error("Invalid authenticator code.");
  const codes = Array.from({ length: 10 }, () => randomToken(5).slice(0, 10).toUpperCase());
  await prisma.$transaction([
    prisma.totpAuthenticator.update({
      where: { userId },
      data: { enabledAt: new Date() },
    }),
    prisma.recoveryCode.deleteMany({ where: { userId } }),
    prisma.recoveryCode.createMany({
      data: codes.map((c) => ({ userId, codeHash: hmacSha256(c) })),
    }),
  ]);
  return codes;
}

export function verifyTotpToken(secretBase32: string, token: string) {
  const totp = new TOTP({ secret: Secret.fromBase32(secretBase32), digits: 6, period: 30, algorithm: "SHA1" });
  return totp.validate({ token: token.replace(/\s/g, ""), window: 1 }) !== null;
}

export async function verifyUserTotp(userId: string, token: string) {
  const rec = await prisma.totpAuthenticator.findUnique({ where: { userId } });
  if (!rec?.enabledAt) throw new Error("Authenticator is not enabled for this account.");
  return verifyTotpToken(decryptSecret(rec.secretEnc), token);
}

export async function consumeRecoveryCode(userId: string, code: string) {
  const hash = hmacSha256(code.trim().toUpperCase());
  const found = await prisma.recoveryCode.findFirst({ where: { userId, codeHash: hash, usedAt: null } });
  if (!found) return false;
  await prisma.recoveryCode.update({ where: { id: found.id }, data: { usedAt: new Date() } });
  return true;
}

export { randomBytes, hashPassword, safeEqual };
