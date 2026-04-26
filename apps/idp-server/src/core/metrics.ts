import {
  Counter,
  collectDefaultMetrics,
  Gauge,
  Histogram,
  Registry,
} from "prom-client";

type DependencyName = "db" | "redis" | "oidc";

type LoginResult = "success" | "failed";
type BotChallengeResult = "passed" | "failed" | "missing" | "error";
type BotProtectedEndpoint =
  | "signup"
  | "login"
  | "google_login"
  | "password_reset";
type RbacCacheType = "auth" | "ent";
type RbacCacheOperation = "get" | "set" | "del";
type RbacAuthorizationResult = "allowed" | "denied";
type RbacEntitlementResult = "allowed" | "not_entitled" | "limit_exceeded";
type RbacInvalidationTarget = "user" | "all";

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

const botChallengeTotal = new Counter({
  name: `${METRIC_PREFIX}bot_challenge_total`,
  help: "Bot challenge verification results",
  labelNames: ["endpoint", "result"],
  registers: [register],
});

const botBlockTotal = new Counter({
  name: `${METRIC_PREFIX}bot_block_total`,
  help: "Bot mitigation request blocks by endpoint",
  labelNames: ["endpoint"],
  registers: [register],
});

const rbacCacheHitTotal = new Counter({
  name: `${METRIC_PREFIX}rbac_cache_hit_total`,
  help: "RBAC cache hit count",
  labelNames: ["type"],
  registers: [register],
});

const rbacCacheMissTotal = new Counter({
  name: `${METRIC_PREFIX}rbac_cache_miss_total`,
  help: "RBAC cache miss count",
  labelNames: ["type"],
  registers: [register],
});

const rbacCacheErrorTotal = new Counter({
  name: `${METRIC_PREFIX}rbac_cache_error_total`,
  help: "RBAC cache operation errors",
  labelNames: ["operation"],
  registers: [register],
});

const rbacCacheLookupDurationSeconds = new Histogram({
  name: `${METRIC_PREFIX}rbac_cache_lookup_duration_seconds`,
  help: "RBAC cache lookup duration in seconds",
  labelNames: ["type"],
  buckets: [0.001, 0.003, 0.005, 0.01, 0.03, 0.05, 0.1],
  registers: [register],
});

const rbacAuthorizationDecisionTotal = new Counter({
  name: `${METRIC_PREFIX}rbac_authorization_decision_total`,
  help: "Authorization decision count",
  labelNames: ["result"],
  registers: [register],
});

const rbacEntitlementDecisionTotal = new Counter({
  name: `${METRIC_PREFIX}rbac_entitlement_decision_total`,
  help: "Entitlement decision count",
  labelNames: ["result"],
  registers: [register],
});

const rbacCacheInvalidationTotal = new Counter({
  name: `${METRIC_PREFIX}rbac_cache_invalidation_total`,
  help: "RBAC cache invalidation result count",
  labelNames: ["target", "result"],
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

export const recordBotChallengeResult = (input: {
  endpoint: BotProtectedEndpoint;
  result: BotChallengeResult;
}) => {
  botChallengeTotal.inc({
    endpoint: input.endpoint,
    result: input.result,
  });
};

export const recordBotBlock = (endpoint: BotProtectedEndpoint) => {
  botBlockTotal.inc({ endpoint });
};

export const recordRbacCacheHit = (type: RbacCacheType) => {
  rbacCacheHitTotal.inc({ type });
};

export const recordRbacCacheMiss = (type: RbacCacheType) => {
  rbacCacheMissTotal.inc({ type });
};

export const recordRbacCacheError = (operation: RbacCacheOperation) => {
  rbacCacheErrorTotal.inc({ operation });
};

export const observeRbacCacheLookupDuration = (
  type: RbacCacheType,
  durationSeconds: number,
) => {
  rbacCacheLookupDurationSeconds.observe({ type }, durationSeconds);
};

export const recordRbacAuthorizationDecision = (
  result: RbacAuthorizationResult,
) => {
  rbacAuthorizationDecisionTotal.inc({ result });
};

export const recordRbacEntitlementDecision = (
  result: RbacEntitlementResult,
) => {
  rbacEntitlementDecisionTotal.inc({ result });
};

export const recordRbacCacheInvalidation = (input: {
  target: RbacInvalidationTarget;
  result: "success" | "error";
}) => {
  rbacCacheInvalidationTotal.inc({
    target: input.target,
    result: input.result,
  });
};

export const metricsRegistry = register;

export const metricsContentType = register.contentType;

export const renderMetrics = async () => register.metrics();
