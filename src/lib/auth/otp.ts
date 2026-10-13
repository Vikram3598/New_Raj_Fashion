import { IdentityType, OtpPurpose } from "@prisma/client";
import { prisma } from "@/lib/db";
import { hashOtp, randomOtpDigits, safeEqual } from "@/lib/crypto";
import { assertRateLimit, recordSecurityEvent } from "@/lib/auth/rate-limit";
import { sendEmail, sendSms } from "@/lib/notifications/providers";

const OTP_TTL_MS = 10 * 60 * 1000;
const RESEND_MS = 60 * 1000;

function devOtpAllowed() {
  return process.env.NODE_ENV !== "production" && process.env.AUTH_DEV_OTP_ENABLED === "true";
}

export async function issueOtp(input: {
  destination: string;
  destinationType: IdentityType;
  purpose: OtpPurpose;
  userId?: string;
  ipAddress?: string;
}) {
  await assertRateLimit(`otp:${input.destination}:${input.purpose}`, 5, 15 * 60 * 1000);
  await assertRateLimit(`otp-ip:${input.ipAddress ?? "unknown"}`, 20, 15 * 60 * 1000);

  const latest = await prisma.otpChallenge.findFirst({
    where: { destination: input.destination, purpose: input.purpose },
    orderBy: { createdAt: "desc" },
  });
  if (latest && latest.resendAvailableAt > new Date() && !latest.consumedAt) {
    throw new Error("Please wait before requesting another code.");
  }

  const challenge = await prisma.otpChallenge.create({
    data: {
      userId: input.userId,
      destinationType: input.destinationType,
      destination: input.destination,
      purpose: input.purpose,
      codeHash: "pending",
      expiresAt: new Date(Date.now() + OTP_TTL_MS),
      resendAvailableAt: new Date(Date.now() + RESEND_MS),
      ipAddress: input.ipAddress,
    },
  });

  const code = devOtpAllowed() && process.env.AUTH_DEV_OTP_CODE ? process.env.AUTH_DEV_OTP_CODE : randomOtpDigits(6);
  await prisma.otpChallenge.update({
    where: { id: challenge.id },
    data: { codeHash: hashOtp(code, challenge.id) },
  });

  const message = `Your New Raj Fashion verification code is ${code}. It expires in 10 minutes.`;
  if (input.destinationType === "EMAIL") {
    await sendEmail({
      to: input.destination,
      subject: "Your verification code",
      text: message,
      templateKey: "otp",
      idempotencyKey: `otp:${challenge.id}`,
    });
  } else if (input.destinationType === "PHONE") {
    await sendSms({
      to: input.destination,
      text: message,
      templateKey: "otp",
      idempotencyKey: `otp:${challenge.id}`,
    });
  }

  if (process.env.NODE_ENV !== "production") {
    // Never log the OTP value.
    console.info("OTP issued", { challengeId: challenge.id, destinationType: input.destinationType });
  }

  return { challengeId: challenge.id, ...(devOtpAllowed() ? { devCode: code } : {}) };
}

export async function verifyOtp(input: {
  challengeId: string;
  code: string;
  destination: string;
  purpose: OtpPurpose;
  ipAddress?: string;
  consume?: boolean;
}) {
  await assertRateLimit(`otp-verify:${input.challengeId}`, 8, 15 * 60 * 1000);
  const challenge = await prisma.otpChallenge.findUnique({ where: { id: input.challengeId } });
  if (!challenge || challenge.destination !== input.destination || challenge.purpose !== input.purpose) throw new Error("Invalid or expired verification code.");
  if (challenge.consumedAt || challenge.expiresAt < new Date()) throw new Error("Invalid or expired verification code.");
  if (challenge.attemptCount >= challenge.maxAttempts) {
    await recordSecurityEvent({ type: "otp_bruteforce", severity: "warning", ipAddress: input.ipAddress, detail: { challengeId: challenge.id } });
    throw new Error("Invalid or expired verification code.");
  }
  const valid = safeEqual(hashOtp(input.code, challenge.id), challenge.codeHash);
  const update = await prisma.otpChallenge.updateMany({
    where: { id: challenge.id, consumedAt: null, expiresAt: { gt: new Date() }, attemptCount: { lt: challenge.maxAttempts } },
    data: { attemptCount: { increment: 1 }, ...(valid && input.consume !== false ? { consumedAt: new Date() } : {}) },
  });
  if (update.count !== 1 || !valid) throw new Error("Invalid or expired verification code.");
  return challenge;
}
export async function findUsersByIdentity(type: IdentityType, valueNormalized: string) {
  return prisma.user.findMany({
    where: {
      status: "ACTIVE",
      identities: { some: { type, valueNormalized, verifiedAt: { not: null } } },
    },
    select: { id: true, username: true, customerCode: true },
  });
}


