import { z } from "zod";

export const profileSchema = z.object({ fullName: z.string().trim().min(1).max(120) });

export const addressSchema = z.object({
  label: z.string().trim().min(1).max(40),
  recipient: z.string().trim().min(1).max(120),
  line1: z.string().trim().min(1).max(180),
  line2: z.string().trim().max(180).optional().nullable(),
  city: z.string().trim().min(1).max(80),
  state: z.string().trim().min(1).max(80),
  postalCode: z.string().trim().regex(/^[1-9][0-9]{5}$/, "Enter a valid 6-digit Indian PIN code."),
  phone: z.string().trim().max(20).optional().nullable(),
  isDefault: z.boolean().default(false),
});
