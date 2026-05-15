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
  // Mirrors the backend literal check — the vendor MUST positively click the
  // agreement checkbox before signup. The backend stamps
  // agreementAcceptedAt + agreementVersion onto the new Vendor row on the
  // strength of this boolean, so the AgreementVersionGuard sees the vendor
  // as up-to-date at first login (no /legal/vendor-agreement?reaccept=1
  // bounce). Keep both schemas in sync.
  agreementAccepted: z.literal(true, {
    errorMap: () => ({
      message: "You must accept the Vendor Agreement to continue.",
    }),
  }),
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
  // The MFA input is only rendered after the API responds with mfa_required,
  // but the form initializes mfaCode to "" so React Hook Form has a defined
  // default value. Plain `.optional()` would still run the regex on the
  // empty string and fail validation — silently, because the field isn't
  // mounted to surface the error — leaving the Update password button doing
  // nothing. Coerce "" to undefined so the optional path is honoured.
  mfaCode: totpCodeSchema
    .optional()
    .or(z.literal("").transform(() => undefined)),
});
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;

export const verifyEmailCodeSchema = z
  .string()
  // Accept the historical 6-digit codes still in flight at the time
  // of the M-4 hardening rollout, plus the new 8-digit codes going
  // forward. Once every 6-digit code in storage has expired (~15min
  // after deploy), the regex can be tightened to `^\d{8}$`.
  .regex(/^\d{6,8}$/, "Enter the code from your email.");

export const verifyEmailSchema = z.object({
  email: emailSchema,
  code: verifyEmailCodeSchema,
});
export type VerifyEmailInput = z.infer<typeof verifyEmailSchema>;
