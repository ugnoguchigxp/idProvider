# Production Go/No-Go Checklist

最終更新: 2026-04-26
対象: `docs/14-production-readiness-plan.md`

## 1. 目的
本番投入前に、Production Readiness Gate の結果を一枚に集約し、`Go` / `Conditional Go` / `No-Go` を明確に判定する。

このチェックリストは、P0未達や証跡欠落を見落としたまま本番投入することを防ぐための最終判定文書である。

## 2. 判定情報
- 判定日時:
- 判定者:
- 対象commit SHA:
- 対象環境:
- リリース候補バージョン:
- 判定: `Go` / `Conditional Go` / `No-Go`

## 3. Gate 判定
| Gate | 名称 | 判定 | 証跡リンク | 未解決事項 |
|---|---|---|---|---|
| Gate 0 | Local Verification |  |  |  |
| Gate 1 | Stateful OIDC |  |  |  |
| Gate 2 | Real Dependency Integration |  |  |  |
| Gate 3 | External Conformance |  |  |  |
| Gate 4 | Performance And Soak |  |  |  |
| Gate 5 | Operations Drill |  |  |  |

判定値:
- `Pass`: 必須条件を満たし、証跡がある
- `Conditional Pass`: P1未達があるが、fallback、owner、期限、利用者影響が明確
- `Fail`: 必須条件未達
- `No Evidence`: 未実施または証跡なし

## 4. P0 チェック
- [ ] `oidc-provider` はin-memory adapterに依存していない
- [ ] OIDC stateはPostgreSQLで永続化される
- [ ] IdP再起動後のOIDC flowが検証済み
- [ ] 複数インスタンスまたはstandby切替時のstate共有が検証済み
- [ ] 実DB/Redis統合テストが通過
- [ ] Authorization Code + PKCE E2Eが通過
- [ ] `pnpm verify` が通過
- [ ] `pnpm verify:security` が通過
- [ ] `pnpm verify:oidc-conformance` が通過
- [ ] P0未解決リスクが `docs/risk-register.md` に残っていない

## 5. P1 チェック
- [ ] OpenID Certification Portal実行記録がある
- [ ] 負荷・耐久試験レポートがある
- [ ] security notificationの実配送または代替経路が検証済み
- [ ] WAF/Bot対策/Turnstileのstaging enforce結果がある
- [ ] restore rehearsal記録がある
- [ ] DR drill記録がある
- [ ] key emergency rotation drill記録がある
- [ ] standby deploy -> verify -> switch traffic rehearsal記録がある

## 6. 未解決リスク
| Risk ID | 内容 | Priority | Owner | Due Date | Fallback | 判定影響 |
|---|---|---:|---|---|---|---|
|  |  |  |  |  |  |  |

記載ルール:
- P0が1件でも残る場合は `No-Go`
- P1はfallback、owner、期限、利用者影響が空欄の場合 `No-Go`
- 受容する残余リスクは `docs/risk-register.md` と同期する

## 7. Rollback 条件
以下のいずれかを満たした場合はrollbackまたはtraffic switch backを実行する。

- Login success ratio が10分以上SLOを下回る
- `/oauth/token` または `/v1/token/refresh` の5xx rateが5分以上 `0.1%` を超える
- `/readyz` が連続3回失敗する
- DB connection saturation が5分以上継続する
- Redis timeoutが認証フローへ波及する
- refresh token reuse検知、key compromise、admin権限異常などのcritical eventが発生する
- OIDC discovery / JWKS / token exchange の外形監視が失敗する

## 8. 初回24時間監視項目
- Login success ratio
- Login p95 / p99 latency
- Token refresh p95 / p99 latency
- Authorization check p95 / p99 latency
- 5xx rate
- DB connection utilization
- Redis latency / timeout
- OIDC adapter write/read error
- Bot challenge failure ratio
- Security event critical count
- Notification delivery failure count

## 9. 最終判定
### 判定
- `Go` / `Conditional Go` / `No-Go`

### 判定理由

### Conditional Go の条件
| 条件 | Owner | Due Date | 確認方法 |
|---|---|---|---|
|  |  |  |  |

### 承認
- Backend Lead:
- SRE:
- Security:
- Product/Business Owner:

## 10. 終了条件
- [ ] Gate 0-5の証跡リンクが埋まっている
- [ ] P0チェックがすべて完了している
- [ ] 未解決P1のfallbackが明記されている
- [ ] rollback条件が当番者に共有されている
- [ ] 初回24時間監視項目がdashboardまたはalertで確認できる
- [ ] 最終判定と承認者が記録されている
