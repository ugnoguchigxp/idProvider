# Critical Alert Rules (IdP)

最終更新: 2026-04-26

## 1. 目的
高優先度インシデントを60秒以内に検知し、runbookへ即時接続する。

## 2. ルール
### AL-001: Login failure ratio spike
- Condition: `failed_logins / total_logins > 0.15` over 5m
- Severity: High
- Runbook: `RB-CRED-STUFFING`

### AL-002: Refresh token reuse detected
- Condition: `idp_refresh_reuse_detected_total increase > 0` over 5m
- Severity: Critical
- Runbook: `RB-TOKEN-REUSE`

### AL-003: OIDC dependency down
- Condition: `idp_dependency_up{dependency="oidc"} == 0`
- Severity: Critical
- Runbook: `RB-DR-RESTORE`

### AL-004: Admin high-risk configuration change surge
- Condition: `security_event_total{event_type="admin.config.updated"}` high burst
- Severity: High
- Runbook: `RB-ADMIN-CONFIG`

### AL-005: Bot challenge invalid spike
- Condition: `idp_bot_challenge_total{result="failed"} increase > threshold` over 5m
- Severity: High
- Runbook: `RB-BOT-MITIGATION`

### AL-006: Bot risk block triggered
- Condition: `idp_bot_block_total increase > 0` over 5m
- Severity: Critical
- Runbook: `RB-BOT-MITIGATION`

## 3. 運用ルール
- Criticalは即時ページング
- Highは5分以内に一次確認
- 誤検知時はしきい値変更履歴を残す
