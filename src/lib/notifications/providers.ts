import { prisma } from "@/lib/db";

export async function sendEmail(input: {
  to: string;
  subject: string;
  text: string;
  html?: string;
  templateKey: string;
  idempotencyKey: string;
  userId?: string;
}) {
  const existing = await prisma.notification.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
  if (existing?.status === "SENT") return existing;

  const host = process.env.SMTP_HOST;
  const record = await prisma.notification.upsert({
    where: { idempotencyKey: input.idempotencyKey },
    update: {},
    create: {
      userId: input.userId,
      channel: "EMAIL",
      templateKey: input.templateKey,
      destination: input.to,
      payload: { subject: input.subject },
      status: host ? "QUEUED" : "SKIPPED",
      idempotencyKey: input.idempotencyKey,
    },
  });

  if (!host) return record;

  try {
    const nodemailer = await import("nodemailer" as string).catch(() => null);
    if (!nodemailer) {
      await prisma.notification.update({
        where: { id: record.id },
        data: { status: "SKIPPED", error: "SMTP package not installed; message queued in logs only." },
      });
      return record;
    }
    const transporter = nodemailer.createTransport({
      host,
      port: Number(process.env.SMTP_PORT ?? 587),
      secure: process.env.SMTP_SECURE === "true",
      auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
    });
    await transporter.sendMail({
      from: process.env.SMTP_FROM,
      to: input.to,
      subject: input.subject,
      text: input.text,
      html: input.html,
    });
    return prisma.notification.update({
      where: { id: record.id },
      data: { status: "SENT", sentAt: new Date() },
    });
  } catch (error) {
    await prisma.notification.update({
      where: { id: record.id },
      data: { status: "FAILED", error: error instanceof Error ? error.message : "send failed" },
    });
    throw error;
  }
}

export async function sendSms(input: {
  to: string;
  text: string;
  templateKey: string;
  idempotencyKey: string;
  userId?: string;
}) {
  const existing = await prisma.notification.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
  if (existing?.status === "SENT") return existing;

  const configured = Boolean(process.env.SMS_API_KEY && process.env.SMS_PROVIDER);
  return prisma.notification.upsert({
    where: { idempotencyKey: input.idempotencyKey },
    update: {},
    create: {
      userId: input.userId,
      channel: "SMS",
      templateKey: input.templateKey,
      destination: input.to,
      payload: { preview: "otp" },
      status: configured ? "QUEUED" : "SKIPPED",
      idempotencyKey: input.idempotencyKey,
    },
  });
}
