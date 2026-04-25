import { z } from "zod";

export const revokeSessionRequestSchema = z.object({
  sessionId: z.string().uuid(),
});

export const emptyRequestSchema = z.object({}).passthrough();

export type RevokeSessionRequest = z.infer<typeof revokeSessionRequestSchema>;
export type EmptyRequest = z.infer<typeof emptyRequestSchema>;
