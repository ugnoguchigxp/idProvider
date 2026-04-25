import { z } from "zod";

export const accountDeletionRequestSchema = z
  .object({
    currentPassword: z.string().min(8).max(128).optional(),
    mfaCode: z
      .string()
      .regex(/^\d{6}$/)
      .optional(),
    mfaFactorId: z.string().uuid().optional(),
  })
  .superRefine((data, ctx) => {
    const hasMfaCode = Boolean(data.mfaCode);
    const hasMfaFactorId = Boolean(data.mfaFactorId);
    if (hasMfaCode !== hasMfaFactorId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "mfaCode and mfaFactorId must be provided together",
        path: hasMfaCode ? ["mfaFactorId"] : ["mfaCode"],
      });
    }
  });

export const accountDeletionResponseSchema = z.object({
  status: z.string(),
  deletionDueAt: z.string().datetime(),
});

export type AccountDeletionRequest = z.infer<
  typeof accountDeletionRequestSchema
>;
export type AccountDeletionResponse = z.infer<
  typeof accountDeletionResponseSchema
>;
