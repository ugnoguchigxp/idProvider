import { HttpResponse, http } from "msw";

export const handlers = [
  http.post("http://localhost:3000/v1/signup", async () =>
    HttpResponse.json(
      { status: "accepted", user: { userId: "u1", email: "user@example.com" } },
      { status: 200 },
    ),
  ),
  http.post("http://localhost:3000/v1/login", async () =>
    HttpResponse.json(
      {
        status: "ok",
        userId: "u1",
        accessToken: "at_mock",
        refreshToken: "rt_mock",
        mfaEnabled: false,
        mfaWarning: "MFA required",
      },
      { status: 200 },
    ),
  ),
  http.post("http://localhost:3000/v1/email/verify/request", async () =>
    HttpResponse.json(
      { status: "accepted", token: "ev_mock" },
      { status: 200 },
    ),
  ),
  http.post("http://localhost:3000/v1/email/verify/confirm", async () =>
    HttpResponse.json({ status: "ok" }, { status: 200 }),
  ),
  http.post("http://localhost:3000/oauth/token", async () =>
    HttpResponse.json(
      {
        token_type: "Bearer",
        access_token: "at_rotated",
        refresh_token: "rt_rotated",
        expires_in: 900,
      },
      { status: 200 },
    ),
  ),
  http.post("http://localhost:3000/v1/authorization/check", async () =>
    HttpResponse.json(
      { allowed: false, permissionKey: "resource:action" },
      { status: 200 },
    ),
  ),
  http.post("http://localhost:3000/v1/entitlements/check", async () =>
    HttpResponse.json(
      { granted: true, key: "api_access", source: "user", value: true },
      { status: 200 },
    ),
  ),
  http.post("http://localhost:3000/oauth/introspection", async () =>
    HttpResponse.json({ active: false }, { status: 200 }),
  ),
];
