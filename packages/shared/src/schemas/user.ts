import { z } from "zod";

const hasControlCharacters = /[\p{Cc}\p{Cf}]/u;

const noControlCharacters = (value: string) =>
  !hasControlCharacters.test(value);

const profileTextField = z
  .string()
  .trim()
  .min(1)
  .max(80)
  .refine(noControlCharacters, "Control characters are not allowed");

const preferredUsernamePattern =
  /^(?!.*[._-]{2})(?!.*[._-]$)[a-z0-9][a-z0-9._-]{2,63}$/;

const supportedTimezones =
  typeof Intl.supportedValuesOf === "function"
    ? new Set(Intl.supportedValuesOf("timeZone"))
    : new Set<string>();

const fallbackTimezones = new Set([
  "UTC",
  "Asia/Tokyo",
  "America/New_York",
  "Europe/London",
]);

const canonicalLocale = z
  .string()
  .trim()
  .min(1)
  .max(35)
  .transform((value, ctx) => {
    try {
      return new Intl.Locale(value).toString();
    } catch {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Invalid locale",
      });
      return z.NEVER;
    }
  });

const canonicalTimezone = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .refine(
    (value) => supportedTimezones.has(value) || fallbackTimezones.has(value),
    "Invalid zoneinfo",
  );

export const updateUserProfileRequestSchema = z
  .object({
    displayName: profileTextField.optional(),
    givenName: profileTextField.optional(),
    familyName: profileTextField.optional(),
    preferredUsername: z
      .string()
      .trim()
      .toLowerCase()
      .regex(preferredUsernamePattern, "Invalid preferredUsername")
      .optional(),
    locale: canonicalLocale.optional(),
    zoneinfo: canonicalTimezone.optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one profile field is required",
  });

export type UpdateUserProfileRequest = z.infer<
  typeof updateUserProfileRequestSchema
>;
