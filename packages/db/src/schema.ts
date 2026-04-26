import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  status: varchar("status", { length: 32 }).notNull().default("active"),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
  deletionRequestedAt: timestamp("deletion_requested_at", {
    withTimezone: true,
  }),
  deletionDueAt: timestamp("deletion_due_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const userEmails = pgTable(
  "user_emails",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    email: varchar("email", { length: 320 }).notNull(),
    isPrimary: boolean("is_primary").notNull().default(true),
    isVerified: boolean("is_verified").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    emailUnique: unique("user_emails_email_key").on(table.email),
    userEmailIdx: index("user_emails_user_id_idx").on(table.userId),
  }),
);

export const userPasswords = pgTable("user_passwords", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  passwordHash: text("password_hash").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const userProfiles = pgTable(
  "user_profiles",
  {
    userId: uuid("user_id")
      .primaryKey()
      .references(() => users.id, { onDelete: "cascade" }),
    displayName: varchar("display_name", { length: 80 }),
    givenName: varchar("given_name", { length: 80 }),
    familyName: varchar("family_name", { length: 80 }),
    preferredUsername: varchar("preferred_username", { length: 64 }),
    locale: varchar("locale", { length: 35 }),
    zoneinfo: varchar("zoneinfo", { length: 64 }),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    preferredUsernameLowerUnique: uniqueIndex(
      "user_profiles_preferred_username_lower_key",
    )
      .on(sql`lower(${table.preferredUsername})`)
      .where(sql`${table.preferredUsername} IS NOT NULL`),
  }),
);

export const mfaFactors = pgTable(
  "mfa_factors",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: varchar("type", { length: 32 }).notNull().default("totp"),
    name: varchar("name", { length: 128 }),
    secret: text("secret"),
    webauthnData: jsonb("webauthn_data"),
    enabled: boolean("enabled").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    userIdIdx: index("mfa_factors_user_id_idx").on(table.userId),
  }),
);

export const mfaRecoveryCodes = pgTable(
  "mfa_recovery_codes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    batchId: uuid("batch_id").notNull(),
    lookupHash: text("lookup_hash").notNull(),
    codeHash: text("code_hash").notNull(),
    lastChars: varchar("last_chars", { length: 8 }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    userIdIdx: index("mfa_recovery_codes_user_id_idx").on(table.userId),
    lookupHashUnique: unique("mfa_recovery_codes_lookup_hash_key").on(
      table.lookupHash,
    ),
    activeBatchIdx: index("mfa_recovery_codes_active_batch_idx")
      .on(table.userId, table.batchId)
      .where(sql`${table.usedAt} IS NULL AND ${table.revokedAt} IS NULL`),
  }),
);

export const externalIdentities = pgTable(
  "external_identities",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    provider: varchar("provider", { length: 32 }).notNull(),
    providerSubject: varchar("provider_subject", { length: 255 }).notNull(),
    email: varchar("email", { length: 320 }),
    isEmailVerified: boolean("is_email_verified").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    providerSubjectUnique: unique(
      "external_identities_provider_subject_key",
    ).on(table.provider, table.providerSubject),
  }),
);

export const userSessions = pgTable(
  "user_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    accessTokenHash: text("access_token_hash").notNull(),
    refreshTokenHash: text("refresh_token_hash").notNull(),
    ipAddress: varchar("ip_address", { length: 64 }),
    userAgent: text("user_agent"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    refreshExpiresAt: timestamp("refresh_expires_at", {
      withTimezone: true,
    }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    accessHashUnique: unique("user_sessions_access_token_hash_key").on(
      table.accessTokenHash,
    ),
    refreshHashUnique: unique("user_sessions_refresh_token_hash_key").on(
      table.refreshTokenHash,
    ),
    userSessionsUserIdIdx: index("user_sessions_user_id_idx").on(table.userId),
  }),
);

export const loginAttempts = pgTable("login_attempts", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: varchar("email", { length: 320 }).notNull(),
  success: boolean("success").notNull(),
  reason: varchar("reason", { length: 128 }),
  ipAddress: varchar("ip_address", { length: 64 }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const passwordResetTokens = pgTable(
  "password_reset_tokens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    tokenHashUnique: unique("password_reset_tokens_token_hash_key").on(
      table.tokenHash,
    ),
  }),
);

export const emailVerificationTokens = pgTable(
  "email_verification_tokens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    tokenHashUnique: unique("email_verification_tokens_token_hash_key").on(
      table.tokenHash,
    ),
  }),
);

export const roles = pgTable("roles", {
  id: uuid("id").primaryKey().defaultRandom(),
  key: varchar("key", { length: 64 }).notNull().unique(),
  name: varchar("name", { length: 128 }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const permissions = pgTable("permissions", {
  id: uuid("id").primaryKey().defaultRandom(),
  key: varchar("key", { length: 128 }).notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const rolePermissions = pgTable(
  "role_permissions",
  {
    roleId: uuid("role_id")
      .notNull()
      .references(() => roles.id, { onDelete: "cascade" }),
    permissionId: uuid("permission_id")
      .notNull()
      .references(() => permissions.id, { onDelete: "cascade" }),
  },
  (table) => ({
    rolePermissionUnique: unique("role_permissions_unique").on(
      table.roleId,
      table.permissionId,
    ),
  }),
);

export const userRoles = pgTable(
  "user_roles",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    roleId: uuid("role_id")
      .notNull()
      .references(() => roles.id, { onDelete: "cascade" }),
  },
  (table) => ({
    userRoleUnique: unique("user_roles_unique").on(table.userId, table.roleId),
  }),
);

export const organizations = pgTable("organizations", {
  id: uuid("id").primaryKey().defaultRandom(),
  key: varchar("key", { length: 64 }).notNull().unique(),
  name: varchar("name", { length: 128 }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const groups = pgTable(
  "groups",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    key: varchar("key", { length: 64 }).notNull(),
    name: varchar("name", { length: 128 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    groupOrgKeyUnique: unique("groups_org_key_unique").on(
      table.organizationId,
      table.key,
    ),
    groupsOrganizationIdIdx: index("groups_organization_id_idx").on(
      table.organizationId,
    ),
  }),
);

export const groupMemberships = pgTable(
  "group_memberships",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    groupId: uuid("group_id")
      .notNull()
      .references(() => groups.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    groupMembershipUnique: unique("group_memberships_unique").on(
      table.userId,
      table.groupId,
    ),
    groupMembershipUserIdIdx: index("group_memberships_user_id_idx").on(
      table.userId,
    ),
    groupMembershipGroupIdIdx: index("group_memberships_group_id_idx").on(
      table.groupId,
    ),
  }),
);

export const groupRoles = pgTable(
  "group_roles",
  {
    groupId: uuid("group_id")
      .notNull()
      .references(() => groups.id, { onDelete: "cascade" }),
    roleId: uuid("role_id")
      .notNull()
      .references(() => roles.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    groupRoleUnique: unique("group_roles_unique").on(
      table.groupId,
      table.roleId,
    ),
  }),
);

export const entitlements = pgTable(
  "entitlements",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    key: varchar("key", { length: 128 }).notNull(),
    enabled: boolean("enabled").notNull().default(true),
    value: jsonb("value").notNull().default({}),
    userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }),
    groupId: uuid("group_id").references(() => groups.id, {
      onDelete: "cascade",
    }),
    organizationId: uuid("organization_id").references(() => organizations.id, {
      onDelete: "cascade",
    }),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    entitlementsKeyIdx: index("entitlements_key_idx").on(table.key),
    entitlementsUserIdIdx: index("entitlements_user_id_idx").on(table.userId),
    entitlementsGroupIdIdx: index("entitlements_group_id_idx").on(
      table.groupId,
    ),
    entitlementsOrganizationIdIdx: index("entitlements_organization_id_idx").on(
      table.organizationId,
    ),
  }),
);

export const securityEvents = pgTable("security_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
  eventType: varchar("event_type", { length: 128 }).notNull(),
  payload: jsonb("payload").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const auditLogs = pgTable("audit_logs", {
  id: uuid("id").primaryKey().defaultRandom(),
  actorUserId: uuid("actor_user_id").references(() => users.id, {
    onDelete: "set null",
  }),
  action: varchar("action", { length: 128 }).notNull(),
  resourceType: varchar("resource_type", { length: 64 }).notNull(),
  resourceId: varchar("resource_id", { length: 128 }),
  payload: jsonb("payload").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const signingKeys = pgTable("signing_keys", {
  kid: varchar("kid", { length: 128 }).primaryKey(),
  alg: varchar("alg", { length: 16 }).notNull().default("RS256"),
  privateKeyPem: text("private_key_pem").notNull(),
  publicKeyPem: text("public_key_pem").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  rotatedFromKid: varchar("rotated_from_kid", { length: 128 }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
});

export const legalHolds = pgTable(
  "legal_holds",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    reason: text("reason").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    legalHoldsUserIdIdx: index("legal_holds_user_id_idx").on(table.userId),
    legalHoldsExpiresAtIdx: index("legal_holds_expires_at_idx").on(
      table.expiresAt,
    ),
  }),
);

export const systemConfigs = pgTable("system_configs", {
  key: varchar("key", { length: 128 }).primaryKey(),
  value: jsonb("value").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const oauthClients = pgTable(
  "oauth_clients",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clientId: varchar("client_id", { length: 128 }).notNull(),
    name: varchar("name", { length: 160 }).notNull(),
    clientType: varchar("client_type", { length: 32 })
      .notNull()
      .default("confidential"),
    tokenEndpointAuthMethod: varchar("token_endpoint_auth_method", {
      length: 64,
    })
      .notNull()
      .default("client_secret_basic"),
    status: varchar("status", { length: 32 }).notNull().default("active"),
    accessTokenTtlSeconds: integer("access_token_ttl_seconds"),
    refreshTokenTtlSeconds: integer("refresh_token_ttl_seconds"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    oauthClientsClientIdUnique: unique("oauth_clients_client_id_key").on(
      table.clientId,
    ),
    oauthClientsStatusIdx: index("oauth_clients_status_idx").on(table.status),
  }),
);

export const oauthClientSecrets = pgTable(
  "oauth_client_secrets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clientPkId: uuid("client_pk_id")
      .notNull()
      .references(() => oauthClients.id, { onDelete: "cascade" }),
    secretHash: text("secret_hash").notNull(),
    secretHint: varchar("secret_hint", { length: 16 }).notNull(),
    isPrimary: boolean("is_primary").notNull().default(false),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    graceUntil: timestamp("grace_until", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    oauthClientSecretsClientPrimaryIdx: index(
      "oauth_client_secrets_client_primary_idx",
    ).on(table.clientPkId, table.isPrimary),
    oauthClientSecretsClientRevokedIdx: index(
      "oauth_client_secrets_client_revoked_idx",
    ).on(table.clientPkId, table.revokedAt),
  }),
);

export const oauthClientRedirectUris = pgTable(
  "oauth_client_redirect_uris",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clientPkId: uuid("client_pk_id")
      .notNull()
      .references(() => oauthClients.id, { onDelete: "cascade" }),
    redirectUri: text("redirect_uri").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    oauthClientRedirectUrisUnique: unique(
      "oauth_client_redirect_uris_client_uri_key",
    ).on(table.clientPkId, table.redirectUri),
  }),
);

export const oauthClientScopes = pgTable(
  "oauth_client_scopes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clientPkId: uuid("client_pk_id")
      .notNull()
      .references(() => oauthClients.id, { onDelete: "cascade" }),
    scope: varchar("scope", { length: 128 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    oauthClientScopesUnique: unique("oauth_client_scopes_client_scope_key").on(
      table.clientPkId,
      table.scope,
    ),
  }),
);

export const oauthClientAuditLogs = pgTable(
  "oauth_client_audit_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clientPkId: uuid("client_pk_id").references(() => oauthClients.id, {
      onDelete: "set null",
    }),
    actorUserId: uuid("actor_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    eventType: varchar("event_type", { length: 64 }).notNull(),
    payload: jsonb("payload").notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    oauthClientAuditLogsClientCreatedAtIdx: index(
      "oauth_client_audit_logs_client_created_at_idx",
    ).on(table.clientPkId, table.createdAt),
  }),
);
