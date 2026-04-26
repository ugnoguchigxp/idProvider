# 14. Production Readiness 改善計画

最終更新: 2026-04-26
ステータス: Planned (Design-Ready / Task 1 Implementation-Ready after endpoint responsibility decision)
優先度: P0

## 1. 目的
本プロジェクトの本番即投入可能性を、現状評価の `5/10` から最終的に `10/10` へ引き上げる。

この計画は機能追加ではなく、本番投入を止める不確実性を潰し、投入後も高い信頼性で運用し続けるための実行計画である。特に `oidc-provider` の stateful data 永続化、実DB/Redis統合検証、外部conformance、負荷・耐久試験、運用drill、HA/DR自動化、外部監査相当のセキュリティ証跡を本番判定の必須Gateとして扱う。

達成したい状態:
- OIDC/OAuth の stateful data が再起動・複数プロセス・standby切替後も保持される
- PostgreSQL/Redis を使った実統合テストで主要認証フローが検証される
- OpenID Certification Portal と負荷試験の結果が記録される
- 本番投入前の go/no-go 判定が一枚のchecklistで完結する
- 障害時に restore / forward-fix / key emergency rotation / traffic switch を実行できる
- SLO、error budget、incident review、change management が継続運用される
- 外部監査・セキュリティレビュー・依存先障害試験に耐える証跡が揃う

## 2. 現状評価（2026-04-26）
### 2.1 強み
- 認証・認可・監査・管理API・運用ジョブの主要機能が実装済み
- `pnpm test` は成功しており、約500件のテストが通る
- OpenAPI契約テスト、内部OIDC conformance、security runbook、risk register が存在する
- `/metrics`、構造化ログ、OpenTelemetry、synthetic monitoring 計画が整備されている
- 鍵ローテーション、監査ログ完全性、データ保持、DR文書が整備されている

### 2.2 本番投入を止める主要リスク
| ID | リスク | 影響 | Gate | 優先度 |
|---|---|---|---|---|
| PR-001 | `oidc-provider` の本番用永続adapterが未実装または未検証 | 再起動・複数プロセス・切替時にOIDC stateを失う | Gate 1 | P0 |
| PR-002 | Authorization Code + PKCE の実E2Eが不足 | 外部クライアント接続時の互換性を保証できない | Gate 2/3 | P0 |
| PR-003 | PostgreSQL/Redis統合テストが薄い | mockでは検出できないtransaction/TTL/接続障害を見逃す | Gate 2 | P0 |
| PR-004 | OpenID Certification Portal実行結果が未取得 | 標準互換性の外部説明力が不足 | Gate 3 | P1 |
| PR-005 | 実測性能・限界点・soak結果が未記録 | 100万人規模前提のcapacity判断ができない | Gate 4 | P1 |
| PR-006 | セキュリティ通知の実配送が未完成 | 重要イベント発生時に運用者へ届かない | Gate 5 | P1 |
| PR-007 | production go/no-go判定が散在 | 未達項目を抱えたまま投入しやすい | Gate 6 | P0 |
| PR-008 | HA/DRが手順中心で自動化・定期検証が不足 | 障害時の復旧が属人化しRTO/RPOを外す | Gate 7 | P1 |
| PR-009 | 外部セキュリティレビュー・脆弱性診断の証跡が不足 | 第三者説明と攻撃耐性の保証が弱い | Gate 8 | P1 |
| PR-010 | chaos/failure injectionの継続検証がない | 依存先障害・部分障害で未知の壊れ方をする | Gate 9 | P1 |
| PR-011 | SLO/error budget/change managementが未運用 | 投入後の品質劣化を制御できない | Gate 10 | P1 |

## 3. 方針決定
### 3.1 OIDC Adapter 方針
初期本番方針は **PostgreSQL永続adapter** とする。

理由:
- PostgreSQLは既にIdPのsystem of recordであり、backup/restore/DR計画の対象に含まれている
- OIDC stateをRedisのみへ置くと、Redis喪失時の復旧説明が難しくなる
- 初期本番では速度より整合性と復旧可能性を優先する

Redisは以下に限定する:
- rate limit
- WebAuthn challengeなど短寿命一時値
- 将来のread-through cache

見直し条件:
- 負荷試験でOIDC adapterが明確なボトルネックになった場合
- DB write負荷がSLOを継続的に圧迫した場合
- Redis永続化、backup、multi-AZ運用が本番要件として固定された場合

### 3.2 OAuth/OIDC Endpoint 責務方針
現状は `oidc-provider` と Hono 側のOAuth互換APIが併存しているため、Task 1開始前に本番で正とするendpoint責務を固定する。

初期判定:
- Authorization Code + PKCE の `/auth`、`/token`、provider session / grant / interaction state は `oidc-provider` を正とする
- 既存の Hono `/oauth/token`、`/oauth/introspection`、`/oauth/revocation` は、既存 opaque token / `user_sessions` lifecycle の互換APIとして扱う
- Hono側の refresh / revocation / introspection は `oidc-provider` adapter導入だけでは保証されないため、Gate 2の実DB統合テストで別途検証する
- OpenID Certification Portal の対象は `oidc-provider` endpointとし、既存Hono endpointはOpenAPI/内部conformanceで互換性を検証する

将来判断:
- Hono `/oauth/*` を `oidc-provider` に統合する場合は、互換性破壊、token形式、SDK影響、移行手順を別PRDまたはmigration planで扱う
- 外部クライアントに公開するissuer metadataと、内部マイクロサービス向けAPIの責務が混ざらないよう `docs/oidc-compatibility.md` と `docs/oidc-client.md` を同期する

### 3.3 Go/No-Go 方針
- Gate 1 と Gate 2 はスキップ不可
- P0未達が1つでもあれば `No-Go`
- P1未達は、owner、期限、fallback、利用者影響が明記された場合のみ `Conditional Go`
- 「テスト未実施」は `pass` ではなく `No Evidence` と記録する

### 3.4 証跡方針
各Gateは、実行ログ、結果サマリ、失敗時の判断をファイルとして残す。

証跡の保存先:
- OIDC外部conformance: `docs/openid-conformance-records/`
- 負荷・耐久試験: `docs/perf/`
- DR/運用drill: `docs/dr-drill-records/`
- go/no-go判定: `docs/runbooks/production-go-no-go-checklist.md`
- 失敗分析: `docs/test-failure.md` または該当計画書
- セキュリティレビュー: `docs/security-assessments/`
- chaos/failure injection: `docs/resilience/`
- SLO/error budget: `docs/slo/`

### 3.5 10/10 方針
`10/10` は「初回本番投入できる」状態ではなく、「認証基盤として継続運用・監査・障害対応まで成熟している」状態と定義する。

10/10では以下をすべて満たす:
- 公式または外部相当のOIDC/OAuth互換性検証がpassしている
- HA/DR、backup/restore、traffic switchが自動化され、定期演習でRTO/RPOを満たしている
- 外部セキュリティレビュー、脆弱性診断、依存関係監査の結果が記録され、High以上が残っていない
- SLO/error budgetが運用され、リリース判断に反映されている
- chaos/failure injectionでDB、Redis、通知provider、OIDC issuer、network遅延の主要障害を検証済み
- incident reviewとpostmortemがテンプレート化され、改善タスクが追跡されている

## 4. 完了定義（Definition of Done）
### 4.1 8/10 DoD
以下をすべて満たした時点で、初回本番投入可能性を `8/10` 以上と判定する。Gate 3-5のP1未達は、owner、期限、fallback、利用者影響がgo/no-go checklistに明記される場合のみ `Conditional Go` として扱える。

- [ ] `oidc-provider` の adapter がPostgreSQLで永続化される
- [ ] IdP再起動後も authorization code / session / grant 関連フローが期待どおり動作する
- [ ] 複数プロセスまたはstandby切替時のOIDC state共有が検証される
- [ ] 実DB/実Redisを使う統合テストが1コマンドで再現可能
- [ ] Signup -> verify -> login -> refresh -> revoke -> introspection の実統合テストが通る
- [ ] Authorization Code + PKCE の実E2Eが通る
- [ ] OpenID Certification Portal の実行結果が `docs/openid-conformance-records/` に保存される、または未実施理由と期限が `Conditional Go` として承認される
- [ ] k6負荷試験で login / refresh / authorization check の実測値が記録される、またはcapacity limitと期限が `Conditional Go` として承認される
- [ ] WAF/Bot対策/Turnstile のstaging enforce結果が記録される、または補償統制が `Conditional Go` として承認される
- [ ] メール/通知の実配送、または本番で同等に扱える通知経路が検証される、または暫定通知手順が `Conditional Go` として承認される
- [ ] Backup restore rehearsal と DR drill の初回記録が残る、または初回本番投入前後の実施期限が `Conditional Go` として承認される
- [ ] Production go/no-go checklist が `Go` または `Conditional Go` として承認される
- [ ] `pnpm verify`、`pnpm verify:security`、`pnpm verify:oidc-conformance` が通る

### 4.2 10/10 DoD
以下をすべて満たした時点で、本番即投入可能性を `10/10` と判定する。

- [ ] Gate 0-10 がすべて `Pass`
- [ ] `Conditional Go`、`Conditional Pass`、`No Evidence` が残っていない
- [ ] OpenID Certification Portal の対象profileがpassしている
- [ ] 外部セキュリティレビューまたは同等の第三者レビューが完了し、High以上の未解決がない
- [ ] dependency audit、secret scan、container scan、SASTのHigh以上が残っていない
- [ ] 1時間以上のsoak testとspike testでSLO未達がない
- [ ] DB failover、Redis outage、notification provider outage、OIDC state cleanup、network latency injectionを検証済み
- [ ] restore rehearsalとDR drillが定期実行され、直近2回連続でRTO/RPOを満たしている
- [ ] key emergency rotation drillが直近で成功し、影響通知とJWKS更新が確認済み
- [ ] SLO、error budget、alert、dashboard、incident reviewが運用手順に組み込まれている
- [ ] 本番リリース手順、rollback手順、post-release 24h monitoringが演習済み
- [ ] `docs/risk-register.md` にP0/P1未解決が残っていない

## 5. スコープ
### 5.1 対象
- `apps/idp-server/src/core/oidc-provider.ts`
- `apps/idp-server/src/index.ts`
- `apps/idp-server/src/modules/auth/*`
- `apps/idp-server/src/modules/sessions/*`
- `apps/idp-server/src/modules/oauth-clients/*`
- `packages/db/src/schema.ts`
- `infra/migrations/*`
- `apps/idp-server/load-tests/*`
- `scripts/verify-*.sh`
- `.github/workflows/*`
- `docs/openid-conformance-records/*`
- `docs/dr-drill-records/*`
- `docs/perf/*`
- `docs/runbooks/*`

### 5.2 対象外
- Dynamic Client Registration
- PAR / JAR / CIBA / FAPI advanced profile
- マルチリージョンactive-active
- KMS/HSMへの完全移行
- SaaS外販向けの課金・テナント管理・セルフサーブUI

## 6. Readiness Gate
### Gate Summary
| Gate | 名称 | 必須度 | 主な証跡 | No-Go条件 |
|---|---|---:|---|---|
| Gate 0 | Local Verification | P0 | command log | `pnpm verify`系失敗 |
| Gate 1 | Stateful OIDC | P0 | adapter test結果 | in-memory adapter依存 |
| Gate 2 | Real Dependency Integration | P0 | integration test結果 | 実DB/Redisフロー未検証 |
| Gate 3 | External Conformance | P1 | Portal実行記録 | 重大OIDC失敗未整理 |
| Gate 4 | Performance And Soak | P1 | k6 report | capacity不明 |
| Gate 5 | Operations Drill | P1 | drill record | 復旧手順未実施 |
| Gate 6 | Production Go/No-Go | P0 | checklist | P0未達または証跡欠落 |
| Gate 7 | HA/DR Automation | P1 | restore/traffic drill | RTO/RPO未達 |
| Gate 8 | Security Assurance | P1 | assessment report | High以上未解決 |
| Gate 9 | Resilience And Chaos | P1 | failure injection report | 主要障害未検証 |
| Gate 10 | SLO Operations | P1 | SLO/error budget record | SLO運用未開始 |

### Gate 0: Local Verification
目的: 開発環境で壊れていないことを確認する。

必須条件:
- `pnpm verify`
- `pnpm verify:security`
- `pnpm verify:oidc-conformance`
- OpenAPI lint
- migration dry-run（未実装のため Task 7 または `verify:production-readiness` 実装時に追加する）

証跡:
- 実行日時
- commit SHA
- command outputの保存先
- 失敗時の原因分類

失敗時:
- 次Gateへ進めない
- 失敗ログを `docs/test-failure.md` または該当計画書へ記録する

### Gate 1: Stateful OIDC
目的: OIDC/OAuth の状態管理を本番相当にする。

必須条件:
- `oidc-provider` adapter がin-memoryではない
- provider state の保存先、TTL、削除方針が文書化される
- 再起動後の authorization code / provider session / grant / interaction state がテストされる
- Hono側の refresh / revocation / introspection は、既存 `user_sessions` lifecycleとしてGate 2で別途テストされる
- 複数インスタンス間でstateが共有される
- adapter cleanup jobまたは期限切れ削除方針が存在する

証跡:
- adapter contract test結果
- restart test結果
- standby切替またはdual instance test結果
- 保存テーブル/TTL/cleanup方針

失敗時:
- 本番投入不可
- このGateはrisk acceptance不可

### Gate 2: Real Dependency Integration
目的: mockではなくPostgreSQL/Redis込みで主要フローを保証する。

必須条件:
- Docker ComposeまたはCI service containerでPostgreSQL/Redisを起動
- migration適用後に実統合テストを実行
- 以下を同一環境で検証する
  - signup
  - email verify
  - login
  - MFA enroll/verify
  - WebAuthn challenge lifecycle
  - refresh token rotation
  - token reuse detection
  - revocation
  - introspection
  - sessions revoke
  - admin config update
  - authorization check
  - entitlement check

証跡:
- `scripts/verify-integration.sh` の実行結果
- migration適用ログ
- DB/Redis version
- 失敗時のDB/Redisログ

失敗時:
- リリース候補から除外
- repository mockの成功だけでは代替不可

### Gate 3: External Conformance
目的: 内部テストではなく外部標準テストでOIDC互換性を確認する。

必須条件:
- OpenID Certification Portal のOPテストプランを実行
- 成功/失敗件数を記録
- 失敗ケースは issue または計画書タスクに落とす
- `docs/oidc-compatibility.md` と実装差分を同期する

証跡:
- `docs/openid-conformance-records/YYYY-MM-DD-run-NNN.md`
- Portal設定値
- 対象profile
- 未対応仕様の明示

判定:
- 初回は `Conditionally Pass` を許容する
- 本番投入前には重大失敗なし、または影響範囲を明示して `Conditional Go` に紐付ける

### Gate 4: Performance And Soak
目的: 目標性能と劣化時挙動を実測する。

必須条件:
- k6で login / token refresh / authorization check を実行
- 30分以上のsoak testを実施
- p50 / p95 / p99 / error rate / DB connection / Redis latency を記録
- rate limit, bot challenge, Redis障害, DB遅延の挙動を確認する

初期目標:
- Login p95 < 300ms
- Token refresh p95 < 150ms
- Authorization check p95 < 100ms
- 5xx rate < 0.1%
- DB connection saturationなし
- Redis timeout連鎖なし
- 認証系の依存先エラー時に原因がメトリクスで識別できる

証跡:
- `docs/perf/production-readiness-load-report-YYYYMMDD.md`
- k6 summary
- Prometheus snapshotまたはメトリクス抜粋
- ボトルネックと改善判断

### Gate 5: Operations Drill
目的: 障害時に手順が実行できることを確認する。

必須条件:
- restore rehearsal 実施記録
- DR drill 実施記録
- key emergency rotation drill
- standby deploy -> verify -> switch traffic のrehearsal
- incident checklist更新
- on-callが参照するrunbookリンク更新

証跡:
- `docs/dr-drill-records/YYYY-MM-DD-*.md`
- 実測RTO/RPO
- 実行者
- 発見した手順不備
- 改善タスク

失敗時:
- 本番投入延期
- 手順不足はrunbook修正後に再実施

### Gate 6: Production Go/No-Go
目的: 本番投入判断を一枚に集約する。

必須条件:
- `docs/runbooks/production-go-no-go-checklist.md` を作成
- Gate 0-5 の結果リンクを記載
- 未解決リスクのowner / due date / fallbackを記載
- `docs/risk-register.md` と同期する

判定:
- `Go`: P0/P1未達なし
- `Conditional Go`: P1未達はあるがfallback、owner、期限、利用者影響が明確
- `No-Go`: Gate 1またはGate 2未達、P0未解決、証跡欠落

### Gate 7: HA/DR Automation
目的: 手順依存の復旧から、自動化・定期検証された復旧能力へ引き上げる。

必須条件:
- PostgreSQL backup / PITR / restore rehearsalが自動または半自動で再現できる
- standby deploy -> verify -> switch traffic -> rollbackがスクリプト化されている
- destructive job停止/再開手順がtraffic switchと連動している
- 復旧後に login / refresh / jwks / authorization check が自動検証される
- 直近2回のdrillでRTO/RPOを満たしている

証跡:
- `docs/dr-drill-records/YYYY-MM-DD-ha-dr.md`
- restore command log
- traffic switch command log
- RTO/RPO実測
- 復旧後smoke test結果

失敗時:
- `10/10` 判定不可
- 初回本番投入の `8/10` 判定では、ownerと期限付きP1として扱える

### Gate 8: Security Assurance
目的: 自己点検だけでなく、外部説明可能なセキュリティ保証を得る。

必須条件:
- SAST / dependency audit / secret scan / container scanがCIで実行される
- High以上の未解決がない
- 外部セキュリティレビューまたは同等の第三者レビューを実施する
- 認証・認可・MFA・token lifecycle・admin APIの重点レビュー結果を記録する
- threat model、risk register、security runbookがレビュー結果と同期している

証跡:
- `docs/security-assessments/YYYY-MM-DD-review.md`
- scan result summary
- 未解決脆弱性一覧
- remediation log
- reviewer / approver

失敗時:
- High以上未解決は `No-Go`
- Medium以下はowner、期限、悪用条件、補償統制が明記された場合のみ `Conditional Go`

### Gate 9: Resilience And Chaos
目的: 依存先障害・部分障害・遅延で未知の壊れ方をしないことを確認する。

必須条件:
- DB read/write latency injection
- DB connection exhaustion
- Redis outage / timeout
- notification provider outage
- OpenTelemetry exporter outage
- OIDC discovery upstream failure
- clock skew
- key rotation during traffic
- rate limit Redis障害時の挙動

証跡:
- `docs/resilience/YYYY-MM-DD-failure-injection.md`
- failure scenario
- expected behavior
- observed behavior
- metrics/log evidence
- rollback or mitigation

失敗時:
- 認証フローが5xx連鎖する障害は `No-Go`
- degraded modeが文書化されていない障害は `Conditional Go` 不可

### Gate 10: SLO Operations
目的: 投入後の品質を継続的に制御する。

必須条件:
- SLOとSLIが文書化され、dashboard/alertに接続される
- error budget policyが定義される
- release freeze条件が定義される
- incident review / postmortem templateが存在する
- weekly readiness reviewでrisk register、SLO、alerts、incidentsを更新する

初期SLO:
- Availability: 99.95% / 30日
- Login success ratio: 99.9% / 30日
- Login p95 latency: < 300ms / 10分窓
- Token refresh p95 latency: < 150ms / 10分窓
- Authorization check p95 latency: < 100ms / 10分窓
- Critical security detection latency: < 60秒

証跡:
- `docs/slo/idp-slo.md`
- dashboard links
- alert rule links
- error budget review record
- incident review record

失敗時:
- `10/10` 判定不可
- `8/10` では本番投入後30日以内のP1として扱える

## 7. 実装タスク
### Task Dependency
| Task | 名称 | 優先度 | 依存 | 完了後に通せるGate |
|---|---|---:|---|---|
| Task 1 | oidc-provider永続adapter導入 | P0 | なし | Gate 1 |
| Task 2 | 実DB/Redis統合テスト基盤 | P0 | Task 1 | Gate 2 |
| Task 3 | Authorization Code + PKCE E2E | P0 | Task 1, Task 2 | Gate 2/3 |
| Task 4 | OpenID Certification Portal実行 | P1 | Task 3 | Gate 3 |
| Task 5 | 性能・耐久試験 | P1 | Task 1, Task 2 | Gate 4 |
| Task 6 | 通知・メール配送の本番経路検証 | P1 | なし | Gate 5 |
| Task 7 | 本番環境設定hardening | P1 | Task 2 | Gate 0/6 |
| Task 8 | 運用drill実施 | P1 | Task 5, Task 7 | Gate 5 |
| Task 9 | Go/No-Go checklist作成 | P0 | Gate 0-5証跡 | Gate 6 |
| Task 10 | HA/DR自動化 | P1 | Task 8 | Gate 7 |
| Task 11 | Security assurance実施 | P1 | Task 7 | Gate 8 |
| Task 12 | Resilience/chaos検証 | P1 | Task 5, Task 10 | Gate 9 |
| Task 13 | SLO/error budget運用 | P1 | Task 5 | Gate 10 |
| Task 14 | 10/10判定レビュー | P1 | Gate 0-10証跡 | Gate 6/10 |

### Task 1: oidc-provider 永続adapter導入（P0）
担当: Backend

対象:
- `apps/idp-server/src/core/oidc-provider.ts`
- `packages/db/src/schema.ts`
- `infra/migrations/*`
- `apps/idp-server/src/core/oidc-provider*.test.ts`
- `apps/idp-server/src/core/oidc-provider-adapter.ts`（新規候補）

内容:
- Task 1着手前に本番公開endpoint責務を確認し、`oidc-provider` endpointとHono `/oauth/*` の検証範囲を固定する
- `oidc-provider` の Adapter interface をPostgreSQLで実装する
- 保存対象、TTL、cleanup方針を固定する
- adapter操作のメトリクスを追加する
- provider state用テーブルに適切なindexを追加する
- 期限切れstateの削除jobまたは運用SQLを定義する

Adapter設計メモ:
- 推奨テーブル: `oidc_provider_states`
- 推奨カラム: `model`, `id`, `payload`, `grant_id`, `user_code`, `uid`, `expires_at`, `consumed_at`, `created_at`, `updated_at`
- 推奨制約: `(model, id)` unique、`expires_at` index、必要に応じて `grant_id` / `user_code` / `uid` index
- 実装対象method: `upsert`, `find`, `findByUid`, `findByUserCode`, `destroy`, `revokeByGrantId`, `consume`
- TTLは `oidc-provider` から渡される `expiresIn` を基準に `expires_at` へ保存し、期限切れはread時に無効扱いにする
- cleanupは初期PRでは運用SQLまたはscriptでよいが、Gate 1完了までに定期実行方針を文書化する
- `consume` は該当stateを削除せず `consumed_at` を記録し、code再利用拒否を検証できるようにする

受け入れ条件:
- in-memory adapter警告がproduction相当テストで出ない
- プロセス再起動後のOIDC flowが通る
- 複数インスタンス相当のテストが通る
- adapterのcreate/read/update/delete/upsert/destroy系分岐がテストされる
- 既存Hono `/oauth/token`、`/oauth/introspection`、`/oauth/revocation` との責務差分が `docs/oidc-compatibility.md` に反映される

### Task 2: 実DB/Redis統合テスト基盤（P0）
担当: Backend + QA

対象:
- `apps/idp-server/src/**/*.integration.test.ts`
- `infra/docker-compose.yml`
- `.github/workflows/*`
- `scripts/verify-integration.sh`

内容:
- Docker ComposeでPostgreSQL/Redisを起動
- migration適用
- seedを最小化
- `oidc-provider` stateful flowと、Hono側 opaque token / session flowを実DBで分けて検証
- 失敗時にDB/Redisログを保存する

受け入れ条件:
- ローカルで1コマンド実行可能
- CIではnightlyまたはprotected branchで実行可能
- integration testはunit testと分離して実行できる
- teardownでDB stateを確実に初期化できる

### Task 3: Authorization Code + PKCE E2E（P0）
担当: Backend + QA

対象:
- `apps/idp-server/src/core/oidc-provider.ts`
- `apps/idp-server/src/modules/auth/*`
- `apps/idp-server/src/contracts/*`
- `docs/oidc-compatibility.md`

内容:
- redirect URI検証
- PKCE検証
- authorization code発行
- code exchange
- ID Token claims検証
- invalid code / reused code / invalid verifier検証
- client auth失敗検証

受け入れ条件:
- happy pathと主要error pathが実行可能
- OpenAPI/compatibility docと一致する
- 外部conformance実行前のprecheckとして使える

### Task 4: OpenID Certification Portal 実行（P1）
担当: Backend + Security

対象:
- `docs/openid-conformance-records/*`
- `docs/openid-conformance-suite-runbook.md`
- `docs/oidc-compatibility.md`

内容:
- PortalでOPテストを実行
- 結果を記録
- 失敗ケースを分類する
- 未対応仕様をcompatibility matrixへ反映する

受け入れ条件:
- 実行記録が残る
- 重大失敗がない、またはNo-Go扱いで明示される
- 再実行手順がrunbookのみで追える

### Task 5: 性能・耐久試験（P1）
担当: Backend + SRE

対象:
- `apps/idp-server/load-tests/*`
- `docs/perf/*`
- `docs/qa-and-performance-plan.md`

内容:
- baseline計測
- spike test
- 30分以上のsoak test
- Redis/DB遅延注入
- rate limit作動確認
- adapter永続化後のDB write負荷確認

受け入れ条件:
- 実測レポートが残る
- 目標未達時のボトルネックが特定される
- 目標未達のまま本番投入する場合はcapacity limitを明記する

### Task 6: 通知・メール配送の本番経路検証（P1）
担当: Backend + Security

対象:
- `apps/idp-server/src/core/security-notifier.ts`
- `docs/email-delivery-plan.md`
- `docs/sendgrid-setup-guide.md`
- `docs/security-runbook.md`

内容:
- security notificationの配送先を決める
- SendGrid/SES/SMTP等の実providerをstagingで検証
- provider障害時のfallbackを決める
- 配送失敗時のメトリクスとログを定義する

受け入れ条件:
- 重要イベントが実配送される
- 配送失敗がメトリクス/ログで検知できる
- provider障害時の暫定運用がrunbook化される

### Task 7: 本番環境設定hardening（P1）
担当: Backend + SRE

対象:
- `apps/idp-server/src/config/env.ts`
- `README.md`
- `docs/security-runbook.md`
- `docs/runbooks/production-go-no-go-checklist.md`

内容:
- productionで禁止する値を追加検証
- cookie secure / sameSite / domain / CSRF設定を確認
- CORS設定を固定
- metrics bearer token必須化の検証を強化
- secret redactionのテストを追加
- `OIDC_ISSUER`、redirect URI、cookie domainの整合性を検証する

受け入れ条件:
- 危険なデフォルトで本番起動できない
- 設定不足は起動時にfail-fastする
- env testにproduction失敗ケースが含まれる

### Task 8: 運用drill実施（P1）
担当: SRE + Security

対象:
- `docs/dr-drill-records/*`
- `docs/runbooks/restore-rehearsal.md`
- `docs/runbooks/migration-deploy-checklist.md`
- `docs/key-compromise-runbook.md`

内容:
- restore rehearsal
- migration failure rehearsal
- key compromise drill
- traffic switch rehearsal
- destructive job停止/再開確認

受け入れ条件:
- 実施記録が残る
- 実測RTO/RPOが計画値を満たす、または改善タスクが登録される
- drillで見つかったrunbook不備が修正される

### Task 9: Production Go/No-Go checklist作成（P0）
担当: Backend + SRE + Security

対象:
- `docs/runbooks/production-go-no-go-checklist.md`
- `docs/risk-register.md`

内容:
- Gate 0-5の証跡リンクを集約
- 未解決リスクを一覧化
- 判定者、判定日時、判定結果を記録
- rollback条件と初回リリース後24時間の監視項目を固定

受け入れ条件:
- checklistだけで本番投入可否を判断できる
- P0未達が自動的にNo-Goとして扱われる

### Task 10: HA/DR自動化（P1）
担当: SRE + Backend

対象:
- `scripts/deploy-standby.sh`
- `scripts/verify-standby.sh`
- `scripts/switch-traffic.sh`
- `scripts/verify-production-readiness.sh`
- `docs/runbooks/restore-rehearsal.md`
- `docs/dr-drill-records/*`

内容:
- restore rehearsalをコマンド化する
- traffic switchとrollbackを同一手順で実行できるようにする
- 復旧後smoke testを自動化する
- destructive job停止/再開をrunbookとscriptに反映する
- RTO/RPOをdrillごとに記録する

受け入れ条件:
- 直近2回のdrillでRTO/RPOを満たす
- traffic switch後にlogin / refresh / jwksが自動検証される
- drill結果が `docs/dr-drill-records/` に保存される

### Task 11: Security assurance実施（P1）
担当: Security + Backend

対象:
- `.github/workflows/*`
- `docs/security-assessments/*`
- `docs/risk-register.md`
- `docs/threat-model.md`
- `docs/security-runbook.md`

内容:
- SAST、dependency audit、secret scan、container scanをCIに組み込む
- 外部セキュリティレビューまたは同等の第三者レビューを実施する
- 認証・認可・MFA・token lifecycle・admin APIを重点レビューする
- High以上の未解決をゼロにする
- remediation logを残す

受け入れ条件:
- High以上の未解決がない
- Medium以下はowner、期限、補償統制が記録される
- threat modelとrisk registerがレビュー結果と同期している

### Task 12: Resilience/chaos検証（P1）
担当: SRE + Backend

対象:
- `docs/resilience/*`
- `docs/09-observability-security-monitoring-plan.md`
- `docs/security-runbook.md`
- `apps/idp-server/load-tests/*`

内容:
- DB遅延、DB接続枯渇、Redis停止、Redis遅延を注入する
- 通知provider停止、trace exporter停止、OIDC upstream失敗を注入する
- clock skewとkey rotation during trafficを検証する
- failureごとに期待挙動、実挙動、メトリクス、対応を記録する

受け入れ条件:
- 認証コアフローの5xx連鎖がない
- degraded modeがrunbook化される
- 未知の障害モードが見つかった場合はP0/P1として登録される

### Task 13: SLO/error budget運用（P1）
担当: SRE + Product/Business Owner

対象:
- `docs/slo/idp-slo.md`
- `docs/dashboards/*`
- `docs/alerts/critical-alert-rules.md`
- `docs/incident-response-checklist.md`

内容:
- SLI/SLOを確定する
- error budget policyを定義する
- release freeze条件を定義する
- dashboard/alert/runbookをSLOへ紐付ける
- incident review templateを作成する

受け入れ条件:
- SLO違反時のリリース判断が明文化される
- weekly readiness reviewでSLOとrisk registerを更新できる
- incident reviewから改善タスクが追跡される

### Task 14: 10/10判定レビュー（P1）
担当: Backend + SRE + Security + Product/Business Owner

対象:
- `docs/runbooks/production-go-no-go-checklist.md`
- `docs/14-production-readiness-plan.md`
- `docs/risk-register.md`

内容:
- Gate 0-10の証跡を確認する
- `Conditional Pass`、`No Evidence`、P0/P1未解決が残っていないことを確認する
- 10/10判定を承認者付きで記録する

受け入れ条件:
- `10/10` 判定欄がすべて埋まる
- 承認者が記録される
- 次回レビュー日が設定される

## 8. テストマトリクス
### 8.1 OIDC State
- authorization code発行後に再起動しても期待どおり処理される
- code再利用は拒否される
- 複数インスタンス相当で同一stateを共有できる
- expired stateがcleanupされる

### 8.2 Token Lifecycle
- refresh token rotation
- refresh token reuse detection
- revocation後のintrospection inactive
- expired token handling
- disabled clientのtoken操作拒否

### 8.3 Security Controls
- MFA required userのlogin分岐
- WebAuthn challenge replay拒否
- Turnstile invalid/missing/provider error
- admin config updateのCSRF/権限チェック
- secret redaction

### 8.4 Operations
- DB down時に`/readyz`が503
- Redis down時に影響範囲が識別できる
- `/metrics` scrapeが認証付きで成功
- emergency key rotation後にJWKSが更新される
- restore後にlogin / refresh / jwksが動作する

## 9. ロールアウト計画
### Phase A: 本番ブロッカー解消
対象:
- Task 1
- Task 2
- Task 3

完了条件:
- Gate 1 pass
- Gate 2 pass
- P0の未解決なし

### Phase B: 外部検証と性能検証
対象:
- Task 4
- Task 5
- Task 6

完了条件:
- Gate 3 passまたはConditional Go条件を満たす
- Gate 4 passまたはcapacity limitが明文化される
- security notification経路が検証済み

### Phase C: 運用投入準備
対象:
- Task 7
- Task 8
- Task 9

完了条件:
- Gate 5 pass
- Gate 6でGoまたはConditional Go
- `docs/risk-register.md` が最新化されている

### Phase D: 10/10成熟度到達
対象:
- Task 10
- Task 11
- Task 12
- Task 13
- Task 14

完了条件:
- Gate 7-10 pass
- `Conditional Pass` と `No Evidence` が残っていない
- P0/P1の未解決なし
- `10/10` 判定レビューが承認済み

## 10. リスクと対策
| Risk | 対策 | 検知方法 | Escalation |
|---|---|---|---|
| OIDC adapter実装ミスで認可フローが壊れる | adapter contract test、再起動テスト、複数インスタンステスト | Gate 1 | Backend Lead |
| 実統合テストが重くCI時間が伸びる | PRはsubset、nightly/protected branchでfull実行 | CI duration | Backend + QA |
| OpenID Portalで未対応仕様が失敗扱いになる | 対象profileを絞り、未対応仕様をcompatibility docに明示 | Gate 3 | Backend + Security |
| 負荷試験で性能目標未達 | DB index、connection pool、RBAC cache、TTLを調整 | Gate 4 | Backend + SRE |
| 通知provider障害でsecurity alertが届かない | primary/secondary通知経路、配送失敗メトリクス | Gate 5 | Security |
| DR drillでRTO/RPO未達 | restore手順、backup頻度、traffic switch手順を改善 | Gate 5 | SRE |
| HA/DR自動化が不十分で復旧が属人化する | restore/traffic switch/smoke testをscript化 | Gate 7 | SRE |
| 外部レビューでHigh脆弱性が見つかる | remediation sprintを設けHigh以上をゼロにする | Gate 8 | Security |
| chaos検証で未知の5xx連鎖が見つかる | degraded mode設計とrunbookを追加 | Gate 9 | Backend + SRE |
| SLO運用が形骸化する | error budget reviewをrelease判定へ組み込む | Gate 10 | SRE + Product |

## 11. 成果物
- `docs/14-production-readiness-plan.md`
- `docs/runbooks/production-go-no-go-checklist.md`
- `docs/openid-conformance-records/YYYY-MM-DD-run-NNN.md`
- `docs/perf/production-readiness-load-report-YYYYMMDD.md`
- `docs/dr-drill-records/YYYY-MM-DD-*.md`
- `scripts/verify-integration.sh`
- `scripts/verify-production-readiness.sh`
- `docs/security-assessments/YYYY-MM-DD-review.md`
- `docs/resilience/YYYY-MM-DD-failure-injection.md`
- `docs/slo/idp-slo.md`
- OIDC adapter実装
- 実DB/Redis統合テスト

## 12. 証跡テンプレート
### 12.1 Gate Result
```md
# Production Readiness Gate Result

- Gate:
- 実施日時:
- 実施者:
- Commit SHA:
- 環境:
- 判定: Pass / Conditional Pass / Fail / No Evidence
- 実行コマンド:
- 結果サマリ:
- 失敗項目:
- 未解決リスク:
- 次アクション:
```

### 12.2 Load Report
```md
# Production Readiness Load Report

- 実施日時:
- 環境:
- アプリバージョン:
- DB/Redis構成:
- シナリオ:
- 実行時間:
- p50:
- p95:
- p99:
- 5xx rate:
- DB connection:
- Redis latency:
- ボトルネック:
- 判定:
```

### 12.3 Go/No-Go Checklist
```md
# Production Go/No-Go Checklist

- 判定日時:
- 判定者:
- 判定: Go / Conditional Go / No-Go
- Gate 0:
- Gate 1:
- Gate 2:
- Gate 3:
- Gate 4:
- Gate 5:
- P0未解決:
- P1未解決:
- fallback:
- rollback条件:
- 初回24時間監視項目:
```

### 12.4 Security Assessment
```md
# Security Assessment Record

- 実施日時:
- Reviewer:
- 対象commit SHA:
- 対象範囲:
- 実施項目:
- High以上:
- Medium:
- Low:
- Remediation:
- Residual risk:
- 判定:
```

### 12.5 Failure Injection
```md
# Failure Injection Record

- 実施日時:
- Scenario:
- Expected behavior:
- Observed behavior:
- User impact:
- Metrics/log evidence:
- Mitigation:
- Follow-up:
- 判定:
```

## 13. 実行コマンド
既存:
```bash
pnpm verify
pnpm verify:security
pnpm verify:oidc-conformance
pnpm --filter @idp/idp-server test
pnpm --filter @idp/idp-server test:contract
pnpm stack:up
pnpm db:migrate
```

追加するコマンド:
```bash
pnpm verify:integration
pnpm verify:production-readiness
pnpm db:migrate:dry-run
```

追加コマンドの期待動作:
- `verify:integration`: PostgreSQL/Redis起動確認、migration適用、実統合テスト実行
- `verify:production-readiness`: Gate 0の全コマンドと必須証跡ファイル存在確認
- `db:migrate:dry-run`: migration適用可否を検証し、本番DBへ変更を書き込まない

## 14. 判定基準
### 8/10 到達条件
- Gate 1 と Gate 2 がpass
- Gate 3で重大失敗なし、またはConditional Go条件を満たす
- Gate 4で初期性能目標を満たす、またはcapacity limitが文書化される
- Gate 5のdrill記録が残る
- P0未解決がない
- go/no-go checklistが `Go` または `Conditional Go` として承認済み

### 9/10 到達条件
- OpenID Certification Portalで対象profileがpass
- 1時間以上のsoak testでSLO未達なし
- restore rehearsalとDR drillが定期運用化される
- 通知・監視・WAF・backupがstaging/prod相当で接続済み
- Gate結果がリリースごとに更新される

### 10/10 到達条件
- Gate 0-10 がすべてpass
- `Conditional Pass`、`Conditional Go`、`No Evidence` が残っていない
- OpenID Certification Portalで対象profileがpass
- 外部セキュリティレビューまたは同等の第三者レビューが完了し、High以上の未解決がない
- SAST / dependency audit / secret scan / container scanでHigh以上の未解決がない
- 1時間以上のsoak test、spike test、failure injectionでSLO未達なし
- DB failover、Redis outage、notification provider outage、clock skew、key rotation during trafficを検証済み
- restore rehearsalとDR drillが直近2回連続でRTO/RPOを満たす
- SLO/error budgetがrelease判定に接続されている
- incident reviewとpostmortemから改善タスクが追跡されている
- P0/P1未解決が `docs/risk-register.md` に残っていない

## 15. 実装開始判定
この計画は **Task 1のendpoint責務確認から即時着手**。

最初に着手すべき理由:
- `oidc-provider` の永続adapter未整備は本番投入の最大ブロッカー
- ここが未解消のままだと、負荷試験やDR drillの結果も本番評価として扱えない
- Gate 1はrisk acceptance不可

初回PRの推奨範囲:
- `oidc-provider` endpointとHono `/oauth/*` の責務差分を `docs/oidc-compatibility.md` に反映
- PostgreSQL adapter用schema/migration
- adapter実装
- adapter contract test
- restart test
- `docs/14-production-readiness-plan.md` のTask 1進捗更新
