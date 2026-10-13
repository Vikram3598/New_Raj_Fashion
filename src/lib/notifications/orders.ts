import { prisma } from "@/lib/db";
import { sendEmail, sendSms } from "@/lib/notifications/providers";

export async function notifyCustomerOrder(input: { orderId: string; eventKey: string; subject: string; message: string; templateKey?: string; respectPreference?: boolean }) {
  try {
    const order = await prisma.order.findUnique({
      where: { id: input.orderId },
      include: { user: { include: { communicationPrefs: true, identities: { where: { verifiedAt: { not: null } }, orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }] } } } },
    });
    if (!order || (input.respectPreference !== false && order.user.communicationPrefs?.orderUpdates === false)) return;
    const email = order.user.identities.find((identity) => identity.type === "EMAIL")?.valueNormalized;
    const phone = order.user.identities.find((identity) => identity.type === "PHONE")?.valueNormalized;
    const deliveries: Promise<unknown>[] = [];
    const templateKey = input.templateKey ?? "order.update";
    if (email) deliveries.push(sendEmail({ userId: order.userId, to: email, subject: input.subject, text: input.message, templateKey, idempotencyKey: `${input.eventKey}:email` }));
    if (phone) deliveries.push(sendSms({ userId: order.userId, to: phone, text: `${input.subject}: ${input.message}`, templateKey, idempotencyKey: `${input.eventKey}:sms` }));
    await Promise.allSettled(deliveries);
  } catch { /* Notification delivery must never change an order, payment or refund result. */ }
}
