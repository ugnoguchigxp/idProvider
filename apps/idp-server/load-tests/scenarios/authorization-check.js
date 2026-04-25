import { check } from "k6";
import http from "k6/http";

const baseUrl = __ENV.BASE_URL || "http://localhost:3000";
const accessToken = __ENV.ACCESS_TOKEN || "dummy_access_token";

export const options = {
  thresholds: {
    http_reqs: ["rate>1000"],
    http_req_failed: ["rate<0.00001"],
    http_req_duration: ["p(95)<50"],
  },
};

export default function () {
  const res = http.get(`${baseUrl}/v1/me`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  check(res, {
    "authorization status is 200 or 403": (r) =>
      r.status === 200 || r.status === 403,
  });
}
