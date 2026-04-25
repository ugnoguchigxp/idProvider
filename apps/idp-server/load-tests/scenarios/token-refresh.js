import { check } from "k6";
import http from "k6/http";

const baseUrl = __ENV.BASE_URL || "http://localhost:3000";
const authHeader = __ENV.BASIC_AUTH || "Basic Y2xpZW50OnNlY3JldA==";

export const options = {
  thresholds: {
    http_reqs: ["rate>500"],
    http_req_failed: ["rate<0.0001"],
    http_req_duration: ["p(95)<100"],
  },
};

export default function () {
  const payload = JSON.stringify({
    refreshToken: __ENV.REFRESH_TOKEN || "dummy_refresh_token_value",
  });

  const res = http.post(`${baseUrl}/oauth/token`, payload, {
    headers: {
      "Content-Type": "application/json",
      Authorization: authHeader,
    },
  });

  check(res, {
    "token endpoint status is 200 or 401": (r) =>
      r.status === 200 || r.status === 401,
  });
}
