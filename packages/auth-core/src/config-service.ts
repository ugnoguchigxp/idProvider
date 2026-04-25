import { type DbClient, systemConfigs } from "@idp/db";
import { eq } from "drizzle-orm";

export type SocialLoginConfig = {
  providerEnabled: boolean;
  clientId: string;
  clientSecret: string;
};

export type NotificationConfig = {
  notificationRecipients: string[];
  alertLevels: Array<"Critical" | "Warning">;
};

export type EmailTemplateConfig = {
  subject: string;
  body: string;
};

const DEFAULT_SOCIAL_LOGIN_CONFIG: SocialLoginConfig = {
  providerEnabled: true,
  clientId: "",
  clientSecret: "",
};

const DEFAULT_NOTIFICATION_CONFIG: NotificationConfig = {
  notificationRecipients: [],
  alertLevels: ["Critical"],
};

const DEFAULT_EMAIL_TEMPLATE_CONFIG: EmailTemplateConfig = {
  subject: "",
  body: "",
};

const EMAIL_TEMPLATE_CONFIG_PREFIX = "email_templates.";

export class ConfigService {
  constructor(private readonly db: DbClient) {}

  private async upsertConfig(key: string, value: unknown): Promise<void> {
    await this.db
      .insert(systemConfigs)
      .values({ key, value, updatedAt: new Date() })
      .onConflictDoUpdate({
        target: systemConfigs.key,
        set: { value, updatedAt: new Date() },
      });
  }

  private async getConfig<T>(key: string, fallback: T): Promise<T> {
    const rows = await this.db
      .select({ value: systemConfigs.value })
      .from(systemConfigs)
      .where(eq(systemConfigs.key, key))
      .limit(1);
    const row = rows[0];
    if (!row) {
      return fallback;
    }
    return row.value as T;
  }

  async getSocialLoginConfig(provider: "google"): Promise<SocialLoginConfig> {
    return this.getConfig(
      `social_login.${provider}`,
      DEFAULT_SOCIAL_LOGIN_CONFIG,
    );
  }

  async updateSocialLoginConfig(
    provider: "google",
    value: SocialLoginConfig,
  ): Promise<void> {
    await this.upsertConfig(`social_login.${provider}`, value);
  }

  async getNotificationConfig(): Promise<NotificationConfig> {
    return this.getConfig("notifications", DEFAULT_NOTIFICATION_CONFIG);
  }

  async updateNotificationConfig(value: NotificationConfig): Promise<void> {
    await this.upsertConfig("notifications", value);
  }

  async getEmailTemplateConfig(
    templateKey: string,
  ): Promise<EmailTemplateConfig> {
    return this.getConfig(
      `${EMAIL_TEMPLATE_CONFIG_PREFIX}${templateKey}`,
      DEFAULT_EMAIL_TEMPLATE_CONFIG,
    );
  }

  async updateEmailTemplateConfig(
    templateKey: string,
    value: EmailTemplateConfig,
  ): Promise<void> {
    await this.upsertConfig(
      `${EMAIL_TEMPLATE_CONFIG_PREFIX}${templateKey}`,
      value,
    );
  }
}
