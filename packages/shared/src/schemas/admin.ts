import { z } from "zod";

const email = z
  .string()
  .trim()
  .email()
  .transform((v) => v.toLowerCase());
const csv = z.string().transform((value) =>
  value
    .split(",")
    .map((v) => v.trim())
    .filter((v) => v.length > 0),
);

export const socialLoginUpdateSchema = z.object({
  providerEnabled: z
    .union([z.boolean(), z.string(), z.array(z.string())])
    .transform((value) => {
      if (typeof value === "boolean") {
        return value;
      }
      if (Array.isArray(value)) {
        return value.some((v) => v === "true" || v === "on");
      }
      return value === "true" || value === "on";
    }),
  clientId: z.string().trim().max(255),
  clientSecret: z.string().trim().max(255),
});

export const notificationUpdateSchema = z.object({
  notificationRecipients: z
    .union([z.array(email), csv])
    .transform((value) => value.map((v) => email.parse(v)))
    .pipe(z.array(email).max(50)),
  alertLevels: z
    .union([z.array(z.enum(["Critical", "Warning"])), csv])
    .transform((value) =>
      value.map((v) => z.enum(["Critical", "Warning"]).parse(v)),
    )
    .pipe(
      z
        .array(z.enum(["Critical", "Warning"]))
        .min(1)
        .max(2),
    ),
});

export const emailTemplateUpdateSchema = z.object({
  templateKey: z.string().trim().min(1).max(128),
  subject: z.string().trim().min(1).max(200),
  body: z.string().min(1).max(20000),
});

const oauthClientTypeSchema = z.enum(["confidential", "public"]);
const oauthTokenEndpointAuthMethodSchema = z.enum(["client_secret_basic"]);

export const oauthClientCreateSchema = z.object({
  clientId: z
    .string()
    .trim()
    .min(3)
    .max(128)
    .regex(/^[A-Za-z0-9._:-]+$/)
    .optional(),
  name: z.string().trim().min(1).max(160),
  clientType: oauthClientTypeSchema.default("confidential"),
  tokenEndpointAuthMethod: oauthTokenEndpointAuthMethodSchema.default(
    "client_secret_basic",
  ),
  redirectUris: z.array(z.string().url()).max(50).default([]),
  allowedScopes: z
    .array(z.string().trim().min(1).max(128))
    .max(100)
    .default([]),
  accessTokenTtlSeconds: z.coerce.number().int().positive().optional(),
  refreshTokenTtlSeconds: z.coerce.number().int().positive().optional(),
});

export const oauthClientUpdateSchema = z
  .object({
    name: z.string().trim().min(1).max(160).optional(),
    status: z.enum(["active", "disabled"]).optional(),
    redirectUris: z.array(z.string().url()).max(50).optional(),
    allowedScopes: z
      .array(z.string().trim().min(1).max(128))
      .max(100)
      .optional(),
    accessTokenTtlSeconds: z.coerce
      .number()
      .int()
      .positive()
      .nullable()
      .optional(),
    refreshTokenTtlSeconds: z.coerce
      .number()
      .int()
      .positive()
      .nullable()
      .optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one update field is required",
  });

export const oauthClientRotateSecretSchema = z.object({
  gracePeriodDays: z.coerce.number().int().min(0).max(90).default(7),
});

export type SocialLoginUpdate = z.infer<typeof socialLoginUpdateSchema>;
export type NotificationUpdate = z.infer<typeof notificationUpdateSchema>;
export type EmailTemplateUpdate = z.infer<typeof emailTemplateUpdateSchema>;
export type OAuthClientCreate = z.infer<typeof oauthClientCreateSchema>;
export type OAuthClientUpdate = z.infer<typeof oauthClientUpdateSchema>;
export type OAuthClientRotateSecret = z.infer<
  typeof oauthClientRotateSecretSchema
>;
