import {
  and,
  type DbClient,
  type DbTransaction,
  eq,
  mfaFactors,
  withTransaction,
} from "@idp/db";
import { ApiError } from "@idp/shared";
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from "@simplewebauthn/server";
import type {
  AuthenticationResponseJSON,
  AuthenticatorTransportFuture,
  RegistrationResponseJSON,
  WebAuthnCredential,
} from "@simplewebauthn/types";
import type { RedisClient } from "./redis-client.js";

export type WebAuthnOptions = {
  rpName: string;
  rpID: string;
  origin: string;
  onSecurityEvent?: (event: {
    eventType: string;
    userId: string | null;
    payload: Record<string, unknown>;
  }) => Promise<void> | void;
};

export interface WebAuthnData {
  credentialID: string;
  credentialPublicKey: string;
  counter: number;
  transports?: AuthenticatorTransportFuture[];
}

export class WebAuthnService {
  constructor(
    private readonly db: DbClient,
    private readonly redis: RedisClient,
    private readonly options: WebAuthnOptions,
  ) {}

  private async runInTransaction<T>(
    handler: (tx: DbTransaction | DbClient) => Promise<T>,
  ): Promise<T> {
    if (typeof this.db.transaction === "function") {
      return withTransaction(this.db, handler);
    }
    return handler(this.db);
  }

  private getChallengeKey(
    userId: string,
    purpose: "registration" | "authentication",
  ): string {
    return `webauthn:challenge:${purpose}:${userId}`;
  }

  async generateRegistrationOptions(userId: string, userEmail: string) {
    const options = await generateRegistrationOptions({
      rpName: this.options.rpName,
      rpID: this.options.rpID,
      userID: Buffer.from(userId),
      userName: userEmail,
      attestationType: "none",
      authenticatorSelection: {
        residentKey: "required",
        userVerification: "required",
      },
    });

    // Store challenge in Redis for 5 minutes
    await this.redis.set(
      this.getChallengeKey(userId, "registration"),
      options.challenge,
      "EX",
      300,
    );

    return options;
  }

  async verifyRegistrationResponse(
    userId: string,
    body: RegistrationResponseJSON,
    name?: string,
  ) {
    const expectedChallenge = await this.redis.get(
      this.getChallengeKey(userId, "registration"),
    );

    if (!expectedChallenge) {
      throw new ApiError(
        400,
        "webauthn_challenge_expired",
        "Registration challenge expired or not found",
      );
    }

    const verification = await verifyRegistrationResponse({
      response: body,
      expectedChallenge,
      expectedOrigin: this.options.origin,
      expectedRPID: this.options.rpID,
    });

    if (!verification.verified || !verification.registrationInfo) {
      throw new ApiError(
        400,
        "webauthn_verification_failed",
        "WebAuthn registration verification failed",
      );
    }

    const { credential } = verification.registrationInfo;
    const {
      id: credentialID,
      publicKey: credentialPublicKey,
      counter,
      transports,
    } = credential;

    await this.runInTransaction(async (tx) => {
      await tx.insert(mfaFactors).values({
        userId,
        type: "webauthn",
        name: name ?? "Passkey",
        enabled: true,
        webauthnData: {
          credentialID: Buffer.from(credentialID).toString("base64url"),
          credentialPublicKey:
            Buffer.from(credentialPublicKey).toString("base64url"),
          counter,
          transports,
        } as WebAuthnData,
      });
    });

    await this.redis.del(this.getChallengeKey(userId, "registration"));

    void this.options.onSecurityEvent?.({
      eventType: "mfa.webauthn.registered",
      userId,
      payload: {
        credentialID: Buffer.from(credentialID).toString("base64url"),
        name: name ?? "Passkey",
      },
    });

    return { success: true };
  }

  async generateAuthenticationOptions(userId: string) {
    const options = await generateAuthenticationOptions({
      rpID: this.options.rpID,
      allowCredentials: [],
      userVerification: "required",
    });

    await this.redis.set(
      this.getChallengeKey(userId, "authentication"),
      options.challenge,
      "EX",
      300,
    );

    return options;
  }

  async verifyAuthenticationResponse(
    userId: string,
    body: AuthenticationResponseJSON,
  ) {
    const expectedChallenge = await this.redis.get(
      this.getChallengeKey(userId, "authentication"),
    );

    if (!expectedChallenge) {
      throw new ApiError(
        400,
        "webauthn_challenge_expired",
        "Authentication challenge expired or not found",
      );
    }

    const factors = await this.db
      .select()
      .from(mfaFactors)
      .where(
        and(
          eq(mfaFactors.userId, userId),
          eq(mfaFactors.type, "webauthn"),
          eq(mfaFactors.enabled, true),
        ),
      );

    const factor = factors.find((f) => {
      const data = f.webauthnData as unknown as WebAuthnData;
      return data.credentialID === body.id;
    });

    if (!factor) {
      throw new ApiError(
        404,
        "webauthn_credential_not_found",
        "Credential not found for this user",
      );
    }

    const data = factor.webauthnData as unknown as WebAuthnData;
    const credential = {
      id: data.credentialID,
      publicKey: Buffer.from(data.credentialPublicKey, "base64url"),
      counter: data.counter,
      ...(data.transports ? { transports: data.transports } : {}),
    } satisfies WebAuthnCredential;

    const verification = await verifyAuthenticationResponse({
      response: body,
      expectedChallenge,
      expectedOrigin: this.options.origin,
      expectedRPID: this.options.rpID,
      requireUserVerification: true,
      credential,
    });

    if (!verification.verified) {
      throw new ApiError(
        400,
        "webauthn_verification_failed",
        "WebAuthn authentication verification failed",
      );
    }

    await this.runInTransaction(async (tx) => {
      await tx
        .update(mfaFactors)
        .set({
          webauthnData: {
            ...data,
            counter: verification.authenticationInfo.newCounter,
          },
        })
        .where(eq(mfaFactors.id, factor.id));
    });

    await this.redis.del(this.getChallengeKey(userId, "authentication"));

    void this.options.onSecurityEvent?.({
      eventType: "mfa.webauthn.authenticated",
      userId,
      payload: {
        credentialID: data.credentialID,
        factorId: factor.id,
      },
    });

    return { success: true };
  }
}
