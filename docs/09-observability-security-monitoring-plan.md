# 09. Observability・Security Monitoring 実装計画

最終更新: 2026-04-26
ステータス: Ready for Implementation
優先度: P1

## 1. 目的
B2C向けIdPとして、障害・攻撃・性能劣化を「利用者影響が顕在化する前」に検知し、15分以内に切り分けできる運用基盤を整備する。

達成したい状態:
- 認証コアフローの成功率/遅延/エラー率が時系列で可視化される
- 重要 security event が運用アラートに接続される
- アラートから runbook へ直接遷移できる
- DB/Redis/外部IdP/通知基盤のどこで詰まっているかを短時間で特定できる

## 2. 現状整理（2026-04-26）
### 2.1 実装済み
- `pino` による構造化ログ（secret redact 設定あり）
- OpenTelemetry trace export（HTTP/PG/Redis instrumentation）
- `security_events` のイベント蓄積と event catalog/runbook の整備
- 主要APIのテスト・契約テスト基盤

### 2.2 ギャップ
1. Prometheus向けメトリクス収集・公開エンドポイントがない
2. SLI/SLO定義が具体数値で固定されていない
3. Alert rule と runbook の機械可読な対応表がない
4. 監査・セキュリティ運用ダッシュボードが未定義
5. 合成監視（synthetic check）が未整備

## 3. 完了定義（Definition of Done）
- [ ] 認証系SLI（成功率/レイテンシ/依存先エラー）を収集できる
- [ ] `/metrics` でPrometheus scrape可能
- [ ] 主要security eventのアラートルールが定義される
- [ ] アラート→runbook対応表がドキュメント化される
- [ ] 最低2種類のダッシュボード（Reliability/Security）が定義される
- [ ] 合成監視（discovery, jwks, login）を導入する
- [ ] `pnpm verify` が通る

## 4. スコープ
### 4.1 対象
- `apps/idp-server/src/middleware/*`（HTTP計測）
- `apps/idp-server/src/core/logger.ts`
- `apps/idp-server/src/tracing.ts`
- `apps/idp-server/src/app.ts`（`/metrics` mount）
- `apps/idp-server/src/modules/auth/*`（重要フローのカウンタ/ヒストグラム）
- `docs/security-event-catalog.md`
- `docs/security-runbook.md`
- `docs/incident-response-checklist.md`
- `docs/openapi.yaml`（必要な監視APIが増える場合）

### 4.2 対象外
- SIEM製品の選定・契約
- APMベンダーロックイン設定
- Policy Engine/Tenant境界設計（`docs/b2c-authorization-and-boundary-strategy.md` に集約済み）

## 5. 設計方針
### 5.1 B2C向け優先順位
1. 可用性（ログイン成功率・遅延）
2. 攻撃検知（credential stuffing, token replay, MFA abuse）
3. 監査性（06計画で実装済みの監査検索/完全性との接続）

### 5.2 観測データ3層
- Logs: 事象の詳細（request_id, user_id, outcome）
- Metrics: しきい値監視（rate, latency, error ratio）
- Traces: 依存先ボトルネック分析（DB/Redis/OIDC）

### 5.3 命名規約
- メトリクス prefix: `idp_`
- カウンタ: `idp_auth_login_total{result="success|failed"}`
- ヒストグラム: `idp_http_request_duration_seconds{route,method,status}`
- ゲージ: `idp_dependency_up{dependency="db|redis|oidc"}`

## 6. 実装タスク（着手順）
### Task 1: Metrics基盤導入
対象:
- `apps/idp-server/package.json`
- `apps/idp-server/src/core/metrics.ts`（新規）
- `apps/idp-server/src/app.ts`

内容:
- `prom-client` を導入
- Registry初期化、共通ラベル（service, env）
- `GET /metrics` 追加

受け入れ条件:
- Prometheus scrape でエラーなく取得可能

### Task 2: HTTP/依存先SLI計測
対象:
- `apps/idp-server/src/middleware/http-metrics.ts`（新規）
- `apps/idp-server/src/app.ts`

内容:
- route単位で request count / latency histogram を収集
- status class（2xx/4xx/5xx）で集計
- DB/Redis/OIDC失敗を dependency error counter へ反映

受け入れ条件:
- p50/p95/p99 と error ratio が観測可能

### Task 3: セキュリティメトリクス接続
対象:
- `apps/idp-server/src/modules/auth/auth.service.ts`
- `apps/idp-server/src/modules/mfa/*`
- `apps/idp-server/src/modules/users/*`

内容:
- login failed/success, token reuse, mfa recovery, account deletion request をメトリクス化
- `security_events` とメトリクスの eventType 対応を固定

受け入れ条件:
- security event増加がダッシュボードに即時反映

### Task 4: Alert Rule 定義
対象:
- `docs/alerts/critical-alert-rules.md`（新規）
- `docs/security-runbook.md`

内容:
- ルール例:
  - login failure ratio > 15% (5m)
  - refresh token reuse detected > 0 (5m)
  - `idp_dependency_up{dependency="db"} == 0`
- 各ルールに runbook ID を紐付け

受け入れ条件:
- 重大アラートが runbook に1クリックで遷移可能

### Task 5: ダッシュボード定義
対象:
- `docs/dashboards/idp-reliability-dashboard.md`（新規）
- `docs/dashboards/idp-security-dashboard.md`（新規）

内容:
- Reliability: login success, p95 latency, dependency errors
- Security: stuffing indicators, token reuse, admin high-risk events

受け入れ条件:
- On-callが5分以内に状況把握できる構成

### Task 6: Synthetic Check
対象:
- `apps/idp-server/load-tests/scenarios/*`
- `docs/synthetic-monitoring.md`（新規）

内容:
- 1分間隔チェック候補:
  - `/.well-known/openid-configuration`
  - `/.well-known/jwks.json`
  - login happy-path（staging）

受け入れ条件:
- 外形監視で重大障害を早期検知可能

### Task 7: テスト/検証
対象:
- `apps/idp-server/src/modules/*/*.test.ts`
- `apps/idp-server/src/contracts/*.test.ts`

内容:
- `/metrics` endpoint test
- metric label cardinality 逸脱防止テスト
- alert rule 設定値のlint（ドキュメント検証）

受け入れ条件:
- 監視関連の回帰をCIで検知できる

## 7. SLI/SLO（初期値）
1. Login success ratio
- SLI: `successful_logins / total_logins`
- SLO: 99.9% / 30日

2. Token endpoint latency
- SLI: `/v1/login` p95
- SLO: p95 < 300ms / 10分窓

3. Critical security detection latency
- SLI: event発生から通知までの時間
- SLO: < 60秒

4. Availability
- SLI: synthetic checks success ratio
- SLO: 99.95% / 30日

## 8. テストマトリクス
1. 正常系
- `/metrics` が200で返る
- 主要 routeでカウンタとヒストグラムが更新される

2. 異常系
- DB障害時に dependency metric が変化
- login failure spike で alert条件を満たす

3. セキュリティ系
- `refresh_token.reuse_detected` で critical alert 連動
- `admin.config.updated` 高頻度時に high alert 連動

## 9. ロールアウト計画
### Phase A（計測）
- Task 1-3: metricsとsecurityメトリクス接続

### Phase B（運用化）
- Task 4-5: alert/rule/runbook/dashboard 固定

### Phase C（実運用）
- Task 6-7: synthetic導入とCI回帰検知

## 10. ロールバック戦略
- metrics導入で負荷増の場合: 高コストラベルを削減し、ヒストグラムbucketを縮小
- trace exporter障害時: exporter停止してアプリ本体を継続
- alert誤検知多発時: しきい値を暫定緩和し、runbookに調整履歴を残す

## 11. 検証コマンド
```bash
pnpm --filter @idp/idp-server test
pnpm verify
```

## 12. 実装チェックリスト
- [ ] `/metrics` endpoint 実装
- [ ] auth/security SLI メトリクス実装
- [ ] dependency health metric 実装
- [ ] alert rule 文書化
- [ ] runbook連携表の整備
- [ ] reliability/security dashboard 定義
- [ ] synthetic checks 導入
- [ ] `pnpm verify` 通過
