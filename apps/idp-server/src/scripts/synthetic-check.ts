type CheckResult = {
  name: string;
  ok: boolean;
  status?: number;
  detail?: string;
};

const baseUrl = process.env.SYNTHETIC_BASE_URL ?? "http://localhost:3000";
const timeoutMs = Number(process.env.SYNTHETIC_TIMEOUT_MS ?? "5000");
const loginEmail = process.env.SYNTHETIC_LOGIN_EMAIL;
const loginPassword = process.env.SYNTHETIC_LOGIN_PASSWORD;

const withTimeout = async (input: RequestInfo | URL, init?: RequestInit) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
};

const checkGet = async (name: string, path: string): Promise<CheckResult> => {
  try {
    const response = await withTimeout(`${baseUrl}${path}`);
    return {
      name,
      ok: response.ok,
      status: response.status,
      detail: response.ok ? "ok" : "non-2xx response",
    };
  } catch (error: unknown) {
    return {
      name,
      ok: false,
      detail: error instanceof Error ? error.message : "unknown error",
    };
  }
};

const checkLogin = async (): Promise<CheckResult> => {
  if (!loginEmail || !loginPassword) {
    return {
      name: "login",
      ok: false,
      detail:
        "SYNTHETIC_LOGIN_EMAIL/SYNTHETIC_LOGIN_PASSWORD are required for login check",
    };
  }

  try {
    const response = await withTimeout(`${baseUrl}/v1/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: loginEmail,
        password: loginPassword,
      }),
    });

    return {
      name: "login",
      ok: response.status === 200,
      status: response.status,
      detail: response.status === 200 ? "ok" : "non-200 response",
    };
  } catch (error: unknown) {
    return {
      name: "login",
      ok: false,
      detail: error instanceof Error ? error.message : "unknown error",
    };
  }
};

const main = async () => {
  const results = await Promise.all([
    checkGet("openid-configuration", "/.well-known/openid-configuration"),
    checkGet("jwks", "/.well-known/jwks.json"),
    checkLogin(),
  ]);

  for (const result of results) {
    const status = result.status ? ` status=${result.status}` : "";
    const detail = result.detail ? ` detail="${result.detail}"` : "";
    console.log(
      `[synthetic] ${result.ok ? "PASS" : "FAIL"} check=${result.name}${status}${detail}`,
    );
  }

  const failed = results.filter((result) => !result.ok);
  if (failed.length > 0) {
    process.exitCode = 1;
  }
};

await main();
