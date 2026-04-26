import {
  Counter,
  collectDefaultMetrics,
  Gauge,
  Histogram,
  Registry,
} from "prom-client";

type DependencyName = "db" | "redis" | "oidc";

type LoginResult = "success" | "failed";

const METRIC_PREFIX = "idp_";

const normalizePath = (path: string): string =>
  path
    .replace(
      /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi,
      ":id",
    )
    .replace(/\b\d+\b/g, ":num")
    .replace(/\b[a-zA-Z0-9_-]{24,}\b/g, ":token");

const toStatusClass = (statusCode: number): string => {
  const statusClass = Math.floor(statusCode / 100);
  return `${statusClass}xx`;
};

const register = new Registry();

collectDefaultMetrics({
  register,
  prefix: METRIC_PREFIX,
});

const httpRequestTotal = new Counter({
  name: `${METRIC_PREFIX}http_requests_total`,
  help: "Total number of HTTP requests",
  labelNames: ["method", "route", "status"],
  registers: [register],
});

const httpRequestDurationSeconds = new Histogram({
  name: `${METRIC_PREFIX}http_request_duration_seconds`,
  help: "HTTP request duration in seconds",
  labelNames: ["method", "route", "status"],
  buckets: [0.01, 0.03, 0.05, 0.1, 0.2, 0.3, 0.5, 1, 2, 5],
  registers: [register],
});

const authLoginTotal = new Counter({
  name: `${METRIC_PREFIX}auth_login_total`,
  help: "Login attempts by result",
  labelNames: ["result", "mfa"],
  registers: [register],
});

const securityEventTotal = new Counter({
  name: `${METRIC_PREFIX}security_event_total`,
  help: "Security events written",
  labelNames: ["event_type"],
  registers: [register],
});

const refreshReuseDetectedTotal = new Counter({
  name: `${METRIC_PREFIX}refresh_reuse_detected_total`,
  help: "Refresh token reuse detections",
  registers: [register],
});

const dependencyUp = new Gauge({
  name: `${METRIC_PREFIX}dependency_up`,
  help: "Dependency health state (1=up,0=down)",
  labelNames: ["dependency"],
  registers: [register],
});

const dependencyErrorsTotal = new Counter({
  name: `${METRIC_PREFIX}dependency_errors_total`,
  help: "Dependency errors by dependency",
  labelNames: ["dependency"],
  registers: [register],
});

export const observeHttpRequest = (input: {
  method: string;
  path: string;
  statusCode: number;
  durationSeconds: number;
}) => {
  const labels = {
    method: input.method,
    route: normalizePath(input.path),
    status: toStatusClass(input.statusCode),
  };
  httpRequestTotal.inc(labels);
  httpRequestDurationSeconds.observe(labels, input.durationSeconds);
};

export const recordLoginResult = (input: {
  result: LoginResult;
  mfaEnabled: boolean;
}) => {
  authLoginTotal.inc({
    result: input.result,
    mfa: input.mfaEnabled ? "enabled" : "disabled",
  });
};

export const recordSecurityEventMetric = (eventType: string) => {
  securityEventTotal.inc({ event_type: eventType });
  if (eventType === "refresh_token.reuse_detected") {
    refreshReuseDetectedTotal.inc();
  }
};

export const markDependencyUp = (dependency: DependencyName) => {
  dependencyUp.set({ dependency }, 1);
};

export const markDependencyDown = (dependency: DependencyName) => {
  dependencyUp.set({ dependency }, 0);
};

export const recordDependencyError = (dependency: DependencyName) => {
  dependencyErrorsTotal.inc({ dependency });
};

export const metricsRegistry = register;

export const metricsContentType = register.contentType;

export const renderMetrics = async () => register.metrics();
