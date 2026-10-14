import { randomBytes, createHash, createHmac } from "node:crypto";
import { loadEnvConfig } from "@next/env";
import { DeleteObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { PrismaClient, RoleName } from "@prisma/client";
import { expect, test, type APIRequestContext } from "@playwright/test";
import sharp from "sharp";

loadEnvConfig(process.cwd());
const prisma = new PrismaClient();
const userIds: string[] = [];
const visitIds: string[] = [];
const orderIds: string[] = [];
const cartIds: string[] = [];
const productIds: string[] = [];
const variantIds: string[] = [];
const referenceImageKeys: string[] = [];
const productImageKeys: string[] = [];
const paymentWebhookEventIds: string[] = [];
const storeVisitVerificationIds: string[] = [];
let temporaryVisitSlot: { id: string; originalCapacity: number | null; originalClosed: boolean | null } | null = null;
const suffix = randomBytes(6).toString("hex");
const cookieName = process.env.SESSION_COOKIE_NAME ?? "nrf_session";
let actorIndex = 0;
let originalCashOnPickup: boolean | null = null;

async function createActor(roleName: RoleName, options: { denyVisitRead?: boolean; grantPermissions?: string[] } = {}) {
  const index = actorIndex++;
  const token = randomBytes(32).toString("hex");
  const grants = [
    ...(options.denyVisitRead ? [{ granted: false, permission: { connect: { key: "store_visit.read" } } }] : []),
    ...(options.grantPermissions ?? []).map((key) => ({ granted: true, permission: { connect: { key } } })),
  ];
  const profile = roleName === "STAFF" ? {
    create: {
      status: "ACTIVE" as const,
      ...(grants.length ? { grants: { create: grants } } : {}),
    },
  } : undefined;
  const user = await prisma.user.create({
    data: {
      customerCode: `E2E-${suffix}-${roleName}-${index}`,
      username: `e2e-${roleName.toLowerCase()}-${suffix}-${index}`,
      roles: { create: { role: { connect: { name: roleName } } } },
      ...(profile ? { staffProfile: profile } : {}),
      sessions: { create: { tokenHash: createHash("sha256").update(token).digest("hex"), expiresAt: new Date(Date.now() + 10 * 60_000), mfaSatisfiedAt: new Date() } },
    },
    select: { id: true },
  });
  userIds.push(user.id);
  return { id: user.id, token, headers: { cookie: `${cookieName}=${token}` } };
}

async function findAvailableSlot(request: APIRequestContext, kind: "VISIT" | "PICKUP", exclude?: { date: string; time: string }) {
  for (let day = 1; day <= 14; day++) {
    const date = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(Date.now() + day * 86_400_000));
    const availability = await request.get(`/api/store-visits/availability?date=${date}&kind=${kind}`);
    const data = await availability.json();
    const slot = (data.slots ?? []).find((candidate: { time: string; available: number; closed: boolean }) => candidate.available > 0 && !candidate.closed && !(exclude?.date === date && exclude.time === candidate.time));
    if (slot) return { date, time: slot.time };
  }
  return undefined;
}

async function findUnreservedVisitSlot(request: APIRequestContext) {
  for (let day = 1; day <= 21; day++) {
    const date = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(Date.now() + day * 86_400_000));
    const response = await request.get(`/api/store-visits/availability?date=${date}&kind=VISIT`);
    const data = await response.json();
    for (const slot of (data.slots ?? []) as { time: string; available: number; closed: boolean }[]) {
      if (!slot.available || slot.closed) continue;
      const startsAt = new Date(`${date}T${slot.time}:00+05:30`);
      const existing = await prisma.appointmentSlot.findUnique({ where: { kind_startsAt: { kind: "VISIT", startsAt } }, select: { reservedCount: true } });
      if (!existing || existing.reservedCount === 0) return { date, time: slot.time };
    }
  }
  return undefined;
}

test.afterAll(async () => {
  if (visitIds.length) {
    const visits = await prisma.storeVisit.findMany({ where: { id: { in: visitIds } }, select: { slotId: true } });
    await prisma.storeVisit.deleteMany({ where: { id: { in: visitIds } } });
    for (const visit of visits) await prisma.appointmentSlot.updateMany({ where: { id: visit.slotId, reservedCount: { gt: 0 } }, data: { reservedCount: { decrement: 1 } } });
  }
  if (temporaryVisitSlot) {
    if (temporaryVisitSlot.originalCapacity === null) await prisma.appointmentSlot.deleteMany({ where: { id: temporaryVisitSlot.id, reservedCount: 0 } });
    else await prisma.appointmentSlot.update({ where: { id: temporaryVisitSlot.id }, data: { capacity: temporaryVisitSlot.originalCapacity, closed: temporaryVisitSlot.originalClosed ?? false } });
  }
  if (orderIds.length) {
    await prisma.refund.deleteMany({ where: { orderId: { in: orderIds } } });
    await prisma.payment.deleteMany({ where: { orderId: { in: orderIds } } });
    await prisma.order.deleteMany({ where: { id: { in: orderIds } } });
  }
  if (paymentWebhookEventIds.length) await prisma.paymentWebhookEvent.deleteMany({ where: { provider: "razorpay", eventId: { in: paymentWebhookEventIds } } });
  if (storeVisitVerificationIds.length) await prisma.storeVisitVerification.deleteMany({ where: { id: { in: storeVisitVerificationIds } } });
  if (cartIds.length) await prisma.cart.deleteMany({ where: { id: { in: cartIds } } });
  if (variantIds.length) {
    await prisma.inventoryMovement.deleteMany({ where: { variantId: { in: variantIds } } });
    await prisma.productVariant.deleteMany({ where: { id: { in: variantIds } } });
  }
  if (productIds.length) await prisma.product.deleteMany({ where: { id: { in: productIds } } });
  const notificationPrefixes = [
    ...visitIds.map((id) => ({ idempotencyKey: { startsWith: `store-visit:${id}:` } })),
    ...orderIds.map((id) => ({ idempotencyKey: { startsWith: `store-pickup:${id}:` } })),
  ];
  if (notificationPrefixes.length) await prisma.notification.deleteMany({ where: { OR: notificationPrefixes } });
  if (userIds.length) await prisma.notification.deleteMany({ where: { userId: { in: userIds } } });
  if (originalCashOnPickup !== null) await prisma.storeSettings.update({ where: { id: "store" }, data: { allowCashOnPickup: originalCashOnPickup } });
  if (userIds.length) await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  const storageObjects = [
    ...referenceImageKeys.map((Key) => ({ Bucket: process.env.S3_PRIVATE_BUCKET ?? "", Key })),
    ...productImageKeys.map((Key) => ({ Bucket: process.env.S3_BUCKET ?? "new-raj-fashion", Key })),
  ].filter((object) => object.Bucket);
  if (storageObjects.length && process.env.S3_ACCESS_KEY && process.env.S3_SECRET_KEY) {
    const storage = new S3Client({
      region: process.env.S3_REGION || "ap-south-1",
      endpoint: process.env.S3_ENDPOINT || undefined,
      forcePathStyle: process.env.S3_FORCE_PATH_STYLE === "true",
      credentials: { accessKeyId: process.env.S3_ACCESS_KEY, secretAccessKey: process.env.S3_SECRET_KEY },
    });
    await Promise.allSettled(storageObjects.map(({ Bucket, Key }) => storage.send(new DeleteObjectCommand({ Bucket, Key }))));
    storage.destroy();
  }
  await prisma.$disconnect();
});

test("Owner and Staff permissions are enforced by direct API requests", async ({ request }) => {
  test.setTimeout(60_000);
  const [owner, staff, restrictedStaff, customer] = await Promise.all([
    createActor("OWNER"), createActor("STAFF"), createActor("STAFF", { denyVisitRead: true }), createActor("CUSTOMER"),
  ]);

  expect((await request.get("/api/owner/store-visits", { headers: owner.headers })).status()).toBe(200);
  expect((await request.get("/api/owner/store-pickups", { headers: owner.headers })).status()).toBe(200);
  expect((await request.get("/api/staff/store-visits", { headers: staff.headers })).status()).toBe(200);
  expect((await request.get("/api/staff/store-pickups", { headers: staff.headers })).status()).toBe(200);

  expect((await request.get("/api/owner/store-visits", { headers: staff.headers })).status()).toBe(403);
  expect((await request.patch("/api/owner/store-pickups/no-such-order", { headers: staff.headers, data: { status: "READY" } })).status()).toBe(403);
  expect((await request.get("/api/staff/store-visits", { headers: restrictedStaff.headers })).status()).toBe(403);
  expect((await request.get("/api/owner/store-pickups", { headers: customer.headers })).status()).toBe(403);
});

test("concurrent store visit submissions cannot exceed a slot's capacity", async ({ request }) => {
  const [firstCustomer, secondCustomer] = await Promise.all([createActor("CUSTOMER"), createActor("CUSTOMER")]);
  const slot = await findUnreservedVisitSlot(request);
  expect(slot, "find an available visit slot to test concurrent reservation").toBeTruthy();
  const startsAt = new Date(`${slot!.date}T${slot!.time}:00+05:30`);
  const existing = await prisma.appointmentSlot.findUnique({ where: { kind_startsAt: { kind: "VISIT", startsAt } } });
  expect(existing?.reservedCount ?? 0, "use a slot without an existing reservation").toBe(0);
  const testSlot = existing
    ? await prisma.appointmentSlot.update({ where: { id: existing.id }, data: { capacity: 1, closed: false }, select: { id: true } })
    : await prisma.appointmentSlot.create({ data: { kind: "VISIT", startsAt, endsAt: new Date(startsAt.getTime() + 60 * 60 * 1000), capacity: 1 }, select: { id: true } });
  temporaryVisitSlot = { id: testSlot.id, originalCapacity: existing?.capacity ?? null, originalClosed: existing?.closed ?? null };

  const submit = (customer: typeof firstCustomer) => request.post("/api/store-visits", { headers: customer.headers, data: {
    customerName: "Concurrent booking test", phone: "+919876543210", date: slot!.date, time: slot!.time,
    purpose: "GENERAL", language: "en", generalRequirement: "Check atomic appointment capacity reservation.",
  } });
  const responses = await Promise.all([submit(firstCustomer), submit(secondCustomer)]);
  const statuses = responses.map((response) => response.status()).sort((a, b) => a - b);
  expect(statuses).toEqual([201, 409]);
  const successful = responses.find((response) => response.status() === 201)!;
  const payload = await successful.json();
  visitIds.push(payload.visit.id);
  const persistedSlot = await prisma.appointmentSlot.findUniqueOrThrow({ where: { id: testSlot.id } });
  expect(persistedSlot.reservedCount).toBe(1);
});

test("guest visit verification remains usable after validation failure and is consumed once on success", async ({ request }) => {
  const slot = await findAvailableSlot(request, "VISIT");
  expect(slot, "find a valid store visit slot for a guest request").toBeTruthy();
  const email = `guest-${suffix}@example.test`;
  const code = "482731";
  const verificationId = `e2e-visit-verification-${suffix}`;
  const requestHeaders = { "x-forwarded-for": `198.51.100.${Number.parseInt(suffix.slice(0, 2), 16) + 1}` };
  storeVisitVerificationIds.push(verificationId);
  await prisma.storeVisitVerification.create({ data: {
    id: verificationId,
    contact: email,
    channel: "EMAIL",
    codeHash: createHmac("sha256", process.env.AUTH_SECRET!).update(`store-visit:${verificationId}:${code}`).digest("hex"),
    expiresAt: new Date(Date.now() + 10 * 60_000),
  } });
  const requestBody = { customerName: "Guest audit customer", phone: "+919876543210", email, date: slot!.date, purpose: "GENERAL", language: "en", generalRequirement: "Verify guest booking code lifecycle.", verificationId, verificationCode: code };

  const invalidSlot = await request.post("/api/store-visits", { headers: requestHeaders, data: { ...requestBody, time: "02:00" } });
  expect(invalidSlot.status()).toBe(400);
  expect((await prisma.storeVisitVerification.findUniqueOrThrow({ where: { id: verificationId } })).consumedAt).toBeNull();

  const created = await request.post("/api/store-visits", { headers: requestHeaders, data: { ...requestBody, time: slot!.time } });
  expect(created.status(), await created.text()).toBe(201);
  const visitId = (await created.json()).visit.id as string;
  visitIds.push(visitId);
  expect((await prisma.storeVisitVerification.findUniqueOrThrow({ where: { id: verificationId } })).consumedAt).not.toBeNull();

  const replay = await request.post("/api/store-visits", { headers: requestHeaders, data: { ...requestBody, time: slot!.time } });
  expect(replay.status()).toBe(400);
  expect(await prisma.storeVisit.count({ where: { id: visitId } })).toBe(1);
  const owner = await prisma.user.findFirstOrThrow({ where: { status: "ACTIVE", roles: { some: { role: { name: "OWNER" } } } }, select: { id: true } });
  expect(await prisma.notification.count({ where: { userId: owner.id, idempotencyKey: `store-visit:${visitId}:created:in-app:${owner.id}` } })).toBe(1);
});

test("Razorpay captured-payment webhooks validate signatures and amounts and deduplicate events", async ({ request }) => {
  const customer = await createActor("CUSTOMER");
  const providerOrderId = `order_e2e_${suffix}`;
  const providerPaymentId = `pay_e2e_${suffix}`;
  const order = await prisma.order.create({ data: {
    orderNumber: `NRF-E2E-PAY-${suffix}`,
    userId: customer.id,
    subtotalPaise: 1000,
    totalPaise: 1000,
    shippingSnapshot: { fulfilmentType: "DELIVERY", testOrder: true },
  }, select: { id: true } });
  orderIds.push(order.id);
  await prisma.payment.create({ data: {
    orderId: order.id,
    provider: "razorpay",
    method: "RAZORPAY",
    amountPaise: 1000,
    providerOrderId,
    idempotencyKey: `rzp:e2e:${suffix}`,
  } });

  const eventId = `e2e-payment-captured-${suffix}`;
  paymentWebhookEventIds.push(eventId);
  const payload = { event: "payment.captured", payload: { payment: { entity: { id: providerPaymentId, order_id: providerOrderId, amount: 1000, currency: "INR", status: "captured" } } } };
  const raw = JSON.stringify(payload);
  const secret = process.env.E2E_RAZORPAY_WEBHOOK_SECRET ?? "nrf-e2e-only-webhook-secret";
  const sign = (body: string) => createHmac("sha256", secret).update(body).digest("hex");
  const postWebhook = (body: string, signature: string, id: string) => request.post("/api/payments/razorpay/webhook", {
    data: body,
    headers: { "content-type": "application/json", "x-razorpay-signature": signature, "x-razorpay-event-id": id },
  });

  expect((await postWebhook(raw, "0".repeat(64), `${eventId}-bad-signature`)).status()).toBe(400);
  const wrongAmountRaw = JSON.stringify({ ...payload, payload: { payment: { entity: { ...payload.payload.payment.entity, amount: 999 } } } });
  expect((await postWebhook(wrongAmountRaw, sign(wrongAmountRaw), `${eventId}-wrong-amount`)).status()).toBe(400);
  expect((await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).paymentStatus).toBe("PENDING");

  const first = await postWebhook(raw, sign(raw), eventId);
  expect(first.status(), await first.text()).toBe(200);
  const duplicate = await postWebhook(raw, sign(raw), eventId);
  expect(duplicate.status(), await duplicate.text()).toBe(200);
  const paidOrder = await prisma.order.findUniqueOrThrow({ where: { id: order.id }, include: { payments: true } });
  expect(paidOrder.paymentStatus).toBe("PAID");
  expect(paidOrder.fulfilmentStatus).toBe("CONFIRMED");
  expect(paidOrder.payments[0].status).toBe("PAID");
  expect(paidOrder.payments[0].providerPaymentId).toBe(providerPaymentId);
  expect((await prisma.paymentWebhookEvent.findUniqueOrThrow({ where: { provider_eventId: { provider: "razorpay", eventId } } })).processedAt).not.toBeNull();
});

test("store visit submission, owner assignment, staff preparation and cash pickup handover work end to end", async ({ request, page }) => {
  test.setTimeout(120_000);
  const owner = await createActor("OWNER");
  const staff = await createActor("STAFF");
  const customer = await createActor("CUSTOMER");
  const otherCustomer = await createActor("CUSTOMER");

  const samplePng = await sharp({ create: { width: 12, height: 12, channels: 3, background: "#762e3f" } }).png().toBuffer();
  const referenceUpload = await request.post("/api/store-visits/reference-image", { headers: customer.headers, multipart: {
    file: { name: "visit-reference.png", mimeType: "image/png", buffer: samplePng },
  } });
  expect(referenceUpload.status(), await referenceUpload.text()).toBe(201);
  const referenceImageUrl = (await referenceUpload.json()).url as string;
  const referenceImageId = referenceImageUrl.split("/").at(-1)!;
  referenceImageKeys.push(`visit-references/${referenceImageId}.webp`);
  expect((await request.get(referenceImageUrl)).status()).toBe(404);
  const directPrivateUrl = `${process.env.S3_ENDPOINT}/${process.env.S3_PRIVATE_BUCKET}/visit-references/${referenceImageId}.webp`;
  expect([403, 404]).toContain((await request.get(directPrivateUrl)).status());

  const visitSlot = await findAvailableSlot(request, "VISIT");
  expect(visitSlot, "find an available visit slot in the next two weeks").toBeTruthy();
  const visitResponse = await request.post("/api/store-visits", { headers: customer.headers, data: {
    customerName: "End-to-end audit customer", phone: "+919876543210", date: visitSlot!.date, time: visitSlot!.time,
    purpose: "GENERAL", language: "en", generalRequirement: "Audit a family occasion outfit appointment.", peopleCount: 2, referenceImageUrl,
  } });
  const visitPayload = await visitResponse.json();
  expect(visitResponse.status(), JSON.stringify(visitPayload)).toBe(201);
  const createdVisit = visitPayload.visit as { id: string; reference: string };
  visitIds.push(createdVisit.id);
  expect((await request.get(referenceImageUrl, { headers: customer.headers })).status()).toBe(200);
  expect((await request.get(referenceImageUrl, { headers: owner.headers })).status()).toBe(200);
  expect((await request.get(referenceImageUrl, { headers: otherCustomer.headers })).status()).toBe(404);
  const initialNotifications = await prisma.notification.findMany({ where: { userId: { in: [owner.id, customer.id] }, idempotencyKey: { startsWith: `store-visit:${createdVisit.id}:created` } } });
  expect(initialNotifications.filter((notice) => notice.userId === owner.id)).toHaveLength(1);
  expect(initialNotifications.filter((notice) => notice.userId === customer.id)).toHaveLength(1);

  const movedVisitSlot = await findAvailableSlot(request, "VISIT", visitSlot);
  expect(movedVisitSlot, "find a second available visit slot").toBeTruthy();
  const rescheduledVisit = await request.patch(`/api/account/store-visits/${createdVisit.id}`, { headers: customer.headers, data: { action: "reschedule", date: movedVisitSlot!.date, time: movedVisitSlot!.time } });
  expect(rescheduledVisit.status()).toBe(200);
  const visitReminders = await prisma.visitReminder.findMany({ where: { visitId: createdVisit.id }, select: { id: true, idempotencyKey: true, status: true } });
  expect(new Set(visitReminders.map((reminder) => reminder.idempotencyKey)).size).toBe(visitReminders.length);
  expect(visitReminders.some((reminder) => reminder.status === "SKIPPED")).toBe(true);
  expect(visitReminders.some((reminder) => reminder.status === "QUEUED")).toBe(true);
  const dueVisitReminder = visitReminders.find((reminder) => reminder.status === "QUEUED");
  expect(dueVisitReminder).toBeTruthy();
  await prisma.visitReminder.update({ where: { id: dueVisitReminder!.id }, data: { dueAt: new Date(Date.now() - 60_000) } });
  const cronHeaders = { authorization: `Bearer ${process.env.E2E_CRON_SECRET ?? "nrf-e2e-only-cron-secret"}` };
  const visitReminderRuns = await Promise.all([request.post("/api/cron/reminders", { headers: cronHeaders }), request.post("/api/cron/reminders", { headers: cronHeaders })]);
  expect(visitReminderRuns.map((response) => response.status())).toEqual([200, 200]);
  const visitReminderResults = await Promise.all(visitReminderRuns.map((response) => response.json()));
  expect(visitReminderResults.reduce((sum, result) => sum + result.visits.sent, 0)).toBe(1);
  const deliveredVisitReminder = await prisma.visitReminder.findUniqueOrThrow({ where: { id: dueVisitReminder!.id } });
  expect(deliveredVisitReminder.status).toBe("SENT");
  const repeatedVisitReminder = await request.post("/api/cron/reminders", { headers: cronHeaders });
  expect(repeatedVisitReminder.status()).toBe(200);
  expect((await repeatedVisitReminder.json()).visits.sent).toBe(0);
  const visitReminderNotices = await prisma.notification.findMany({ where: { idempotencyKey: { startsWith: `${dueVisitReminder!.idempotencyKey}:in-app:` } } });
  expect(visitReminderNotices.length).toBeGreaterThan(0);
  expect(new Set(visitReminderNotices.map((notice) => notice.idempotencyKey)).size).toBe(visitReminderNotices.length);

  const ownerVisits = await request.get("/api/owner/store-visits", { headers: owner.headers });
  expect(ownerVisits.status(), await ownerVisits.text()).toBe(200);
  expect((await ownerVisits.json()).visits.some((visit: { id: string }) => visit.id === createdVisit.id)).toBe(true);
  const assigned = await request.patch(`/api/owner/store-visits/${createdVisit.id}`, { headers: owner.headers, data: { status: "CONFIRMED", assignedStaffId: staff.id, internalNotes: "Owner-only audit note" } });
  expect(assigned.status()).toBe(200);
  const staffVisits = await request.get("/api/staff/store-visits", { headers: staff.headers });
  expect(staffVisits.status()).toBe(200);
  const assignedVisit = (await staffVisits.json()).visits.find((visit: { id: string }) => visit.id === createdVisit.id);
  expect(assignedVisit).toBeTruthy();
  expect((await request.get(referenceImageUrl, { headers: staff.headers })).status()).toBe(200);
  expect((await request.patch(`/api/staff/store-visits/${createdVisit.id}`, { headers: staff.headers, data: { status: "PREPARING" } })).status()).toBe(200);
  const ready = await request.patch(`/api/staff/store-visits/${createdVisit.id}`, { headers: staff.headers, data: { status: "READY", tasks: assignedVisit.tasks.map((task: { id: string }) => ({ id: task.id, completed: true })) } });
  expect(ready.status()).toBe(200);
  const customerVisits = await request.get("/api/store-visits", { headers: customer.headers });
  expect(customerVisits.status()).toBe(200);
  const customerVisit = (await customerVisits.json()).visits.find((visit: { id: string }) => visit.id === createdVisit.id);
  expect(customerVisit.status).toBe("READY");
  expect(customerVisit).not.toHaveProperty("history");
  expect(customerVisit).not.toHaveProperty("internalNotes");
  expect(customerVisit.tasks[0]).not.toHaveProperty("internalNote");
  const staffVisitNotices = await prisma.notification.findMany({ where: { userId: staff.id, idempotencyKey: { startsWith: `store-visit:${createdVisit.id}:` } } });
  expect(staffVisitNotices.length).toBeGreaterThan(0);

  const settings = await prisma.storeSettings.findUniqueOrThrow({ where: { id: "store" }, select: { allowCashOnPickup: true } });
  originalCashOnPickup = settings.allowCashOnPickup;
  await prisma.storeSettings.update({ where: { id: "store" }, data: { allowCashOnPickup: true } });
  const product = await prisma.product.create({ data: { sku: `E2E-${suffix}`, slug: `e2e-${suffix}`, name: "Audit pickup sample", description: "Temporary end-to-end test item", tags: ["e2e"], status: "PUBLISHED", variants: { create: { sku: `E2E-${suffix}-ONE`, title: "One size", pricePaise: 1000, stockOnHand: 2, isActive: true } } }, include: { variants: true } });
  productIds.push(product.id);
  const variant = product.variants[0];
  variantIds.push(variant.id);
  await prisma.inventoryMovement.create({ data: { variantId: variant.id, deltaOnHand: 2, reason: "e2e_initial_stock" } });
  const forbiddenImageUpload = await request.post(`/api/owner/products/${product.id}/images`, { headers: staff.headers, multipart: {
    file: { name: "forbidden.png", mimeType: "image/png", buffer: samplePng },
  } });
  expect(forbiddenImageUpload.status()).toBe(403);
  const productImageUpload = await request.post(`/api/owner/products/${product.id}/images`, { headers: owner.headers, multipart: {
    file: { name: "sample.png", mimeType: "image/png", buffer: samplePng },
    alt: "Temporary audit image",
    altHi: "अस्थायी जाँच चित्र",
  } });
  expect(productImageUpload.status(), await productImageUpload.text()).toBe(201);
  const productImage = (await productImageUpload.json()).image as { id: string; url: string; storageKey: string };
  productImageKeys.push(productImage.storageKey);
  expect(productImage.url).toContain("/new-raj-fashion/products/");
  const publicImageResponse = await request.get(productImage.url);
  expect(publicImageResponse.status()).toBe(200);
  expect(publicImageResponse.headers()["content-type"]).toContain("image/webp");
  expect((await publicImageResponse.body()).byteLength).toBeGreaterThan(0);
  const removeImage = await request.delete(`/api/owner/products/${product.id}/images`, { headers: owner.headers, data: { imageId: productImage.id } });
  expect(removeImage.status()).toBe(200);
  const cart = await prisma.cart.create({ data: { userId: customer.id, items: { create: { variantId: variant.id, quantity: 1 } } }, select: { id: true } });
  cartIds.push(cart.id);

  await page.context().addCookies([{ name: cookieName, value: customer.token, url: "http://localhost:3015", httpOnly: true, sameSite: "Lax" }, { name: "nrf_locale", value: "en", url: "http://localhost:3015", sameSite: "Lax" }]);
  await page.goto("/checkout");
  await expect(page.getByText("Home Delivery")).toBeVisible();
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: "हि" }).click();
  await expect(page.locator("html")).toHaveAttribute("lang", "hi-IN");
  await expect(page.getByText("घर पर डिलीवरी")).toBeVisible();
  await page.getByText("दुकान से प्राप्त करें").click();
  await expect(page.getByText("पिकअप की तारीख")).toBeVisible();
  await expect(page.getByText("पिकअप के समय नकद भुगतान")).toBeVisible();
  await expect(page.getByRole("button", { name: "ऑर्डर करें" })).toBeVisible();

  const pickupSlot = await findAvailableSlot(request, "PICKUP");
  expect(pickupSlot, "find an available store pickup slot in the next two weeks").toBeTruthy();
  await page.locator('input[type="date"]').fill(pickupSlot!.date);
  await expect(page.locator("select")).toContainText(pickupSlot!.time);
  await page.locator("select").selectOption(pickupSlot!.time);
  await expect(page.getByRole("button", { name: "ऑर्डर करें" })).toBeEnabled();
  await page.getByRole("button", { name: "ऑर्डर करें" }).click();
  await expect(page).toHaveURL(/\/order-confirmation\/[a-z0-9-]+/i);
  const orderId = new URL(page.url()).pathname.split("/").at(-1)!;
  const orderRecord = await prisma.order.findUniqueOrThrow({ where: { id: orderId }, select: { id: true, orderNumber: true } });
  const createdOrder = { orderId: orderRecord.id, orderNumber: orderRecord.orderNumber };
  orderIds.push(createdOrder.orderId);

  const movedPickupSlot = await findAvailableSlot(request, "PICKUP", pickupSlot);
  expect(movedPickupSlot, "find a second available pickup slot").toBeTruthy();
  const assignment = await request.patch(`/api/owner/store-pickups/${createdOrder.orderId}`, { headers: owner.headers, data: { assignedStaffId: staff.id, date: movedPickupSlot!.date, time: movedPickupSlot!.time } });
  expect(assignment.status()).toBe(200);
  const pickupReminders = await prisma.pickupReminder.findMany({ where: { fulfilment: { orderId: createdOrder.orderId } }, select: { id: true, idempotencyKey: true, status: true } });
  expect(new Set(pickupReminders.map((reminder) => reminder.idempotencyKey)).size).toBe(pickupReminders.length);
  expect(pickupReminders.some((reminder) => reminder.status === "SKIPPED")).toBe(true);
  expect(pickupReminders.some((reminder) => reminder.status === "QUEUED")).toBe(true);
  const duePickupReminder = pickupReminders.find((reminder) => reminder.status === "QUEUED");
  expect(duePickupReminder).toBeTruthy();
  await prisma.pickupReminder.update({ where: { id: duePickupReminder!.id }, data: { dueAt: new Date(Date.now() - 60_000) } });
  const pickupReminderRuns = await Promise.all([request.post("/api/cron/reminders", { headers: cronHeaders }), request.post("/api/cron/reminders", { headers: cronHeaders })]);
  expect(pickupReminderRuns.map((response) => response.status())).toEqual([200, 200]);
  const pickupReminderResults = await Promise.all(pickupReminderRuns.map((response) => response.json()));
  expect(pickupReminderResults.reduce((sum, result) => sum + result.pickups.sent, 0)).toBe(1);
  expect((await prisma.pickupReminder.findUniqueOrThrow({ where: { id: duePickupReminder!.id } })).status).toBe("SENT");
  const repeatedPickupReminder = await request.post("/api/cron/reminders", { headers: cronHeaders });
  expect(repeatedPickupReminder.status()).toBe(200);
  expect((await repeatedPickupReminder.json()).pickups.sent).toBe(0);
  const pickupReminderNotices = await prisma.notification.findMany({ where: { idempotencyKey: { startsWith: `${duePickupReminder!.idempotencyKey}:in-app:` } } });
  expect(pickupReminderNotices.length).toBeGreaterThan(0);
  expect(new Set(pickupReminderNotices.map((notice) => notice.idempotencyKey)).size).toBe(pickupReminderNotices.length);
  expect((await request.get("/api/staff/store-pickups", { headers: staff.headers })).status()).toBe(200);
  expect((await request.patch(`/api/staff/store-pickups/${createdOrder.orderId}`, { headers: staff.headers, data: { status: "PREPARING" } })).status()).toBe(200);
  expect((await request.patch(`/api/staff/store-pickups/${createdOrder.orderId}`, { headers: staff.headers, data: { status: "READY" } })).status()).toBe(200);

  await page.goto(`/account/orders/${createdOrder.orderId}`);
  await expect(page.getByText("दुकान से पिकअप").first()).toBeVisible();
  await expect(page.getByText("पिकअप की स्थिति:")).toBeVisible();
  await page.getByRole("button", { name: "पिकअप कोड प्राप्त करें" }).click();
  const pickupCodeText = page.locator("p.font-mono.text-3xl");
  await expect(pickupCodeText).toHaveText(/^\d{8}$/);
  const code = (await pickupCodeText.innerText()).trim();
  const ownerList = await request.get("/api/owner/store-pickups", { headers: owner.headers });
  const ownerOrder = (await ownerList.json()).orders.find((order: { id: string }) => order.id === createdOrder.orderId);
  expect(ownerOrder.fulfilment).not.toHaveProperty("pickupCodeHash");
  expect(ownerOrder.fulfilment).not.toHaveProperty("pickupCodeExpiresAt");
  const staffList = await request.get("/api/staff/store-pickups", { headers: staff.headers });
  const staffOrder = (await staffList.json()).orders.find((order: { id: string }) => order.id === createdOrder.orderId);
  expect(staffOrder).not.toHaveProperty("totalPaise");
  const handovers = await Promise.all([
    request.post(`/api/staff/store-pickups/${createdOrder.orderId}`, { headers: staff.headers, data: { code, cashCollected: true } }),
    request.post(`/api/staff/store-pickups/${createdOrder.orderId}`, { headers: staff.headers, data: { code, cashCollected: true } }),
  ]);
  expect(handovers.map((response) => response.status()).sort()).toEqual([200, 409]);

  const completedOrder = await prisma.order.findUniqueOrThrow({ where: { id: createdOrder.orderId }, include: { payments: true, fulfilment: true } });
  expect(completedOrder.paymentStatus).toBe("PAID");
  expect(completedOrder.fulfilmentStatus).toBe("DELIVERED");
  expect(completedOrder.fulfilment?.status).toBe("PICKED_UP");
  expect(completedOrder.fulfilment?.pickupCodeHash).toBeNull();
  expect(completedOrder.payments[0].status).toBe("PAID");
  const completedVariant = await prisma.productVariant.findUniqueOrThrow({ where: { id: variant.id }, select: { stockOnHand: true, stockReserved: true } });
  expect(completedVariant).toEqual({ stockOnHand: 1, stockReserved: 0 });
  const readyNotice = await prisma.notification.findFirst({ where: { userId: customer.id, templateKey: "store-pickup.update", idempotencyKey: { startsWith: `store-pickup:${createdOrder.orderId}:status:READY:` } } });
  const readyMessage = JSON.stringify(readyNotice?.payload ?? {});
  expect(readyMessage).toContain("Gandhi Chowk");
  expect(readyMessage).toContain("Audit pickup sample");
  expect(readyMessage).toContain("one-time code");
  const closedPickupReminders = await prisma.pickupReminder.findMany({ where: { fulfilment: { orderId: createdOrder.orderId } }, select: { idempotencyKey: true, status: true } });
  expect(new Set(closedPickupReminders.map((reminder) => reminder.idempotencyKey)).size).toBe(closedPickupReminders.length);
  expect(closedPickupReminders.length).toBeGreaterThan(0);
  expect(closedPickupReminders.some((reminder) => reminder.status === "SENT")).toBe(true);
  expect(closedPickupReminders.every((reminder) => reminder.status === "SENT" || reminder.status === "SKIPPED")).toBe(true);
});

test("authenticated customer, Owner and Staff pages render across both locales and themes", async ({ page }) => {
  test.setTimeout(180_000);
  const pagesByRole = [
    { role: "CUSTOMER" as const, routes: ["/account", "/account/addresses", "/account/orders", "/account/profile", "/account/preferences", "/account/security", "/account/sessions", "/account/store-visits", "/account/wishlist"] },
    { role: "OWNER" as const, routes: ["/shopkeeper/owner", "/shopkeeper/owner/audit-logs", "/shopkeeper/owner/banners", "/shopkeeper/owner/categories", "/shopkeeper/owner/customers", "/shopkeeper/owner/inventory", "/shopkeeper/owner/orders", "/shopkeeper/owner/payments", "/shopkeeper/owner/products", "/shopkeeper/owner/products/new", "/shopkeeper/owner/promotions", "/shopkeeper/owner/refunds", "/shopkeeper/owner/reports", "/shopkeeper/owner/reviews", "/shopkeeper/owner/settings", "/shopkeeper/owner/staff", "/shopkeeper/owner/store-pickups", "/shopkeeper/owner/store-visits", "/shopkeeper/owner/store-visits/calendar", "/shopkeeper/owner/support"] },
    { role: "STAFF" as const, routes: ["/shopkeeper/staff/dashboard", "/shopkeeper/staff/customers", "/shopkeeper/staff/inventory-view", "/shopkeeper/staff/orders", "/shopkeeper/staff/store-pickups", "/shopkeeper/staff/store-visits", "/shopkeeper/staff/support"] },
  ];

  for (const group of pagesByRole) {
    const actor = await createActor(group.role, group.role === "STAFF" ? { grantPermissions: ["customer.read"] } : {});
    for (const theme of ["light", "dark"] as const) {
      for (const locale of ["en", "hi"] as const) {
        await page.context().clearCookies();
        await page.context().addCookies([
          { name: cookieName, value: actor.token, url: "http://localhost:3015", httpOnly: true, sameSite: "Lax" },
          { name: "nrf_locale", value: locale, url: "http://localhost:3015", sameSite: "Lax" },
        ]);
        await page.goto("/");
        await page.evaluate(({ themeValue, localeValue }) => {
          localStorage.setItem("theme", themeValue);
          localStorage.setItem("nrf-locale", localeValue);
        }, { themeValue: theme, localeValue: locale });
        await page.reload();

        for (const route of group.routes) {
          const response = await page.goto(route);
          expect(response?.status() ?? 500, `${group.role} ${route} (${locale}, ${theme})`).toBeLessThan(500);
          expect(new URL(page.url()).pathname, `${group.role} should stay on ${route}`).toBe(route);
          await expect(page.locator("html"), `${route} locale`).toHaveAttribute("lang", locale === "hi" ? "hi-IN" : "en-IN");
          if (theme === "dark") await expect(page.locator("html"), `${route} dark theme`).toHaveClass(/dark/);
          else await expect(page.locator("html"), `${route} light theme`).not.toHaveClass(/dark/);
          const bodyText = (await page.locator("body").innerText()).trim();
          expect(bodyText.length, `${group.role} ${route} should render content`).toBeGreaterThan(20);
          if (locale === "hi") expect(bodyText, `${group.role} ${route} should contain Hindi UI text`).toMatch(/[\u0900-\u097F]{2,}/);
        }
      }
    }
  }
});
