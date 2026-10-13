import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from "node:crypto";

export function getAuthSecret(): string {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 16) {
    throw new Error("AUTH_SECRET must be set to a long random value");
  }
  return secret;
}

export function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function hmacSha256(value: string, secret = getAuthSecret()): string {
  return createHmac("sha256", secret).update(value).digest("hex");
}

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("hex");
}

export function randomOtpDigits(length = 6): string {
  const max = 10 ** length;
  return String(randomInt(0, max)).padStart(length, "0");
}

export function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

export function hashOtp(code: string, challengeId: string): string {
  return hmacSha256(`${challengeId}:${code}`);
}

export function hashSessionToken(token: string): string {
  return sha256(token);
}
