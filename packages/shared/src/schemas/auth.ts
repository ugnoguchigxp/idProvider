import { z } from "zod";

const normalizedEmail = z
  .string()
  .trim()
  .email()
  .transform((value) => value.toLowerCase());

export const signupRequestSchema = z.object({
  email: normalizedEmail,
  password: z.string().min(12).max(128),
  displayName: z.string().trim().min(1).max(80),
});

export const loginRequestSchema = z.object({
  email: normalizedEmail,
  password: z.string().min(1).max(128),
});

export const refreshRequestSchema = z.object({
  refreshToken: z.string().min(16).max(1024),
});

export const oauthRevocationRequestSchema = z.object({
  token: z.string().min(16).max(1024),
});

export const oauthIntrospectionRequestSchema = z.object({
  token: z.string().min(16).max(1024),
});

export const authCheckRequestSchema = z.object({
  subject: z.string().min(1).optional(),
  action: z.string().min(1),
  resource: z.string().min(1),
  organizationId: z.string().uuid().optional(),
  groupId: z.string().uuid().optional(),
});

export const entitlementCheckRequestSchema = z.object({
  key: z.string().min(1).max(128),
  organizationId: z.string().uuid().optional(),
  groupId: z.string().uuid().optional(),
  quantity: z.coerce.number().int().positive().optional(),
});

export const mfaEnrollRequestSchema = z.object({}).passthrough();

export const mfaVerifyRequestSchema = z.object({
  factorId: z.string().uuid(),
  code: z.string().regex(/^\d{6}$/),
});

export const passwordChangeRequestSchema = z.object({
  currentPassword: z.string().min(8).max(128),
  newPassword: z.string().min(12).max(128),
});

export const passwordResetRequestSchema = z.object({
  email: normalizedEmail,
});

export const emailVerificationRequestSchema = z.object({
  email: normalizedEmail,
});

export const emailVerificationConfirmSchema = z.object({
  token: z.string().min(16).max(1024),
});

export const passwordResetConfirmRequestSchema = z.object({
  resetToken: z.string().min(16).max(1024),
  newPassword: z.string().min(12).max(128),
});

export const googleLoginRequestSchema = z.object({
  idToken: z.string().min(1),
});

export const googleLinkRequestSchema = z.object({
  idToken: z.string().min(1),
  currentPassword: z.string().min(8).max(128),
});

export const googleUnlinkRequestSchema = z.object({
  providerSubject: z.string().min(1).max(255),
  currentPassword: z.string().min(8).max(128),
});

export type SignupRequest = z.infer<typeof signupRequestSchema>;
export type LoginRequest = z.infer<typeof loginRequestSchema>;
export type RefreshRequest = z.infer<typeof refreshRequestSchema>;
export type AuthCheckRequest = z.infer<typeof authCheckRequestSchema>;
export type EntitlementCheckRequest = z.infer<
  typeof entitlementCheckRequestSchema
>;
export type MfaEnrollRequest = z.infer<typeof mfaEnrollRequestSchema>;
export type MfaVerifyRequest = z.infer<typeof mfaVerifyRequestSchema>;
export type GoogleLoginRequest = z.infer<typeof googleLoginRequestSchema>;
export type GoogleLinkRequest = z.infer<typeof googleLinkRequestSchema>;
export type GoogleUnlinkRequest = z.infer<typeof googleUnlinkRequestSchema>;
export type PasswordChangeRequest = z.infer<typeof passwordChangeRequestSchema>;
export type PasswordResetRequest = z.infer<typeof passwordResetRequestSchema>;
export type PasswordResetConfirmRequest = z.infer<
  typeof passwordResetConfirmRequestSchema
>;
export type EmailVerificationRequest = z.infer<
  typeof emailVerificationRequestSchema
>;
export type EmailVerificationConfirmRequest = z.infer<
  typeof emailVerificationConfirmSchema
>;
