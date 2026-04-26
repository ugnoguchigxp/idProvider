import { ConfigService } from "@idp/auth-core";
import {
  createDb,
  eq,
  oauthClientRedirectUris,
  oauthClientScopes,
  oauthClientSecrets,
  oauthClients,
  permissions,
  rolePermissions,
  roles,
  userEmails,
  userPasswords,
  userRoles,
  users,
} from "@idp/db";
import argon2 from "argon2";
import { hashPassword } from "./core/password.js";

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error("DATABASE_URL environment variable is required");
  process.exit(1);
}

const { db, pool } = createDb(DATABASE_URL);

async function seed() {
  console.log("🌱 Starting database seeding...");

  // 1. Roles
  console.log("  Creating roles...");
  const roleData = [
    { key: "admin", name: "Administrator" },
    { key: "user", name: "Standard User" },
    { key: "operator", name: "Operator" },
  ];

  for (const role of roleData) {
    await db
      .insert(roles)
      .values(role)
      .onConflictDoUpdate({
        target: roles.key,
        set: { name: role.name },
      });
  }

  // 2. Permissions
  console.log("  Creating permissions...");
  const permissionData = [
    { key: "admin:all" },
    { key: "user:me" },
    { key: "config:read" },
    { key: "config:write" },
  ];

  for (const perm of permissionData) {
    await db
      .insert(permissions)
      .values(perm)
      .onConflictDoUpdate({
        target: permissions.key,
        set: { key: perm.key },
      });
  }

  // 3. Role-Permission mapping
  console.log("  Mapping permissions to roles...");
  const adminRole = (
    await db.select().from(roles).where(eq(roles.key, "admin"))
  )[0];
  const userRole = (
    await db.select().from(roles).where(eq(roles.key, "user"))
  )[0];

  const allPerms = await db.select().from(permissions);

  if (adminRole) {
    for (const perm of allPerms) {
      await db
        .insert(rolePermissions)
        .values({
          roleId: adminRole.id,
          permissionId: perm.id,
        })
        .onConflictDoNothing();
    }
  }

  if (userRole) {
    const mePerm = allPerms.find((p) => p.key === "user:me");
    if (mePerm) {
      await db
        .insert(rolePermissions)
        .values({
          roleId: userRole.id,
          permissionId: mePerm.id,
        })
        .onConflictDoNothing();
    }
  }

  // 4. System Configs
  console.log("  Seeding system configs...");
  const configService = new ConfigService(db);
  await configService.updateSocialLoginConfig("google", {
    providerEnabled: true,
    clientId: process.env.GOOGLE_CLIENT_ID || "dummy-client-id",
    clientSecret: process.env.GOOGLE_CLIENT_SECRET || "dummy-client-secret",
  });

  await configService.updateEmailTemplateConfig("signup_verify", {
    subject: "【gxp-idProvider】メールアドレスの確認",
    body: "以下のトークンを入力して、メールアドレスの確認を完了してください：\n\n{{token}}",
  });

  await configService.updateEmailTemplateConfig("password_reset", {
    subject: "【gxp-idProvider】パスワードリセットのご案内",
    body: "以下のトークンを使用して、パスワードをリセットしてください：\n\n{{token}}",
  });

  // 4.5 OAuth Clients
  console.log("  Seeding oauth clients...");
  const seedClientId = process.env.OAUTH_CLIENT_ID || "local-client";
  const seedClientSecret =
    process.env.OAUTH_CLIENT_SECRET || "local-client-secret";
  const [seedClient] = await db
    .insert(oauthClients)
    .values({
      clientId: seedClientId,
      name: "Local Default Client",
      clientType: "confidential",
      tokenEndpointAuthMethod: "client_secret_basic",
      status: "active",
    })
    .onConflictDoUpdate({
      target: oauthClients.clientId,
      set: {
        name: "Local Default Client",
        status: "active",
        updatedAt: new Date(),
      },
    })
    .returning();
  if (!seedClient) {
    throw new Error("Failed to create or update seed oauth client");
  }

  const existingSecret = await db
    .select()
    .from(oauthClientSecrets)
    .where(eq(oauthClientSecrets.clientPkId, seedClient.id))
    .limit(1);
  if (existingSecret.length === 0) {
    await db.insert(oauthClientSecrets).values({
      clientPkId: seedClient.id,
      secretHash: await hashPassword(seedClientSecret),
      secretHint: seedClientSecret.slice(-4),
      isPrimary: true,
    });
  }

  const defaultScopes = ["openid", "profile", "email"];
  for (const scope of defaultScopes) {
    await db
      .insert(oauthClientScopes)
      .values({
        clientPkId: seedClient.id,
        scope,
      })
      .onConflictDoNothing();
  }

  const defaultRedirectUris = (
    process.env.OIDC_CLIENT_REDIRECT_URIS || "http://localhost:5173/callback"
  )
    .split(",")
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
  for (const redirectUri of defaultRedirectUris) {
    await db
      .insert(oauthClientRedirectUris)
      .values({
        clientPkId: seedClient.id,
        redirectUri,
      })
      .onConflictDoNothing();
  }

  // 5. Test Users
  console.log("  Creating test users...");
  const testUsers = [
    {
      email: "admin@example.com",
      password: "Password123!",
      role: "admin",
      displayName: "Admin User",
    },
    {
      email: "user@example.com",
      password: "Password123!",
      role: "user",
      displayName: "Normal User",
    },
  ];

  for (const testUser of testUsers) {
    const existingEmail = await db
      .select()
      .from(userEmails)
      .where(eq(userEmails.email, testUser.email))
      .limit(1);
    if (existingEmail.length > 0) {
      console.log(`  User ${testUser.email} already exists, skipping.`);
      continue;
    }

    const [u] = await db.insert(users).values({ status: "active" }).returning();
    if (!u) {
      throw new Error(`Failed to create seed user: ${testUser.email}`);
    }

    await db.insert(userEmails).values({
      userId: u.id,
      email: testUser.email,
      isPrimary: true,
      isVerified: true,
    });

    const passwordHash = await argon2.hash(testUser.password);
    await db.insert(userPasswords).values({
      userId: u.id,
      passwordHash,
    });

    const role = (
      await db.select().from(roles).where(eq(roles.key, testUser.role))
    )[0];
    if (role) {
      await db.insert(userRoles).values({
        userId: u.id,
        roleId: role.id,
      });
    }
    console.log(`  Created user: ${testUser.email}`);
  }

  console.log("✅ Seeding completed!");
}

seed()
  .catch((e) => {
    console.error("❌ Seeding failed:");
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await pool.end();
  });
