# Observability・Security Monitoring計画

## 目的
本番運用で障害・攻撃・異常利用を検知できるIdPにする。

## 背景
認証基盤は止まると全サービスに影響する。また攻撃対象になりやすいため、通常のAPMだけでなくセキュリティ監視が必要。

## 対象
- Structured logs
- Metrics
- Tracing
- SLO/SLI
- Alert rules
- Security event stream
- Dashboard
- Runbook link

## 主要メトリクス
- login success/failure rate
- signup rate
- MFA failure rate
- WebAuthn failure rate
- password reset request rate
- token refresh/reuse detection
- OAuth client auth failure
- RBAC deny rate
- latency p50/p95/p99
- DB/Redis error rate

## セキュリティ検知例
- Credential stuffing spike
- MFA recovery abuse
- impossible travel候補
- token reuse detection
- admin config変更
- key rotation実行
- Google link/unlink急増

## フェーズ
1. Event/metric naming conventionを決める。
2. pino logsへtrace/request/security contextを追加する。
3. Prometheus/OpenTelemetry exportを追加する。
4. Dashboardを作る。
5. Alert ruleとrunbookを紐づける。
6. synthetic checkを追加する。

## 受け入れ条件
- 主要認証フローの成功率/失敗率/latencyが見える。
- 重大security eventがalertされる。
- alertからrunbookへ辿れる。
- 本番障害時に依存先(DB/Redis/email/OIDC)の切り分けができる。

## 優先度
中高。本番運用での安心感に直結する。
