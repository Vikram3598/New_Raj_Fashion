import { NextResponse } from "next/server";
import { z } from "zod";
import { IdentityType, OtpPurpose } from "@prisma/client";
import { issueOtp } from "@/lib/auth/otp";
import { normalizeEmail, normalizePhone } from "@/lib/normalize";

const schema = z.object({
  destination: z.string().min(3),
  channel: z.enum(["EMAIL", "PHONE"]),
  purpose: z.enum(["SIGNUP", "LOGIN", "RESET_PASSWORD", "VERIFY_IDENTITY"]),
});

export async function POST(req: Request) {
  const body = schema.safeParse(await req.json());
  if (!body.success) return NextResponse.json({ error: "Unable to send a verification code." }, { status: 400 });
  const destination =
    body.data.channel === "EMAIL" ? normalizeEmail(body.data.destination) : normalizePhone(body.data.destination);
  const ip = req.headers.get("x-forwarded-for") ?? "unknown";
  try {
    const { challengeId } = await issueOtp({
      destination,
      destinationType: body.data.channel as IdentityType,
      purpose: body.data.purpose as OtpPurpose,
      ipAddress: ip,
    });
    return NextResponse.json({ challengeId });
  } catch {
    return NextResponse.json({ error: "Unable to send a verification code right now." }, { status: 429 });
  }
}
