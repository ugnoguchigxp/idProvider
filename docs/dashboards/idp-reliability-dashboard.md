# IdP Reliability Dashboard

最終更新: 2026-04-26

## Panels
1. Login success ratio (5m)
2. `/v1/login` p95 latency
3. HTTP 5xx rate by route
4. Dependency health (`db`, `redis`, `oidc`)
5. OIDC discovery error count

## 目的
- On-callが5分以内に障害影響を把握できること
