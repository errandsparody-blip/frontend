/**
 * Auth Zod schemas — mirror file in usa-errands-api/src/common/schemas/auth.schema.ts.
 * KEEP IN SYNC. Both frontend and backend validate against this shape.
 */

import { z } from "zod";

export const passwordSchema = z
  .string()
  .min(12, "Password must be at least 12 characters.")
  .max(256, "Password must be at most 256 characters.");

export const emailSchema = z
  .string()
  .min(3)
  .max(254)
  .email("Enter a valid email address.")
  .transform((s) => s.trim().toLowerCase());

export const totpCodeSchema = z
  .string()
  .regex(/^\d{6}$/, "Enter the six-digit code from your authenticator app.");

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Password is required."),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const signupSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  businessName: z.string().min(2, "Business name is required.").max(120),
  country: z.string().length(2, "Use ISO country code (e.g., NG, US).").toUpperCase(),
});
export type SignupInput = z.infer<typeof signupSchema>;

export const verifyMfaSchema = z.object({
  challengeToken: z.string().min(20),
  code: totpCodeSchema,
});
export type VerifyMfaInput = z.infer<typeof verifyMfaSchema>;

export const forgotPasswordSchema = z.object({
  email: emailSchema,
});
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;

export const resetPasswordSchema = z.object({
  token: z.string().min(20),
  newPassword: passwordSchema,
  mfaCode: totpCodeSchema.optional(),
});
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
