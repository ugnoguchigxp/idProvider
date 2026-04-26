export type TurnstileVerifyInput = {
  verifyUrl: string;
  secretKey: string;
  token: string;
  remoteIp: string | null;
  idempotencyKey: string;
};

export type TurnstileVerifyResponse = {
  success: boolean;
  action?: string;
  hostname?: string;
  challenge_ts?: string;
  "error-codes"?: string[];
};

export type TurnstileVerifyResult = {
  ok: boolean;
  action?: string;
  hostname?: string;
  errorCodes: string[];
};

export const verifyTurnstileToken = async (
  input: TurnstileVerifyInput,
): Promise<TurnstileVerifyResult> => {
  const formData = new URLSearchParams();
  formData.set("secret", input.secretKey);
  formData.set("response", input.token);
  if (input.remoteIp) {
    formData.set("remoteip", input.remoteIp);
  }
  formData.set("idempotency_key", input.idempotencyKey);

  const response = await fetch(input.verifyUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: formData,
  });

  const payload = (await response.json()) as TurnstileVerifyResponse;
  const result: TurnstileVerifyResult = {
    ok: Boolean(payload.success),
    errorCodes: Array.isArray(payload["error-codes"])
      ? payload["error-codes"]
      : [],
  };
  if (payload.action) {
    result.action = payload.action;
  }
  if (payload.hostname) {
    result.hostname = payload.hostname;
  }
  return result;
};
