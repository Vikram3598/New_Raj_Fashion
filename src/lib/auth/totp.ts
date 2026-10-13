import { Secret, TOTP } from "otpauth";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { prisma } from "@/lib/db";
import { getAuthSecret, hmacSha256, randomToken } from "@/lib/crypto";

function encryptSecret(plain: string) {
  const key = createHash("sha256").update(`nrf-totp-secret:${getAuthSecret()}`).digest();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return `v1:${iv.toString("base64url")}:${cipher.getAuthTag().toString("base64url")}:${encrypted.toString("base64url")}`;
}

function decryptSecret(stored: string) {
  const [version, ivText, tagText, encryptedText] = stored.split(":");
  if (version !== "v1" || !ivText || !tagText || !encryptedText) {
    // Compatibility for secrets created before authenticated encryption was added.
    const idx = stored.indexOf(":");
    if (idx < 0) throw new Error("Invalid authenticator secret.");
    return Buffer.from(stored.slice(idx + 1), "base64url").toString("utf8");
  }
  const key = createHash("sha256").update(`nrf-totp-secret:${getAuthSecret()}`).digest();
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivText, "base64url"));
  decipher.setAuthTag(Buffer.from(tagText, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(encryptedText, "base64url")), decipher.final()]).toString("utf8");
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
      data: { enabledAt: new Date(), secretEnc: encryptSecret(decryptSecret(rec.secretEnc)) },
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
  const secret = decryptSecret(rec.secretEnc);
  const valid = verifyTotpToken(secret, token);
  if (valid && !rec.secretEnc.startsWith("v1:")) {
    await prisma.totpAuthenticator.update({ where: { userId }, data: { secretEnc: encryptSecret(secret) } });
  }
  return valid;
}

export async function consumeRecoveryCode(userId: string, code: string) {
  const hash = hmacSha256(code.trim().toUpperCase());
  const consumed = await prisma.recoveryCode.updateMany({ where: { userId, codeHash: hash, usedAt: null }, data: { usedAt: new Date() } });
  return consumed.count === 1;
}
