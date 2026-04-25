import { z } from "zod";

export const webauthnRegistrationVerifySchema = z.object({
  name: z.string().max(128).optional(),
  response: z.any(), // RegistrationResponseJSON
});

export const webauthnAuthenticationOptionsSchema = z.object({
  email: z.string().email(),
});

export const webauthnAuthenticationVerifySchema = z.object({
  email: z.string().email(),
  response: z.any(), // AuthenticationResponseJSON
});
