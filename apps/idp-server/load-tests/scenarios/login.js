import { check } from "k6";
import http from "k6/http";

const baseUrl = __ENV.BASE_URL || "http://localhost:3000";

export const options = {
  thresholds: {
    http_reqs: ["rate>200"],
    http_req_failed: ["rate<0.001"],
    http_req_duration: ["p(95)<200"],
  },
};

export default function () {
  const payload = JSON.stringify({
    email: "load-test@example.com",
    password: "password123456",
  });

  const res = http.post(`${baseUrl}/v1/login`, payload, {
    headers: { "Content-Type": "application/json" },
  });

  check(res, {
    "login status is 200 or 401": (r) => r.status === 200 || r.status === 401,
  });
}
