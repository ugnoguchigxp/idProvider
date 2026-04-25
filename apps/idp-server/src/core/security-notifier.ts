import type { ConfigService } from "@idp/auth-core";
import type pino from "pino";

const inferLevel = (eventType: string): "Critical" | "Warning" => {
  if (eventType.includes("reuse_detected")) {
    return "Critical";
  }
  if (eventType.includes("signup") || eventType.includes("login")) {
    return "Warning";
  }
  return "Warning";
};

export const createSecurityNotifier = (
  configService: ConfigService,
  logger: pino.Logger,
) => {
  return async (event: {
    eventType: string;
    userId: string | null;
    payload: Record<string, unknown>;
  }) => {
    const settings = await configService.getNotificationConfig();
    const level = inferLevel(event.eventType);
    if (!settings.alertLevels.includes(level)) {
      return;
    }
    if (settings.notificationRecipients.length === 0) {
      return;
    }

    logger.warn(
      {
        event: "security.notification.queued",
        level,
        recipients: settings.notificationRecipients,
        securityEventType: event.eventType,
        userId: event.userId,
      },
      "security notification queued",
    );
  };
};
