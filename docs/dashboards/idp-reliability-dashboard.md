# IdP Reliability Dashboard

最終更新: 2026-04-26

## Panels
1. Login success ratio (5m)
2. `/v1/login` p95 latency
3. HTTP 5xx rate by route
4. Dependency health (`db`, `redis`, `oidc`)
5. OIDC discovery error count
6. `authorization/check` p95 latency
7. `entitlements/check` p95 latency
8. RBAC cache hit ratio (`auth` / `ent`)

## 目的
- On-callが5分以内に障害影響を把握できること

## Metric / Query Examples
1. `authorization/check` p95 latency
```promql
histogram_quantile(
  0.95,
  sum by (le) (
    rate(idp_http_request_duration_seconds_bucket{route="/v1/authorization/check"}[5m])
  )
)
```

2. `entitlements/check` p95 latency
```promql
histogram_quantile(
  0.95,
  sum by (le) (
    rate(idp_http_request_duration_seconds_bucket{route="/v1/entitlements/check"}[5m])
  )
)
```

3. RBAC auth cache hit ratio
```promql
sum(rate(idp_rbac_cache_hit_total{type="auth"}[5m]))
/
clamp_min(
  sum(rate(idp_rbac_cache_hit_total{type="auth"}[5m])) +
  sum(rate(idp_rbac_cache_miss_total{type="auth"}[5m])),
  1
)
```

4. RBAC entitlement cache hit ratio
```promql
sum(rate(idp_rbac_cache_hit_total{type="ent"}[5m]))
/
clamp_min(
  sum(rate(idp_rbac_cache_hit_total{type="ent"}[5m])) +
  sum(rate(idp_rbac_cache_miss_total{type="ent"}[5m])),
  1
)
```
