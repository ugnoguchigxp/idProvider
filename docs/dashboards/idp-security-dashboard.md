# IdP Security Dashboard

最終更新: 2026-04-26

## Panels
1. `login.failed` event trend
2. `refresh_token.reuse_detected` trend
3. `mfa.recovery_code.used` trend
4. `admin.config.updated` trend
5. `audit.export.generated` trend
6. `authorization/check` deny ratio (5m)
7. `entitlements/check` deny ratio (5m)
8. RBAC cache invalidation error count

## 目的
- 攻撃兆候を早期検知し、runbookへ接続すること

## Metric / Query Examples
1. Authorization deny ratio (5m)
```promql
sum(rate(idp_rbac_authorization_decision_total{result="denied"}[5m]))
/
clamp_min(sum(rate(idp_rbac_authorization_decision_total[5m])), 1)
```

2. Entitlement deny ratio (5m)
```promql
sum(rate(idp_rbac_entitlement_decision_total{result=~"not_entitled|limit_exceeded"}[5m]))
/
clamp_min(sum(rate(idp_rbac_entitlement_decision_total[5m])), 1)
```

3. RBAC cache invalidation error rate
```promql
sum(rate(idp_rbac_cache_invalidation_total{result="error"}[5m]))
```
