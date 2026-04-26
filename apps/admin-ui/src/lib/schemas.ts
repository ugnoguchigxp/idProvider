import { z } from "zod";

export const socialLoginUpdateSchema = z.object({
  providerEnabled: z.boolean(),
  clientId: z.string().trim().min(1).max(255),
  clientSecret: z.string().trim().min(1).max(255),
});

export type SocialLoginUpdateInput = z.infer<typeof socialLoginUpdateSchema>;

export const socialLoginConfigSchema = z.object({
  providerEnabled: z.boolean().default(false),
  clientId: z.string().default(""),
  clientSecret: z.string().default(""),
});

export const adminConfigsResponseSchema = z.object({
  socialLogin: z.object({
    google: socialLoginConfigSchema,
  }),
});

export const authorizationCheckResponseSchema = z.object({
  allowed: z.boolean(),
  permissionKey: z.string(),
  source: z.string().nullable().optional(),
});

export type AdminConfigsResponse = z.infer<typeof adminConfigsResponseSchema>;
export type AuthorizationCheckResponse = z.infer<
  typeof authorizationCheckResponseSchema
>;
