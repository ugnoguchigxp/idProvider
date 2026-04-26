import {
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  randomUUID,
} from "node:crypto";
import {
  and,
  asc,
  type DbClient,
  desc,
  eq,
  gt,
  isNull,
  or,
  signingKeys,
  withTransaction,
} from "@idp/db";

type Jwk = Record<string, unknown>;

type JsonWebKeySet = {
  keys: Jwk[];
};

export type KeyStoreOptions = {
  rotationIntervalHours: number;
  gracePeriodHours: number;
};

type RotationReason = "bootstrap" | "scheduled" | "manual" | "emergency";

const nowPlusHours = (hours: number): Date =>
  new Date(Date.now() + hours * 60 * 60 * 1000);

const createRsaKeyPair = () => {
  const { privateKey, publicKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
    publicKeyEncoding: { type: "pkcs1", format: "pem" },
    privateKeyEncoding: { type: "pkcs1", format: "pem" },
  });

  return { privateKeyPem: privateKey, publicKeyPem: publicKey };
};

const publicJwkFromPem = (publicKeyPem: string, kid: string, alg: string) => {
  const publicKey = createPublicKey(publicKeyPem);
  const jwk = publicKey.export({ format: "jwk" }) as Jwk;
  return {
    ...jwk,
    use: "sig",
    alg,
    kid,
  };
};

const privateJwkFromPem = (
  privateKeyPem: string,
  kid: string,
  alg: string,
): Jwk => {
  const privateKey = createPrivateKey(privateKeyPem);
  const jwk = privateKey.export({ format: "jwk" }) as Jwk;
  return {
    ...jwk,
    alg,
    kid,
    use: "sig",
  };
};

export class KeyStoreService {
  constructor(
    private readonly db: DbClient,
    private readonly options: KeyStoreOptions,
  ) {}

  private async getCurrentActiveKey() {
    const rows = await this.db
      .select({
        kid: signingKeys.kid,
        alg: signingKeys.alg,
        privateKeyPem: signingKeys.privateKeyPem,
        publicKeyPem: signingKeys.publicKeyPem,
        createdAt: signingKeys.createdAt,
      })
      .from(signingKeys)
      .where(
        and(
          eq(signingKeys.isActive, true),
          isNull(signingKeys.expiresAt),
          isNull(signingKeys.revokedAt),
        ),
      )
      .orderBy(desc(signingKeys.createdAt))
      .limit(1);

    return rows[0] ?? null;
  }

  async ensureKeyExists() {
    const current = await this.getCurrentActiveKey();
    if (current) {
      return current;
    }

    const keyPair = createRsaKeyPair();
    const kid = randomUUID();

    await this.db.insert(signingKeys).values({
      kid,
      alg: "RS256",
      privateKeyPem: keyPair.privateKeyPem,
      publicKeyPem: keyPair.publicKeyPem,
      isActive: true,
      rotationReason: "bootstrap",
    });

    const created = await this.getCurrentActiveKey();
    if (!created) {
      throw new Error("failed_to_create_signing_key");
    }

    return created;
  }

  private async rotateNow(
    reason: Exclude<RotationReason, "bootstrap">,
    actorUserId?: string,
  ) {
    const active = await this.ensureKeyExists();
    const next = createRsaKeyPair();
    const nextKid = randomUUID();

    const rotated = await withTransaction(this.db, async (tx) => {
      const deactivateSet =
        reason === "emergency"
          ? {
              isActive: false,
              expiresAt: new Date(),
              revokedAt: new Date(),
              rotationReason: reason,
              rotatedBy: actorUserId ?? null,
            }
          : {
              isActive: false,
              expiresAt: nowPlusHours(this.options.gracePeriodHours),
              rotationReason: reason,
              rotatedBy: actorUserId ?? null,
            };

      const updated = await tx
        .update(signingKeys)
        .set(deactivateSet)
        .where(
          and(
            eq(signingKeys.kid, active.kid),
            eq(signingKeys.isActive, true),
            isNull(signingKeys.revokedAt),
          ),
        )
        .returning({ kid: signingKeys.kid });

      if (updated.length === 0) {
        return null;
      }

      await tx.insert(signingKeys).values({
        kid: nextKid,
        alg: "RS256",
        privateKeyPem: next.privateKeyPem,
        publicKeyPem: next.publicKeyPem,
        isActive: true,
        rotatedFromKid: active.kid,
        rotationReason: reason,
        rotatedBy: actorUserId ?? null,
      });

      return {
        rotated: true as const,
        activeKid: nextKid,
        previousKid: active.kid,
        reason,
      };
    });

    if (!rotated) {
      const latest = await this.ensureKeyExists();
      return {
        rotated: false as const,
        activeKid: latest.kid,
        reason,
      };
    }

    return rotated;
  }

  async rotateIfDue() {
    const active = await this.ensureKeyExists();
    const dueAt = new Date(
      active.createdAt.getTime() +
        this.options.rotationIntervalHours * 60 * 60 * 1000,
    );

    if (Date.now() < dueAt.getTime()) {
      return {
        rotated: false as const,
        activeKid: active.kid,
        reason: "scheduled" as const,
      };
    }

    return this.rotateNow("scheduled");
  }

  async rotateManual(actorUserId?: string) {
    return this.rotateNow("manual", actorUserId);
  }

  async rotateEmergency(actorUserId?: string) {
    return this.rotateNow("emergency", actorUserId);
  }

  async listKeys() {
    const rows = await this.db
      .select({
        kid: signingKeys.kid,
        alg: signingKeys.alg,
        isActive: signingKeys.isActive,
        rotatedFromKid: signingKeys.rotatedFromKid,
        rotationReason: signingKeys.rotationReason,
        createdAt: signingKeys.createdAt,
        expiresAt: signingKeys.expiresAt,
        revokedAt: signingKeys.revokedAt,
      })
      .from(signingKeys)
      .orderBy(desc(signingKeys.createdAt));

    return rows.map((row) => {
      let state: "active" | "grace" | "revoked" = "grace";
      if (row.revokedAt) {
        state = "revoked";
      } else if (row.isActive) {
        state = "active";
      }

      return {
        ...row,
        state,
      };
    });
  }

  async getPublicJwks(): Promise<JsonWebKeySet> {
    await this.ensureKeyExists();

    const rows = await this.db
      .select({
        kid: signingKeys.kid,
        alg: signingKeys.alg,
        publicKeyPem: signingKeys.publicKeyPem,
      })
      .from(signingKeys)
      .where(
        and(
          isNull(signingKeys.revokedAt),
          or(
            eq(signingKeys.isActive, true),
            gt(signingKeys.expiresAt, new Date()),
          ),
        ),
      )
      .orderBy(desc(signingKeys.isActive), asc(signingKeys.createdAt));

    return {
      keys: rows.map((row) =>
        publicJwkFromPem(row.publicKeyPem, row.kid, row.alg),
      ),
    };
  }

  async getActivePrivateJwks(): Promise<JsonWebKeySet> {
    const active = await this.ensureKeyExists();
    return {
      keys: [privateJwkFromPem(active.privateKeyPem, active.kid, active.alg)],
    };
  }
}
