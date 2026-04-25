import pino from "pino";

export const createLogger = (level: "debug" | "info" | "warn" | "error") =>
  pino({
    level,
    base: null,
    redact: {
      paths: [
        "req.headers.authorization",
        "req.headers.cookie",
        "password",
        "token",
        "secret",
      ],
      censor: "[REDACTED]",
    },
    timestamp: pino.stdTimeFunctions.isoTime,
  });
