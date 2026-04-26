# 14. Production Readiness 改善計画

最終更新: 2026-04-26
ステータス: Planned (Implementation-Ready)
優先度: P0

## 1. 目的
本プロジェクトの本番即投入可能性を、現状評価の `5/10` から `8/10` 以上へ引き上げる。

この計画は機能追加ではなく、本番投入を止める不確実性を潰すための実行計画である。特に `oidc-provider` の stateful data 永続化、実DB/Redis統合検証、外部conformance、負荷・耐久試験、運用drillを本番判定の必須Gateとして扱う。

達成したい状態:
- OIDC/OAuth の stateful data が再起動・複数プロセス・standby切替後も保持される
- PostgreSQL/Redis を使った実統合テストで主要認証フローが検証される
- OpenID Certification Portal と負荷試験の結果が記録される
- 本番投入前の go/no-go 判定が一枚のchecklistで完結する
- 障害時に restore / forward-fix / key emergency rotation / traffic switch を実行できる

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

### 3.2 Go/No-Go 方針
- Gate 1 と Gate 2 はスキップ不可
- P0未達が1つでもあれば `No-Go`
- P1未達は、owner、期限、fallback、利用者影響が明記された場合のみ `Conditional Go`
- 「テスト未実施」は `pass` ではなく `No Evidence` と記録する

### 3.3 証跡方針
各Gateは、実行ログ、結果サマリ、失敗時の判断をファイルとして残す。

証跡の保存先:
- OIDC外部conformance: `docs/openid-conformance-records/`
- 負荷・耐久試験: `docs/perf/`
- DR/運用drill: `docs/dr-drill-records/`
- go/no-go判定: `docs/runbooks/production-go-no-go-checklist.md`
- 失敗分析: `docs/test-failure.md` または該当計画書

## 4. 完了定義（Definition of Done）
以下をすべて満たした時点で、本番即投入可能性を `8/10` 以上と判定する。

- [ ] `oidc-provider` の adapter がPostgreSQLで永続化される
- [ ] IdP再起動後も authorization code / session / grant 関連フローが期待どおり動作する
- [ ] 複数プロセスまたはstandby切替時のOIDC state共有が検証される
- [ ] 実DB/実Redisを使う統合テストが1コマンドで再現可能
- [ ] Signup -> verify -> login -> refresh -> revoke -> introspection の実統合テストが通る
- [ ] Authorization Code + PKCE の実E2Eが通る
- [ ] OpenID Certification Portal の実行結果が `docs/openid-conformance-records/` に保存される
- [ ] k6負荷試験で login / refresh / authorization check の実測値が記録される
- [ ] WAF/Bot対策/Turnstile のstaging enforce結果が記録される
- [ ] メール/通知の実配送、または本番で同等に扱える通知経路が検証される
- [ ] Backup restore rehearsal と DR drill の初回記録が残る
- [ ] Production go/no-go checklist が `Go` または `Conditional Go` として承認される
- [ ] `pnpm verify`、`pnpm verify:security`、`pnpm verify:oidc-conformance` が通る

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

### Gate 0: Local Verification
目的: 開発環境で壊れていないことを確認する。

必須条件:
- `pnpm verify`
- `pnpm verify:security`
- `pnpm verify:oidc-conformance`
- OpenAPI lint
- migration dry-run

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
- 再起動後の authorization code / refresh / revocation / introspection 挙動がテストされる
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

### Task 1: oidc-provider 永続adapter導入（P0）
担当: Backend

対象:
- `apps/idp-server/src/core/oidc-provider.ts`
- `packages/db/src/schema.ts`
- `infra/migrations/*`
- `apps/idp-server/src/core/oidc-provider*.test.ts`
- `apps/idp-server/src/core/oidc-provider-adapter.ts`（新規候補）

内容:
- `oidc-provider` の Adapter interface をPostgreSQLで実装する
- 保存対象、TTL、cleanup方針を固定する
- adapter操作のメトリクスを追加する
- provider state用テーブルに適切なindexを追加する
- 期限切れstateの削除jobまたは運用SQLを定義する

受け入れ条件:
- in-memory adapter警告がproduction相当テストで出ない
- プロセス再起動後のOIDC flowが通る
- 複数インスタンス相当のテストが通る
- adapterのcreate/read/update/delete/upsert/destroy系分岐がテストされる

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
- 主要フローを実DBで検証
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

## 10. リスクと対策
| Risk | 対策 | 検知方法 | Escalation |
|---|---|---|---|
| OIDC adapter実装ミスで認可フローが壊れる | adapter contract test、再起動テスト、複数インスタンステスト | Gate 1 | Backend Lead |
| 実統合テストが重くCI時間が伸びる | PRはsubset、nightly/protected branchでfull実行 | CI duration | Backend + QA |
| OpenID Portalで未対応仕様が失敗扱いになる | 対象profileを絞り、未対応仕様をcompatibility docに明示 | Gate 3 | Backend + Security |
| 負荷試験で性能目標未達 | DB index、connection pool、RBAC cache、TTLを調整 | Gate 4 | Backend + SRE |
| 通知provider障害でsecurity alertが届かない | primary/secondary通知経路、配送失敗メトリクス | Gate 5 | Security |
| DR drillでRTO/RPO未達 | restore手順、backup頻度、traffic switch手順を改善 | Gate 5 | SRE |

## 11. 成果物
- `docs/14-production-readiness-plan.md`
- `docs/runbooks/production-go-no-go-checklist.md`
- `docs/openid-conformance-records/YYYY-MM-DD-run-NNN.md`
- `docs/perf/production-readiness-load-report-YYYYMMDD.md`
- `docs/dr-drill-records/YYYY-MM-DD-*.md`
- `scripts/verify-integration.sh`
- `scripts/verify-production-readiness.sh`
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
```

追加コマンドの期待動作:
- `verify:integration`: PostgreSQL/Redis起動確認、migration適用、実統合テスト実行
- `verify:production-readiness`: Gate 0の全コマンドと必須証跡ファイル存在確認

## 14. 判定基準
### 8/10 到達条件
- Gate 1 と Gate 2 がpass
- Gate 3で重大失敗なし、またはConditional Go条件を満たす
- Gate 4で初期性能目標を満たす、またはcapacity limitが文書化される
- Gate 5のdrill記録が残る
- P0未解決がない
- go/no-go checklistが作成済み

### 9/10 到達条件
- OpenID Certification Portalで対象profileがpass
- 1時間以上のsoak testでSLO未達なし
- restore rehearsalとDR drillが定期運用化される
- 通知・監視・WAF・backupがstaging/prod相当で接続済み
- Gate結果がリリースごとに更新される

## 15. 実装開始判定
この計画は **Task 1から即時着手**。

最初に着手すべき理由:
- `oidc-provider` の永続adapter未整備は本番投入の最大ブロッカー
- ここが未解消のままだと、負荷試験やDR drillの結果も本番評価として扱えない
- Gate 1はrisk acceptance不可

初回PRの推奨範囲:
- PostgreSQL adapter用schema/migration
- adapter実装
- adapter contract test
- restart test
- `docs/14-production-readiness-plan.md` のTask 1進捗更新
