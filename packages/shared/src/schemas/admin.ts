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

export type SocialLoginUpdate = z.infer<typeof socialLoginUpdateSchema>;
export type NotificationUpdate = z.infer<typeof notificationUpdateSchema>;
export type EmailTemplateUpdate = z.infer<typeof emailTemplateUpdateSchema>;
