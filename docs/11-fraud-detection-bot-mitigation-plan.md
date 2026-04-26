# 11. 不正検知（Fraud Detection）とボット対策 実装計画

最終更新: 2026-04-26
ステータス: In Progress (App Implementation Completed)
優先度: P1

## 1. 目的
B2C向けIdPで増加しやすい credential stuffing・ボット大量登録・パスワードリセット悪用を、UX劣化を最小化しながら抑止する。

達成したい状態:
- 攻撃トラフィックをエッジ（WAF）とアプリ（IdP）の2段で遮断できる
- `/v1/signup` と `/v1/password/reset/request` は bot challenge を強制できる
- `/v1/login` と `/v1/login/google` は高リスク時のみ challenge を要求できる
- 高リスク試行を `security_events` とメトリクスで検知し、拒否または追加認証へ分岐できる
- 誤検知や provider 障害時に、可用性を保ちながら短時間で運用復旧できる

## 2. 方針（B2C戦略との整合）
`docs/b2c-authorization-and-boundary-strategy.md` の frictionless 方針に従い、常時摩擦を増やす設計は避ける。

- signup/reset: 原則 challenge 必須（fail-closed）
- login/google login: デフォルトは challenge 非必須、リスク時のみ要求（段階適用）
- ボット判定は Turnstile の server-side 検証結果（`success`）と `action`/`hostname` の整合を必須とする
- スコア前提の固定設計は採用しない（provider 仕様差異による誤判定を避ける）

## 3. 現状整理（2026-04-26）
### 3.1 実装済み
- 認証系APIにレート制限がある
  - `RATE_LIMIT_SIGNUP_PER_MIN`
  - `RATE_LIMIT_LOGIN_PER_MIN`
  - `RATE_LIMIT_OAUTH_PER_MIN`
- `login.success` / `login.failed` などの `security_events` は記録済み
- `/metrics` および alert/runbook 基盤は整備済み

### 3.2 ギャップ
1. Turnstile の server-side 検証が未実装
2. endpoint ごとの challenge 強制度（必須/リスク時/無効）が未定義
3. Bot関連イベント・アラート閾値が未定義
4. provider 障害時の fail-open / fail-closed 方針が未定義
5. OpenAPI/SDK 互換性を維持した移行計画が未定義

## 4. 完了定義（Definition of Done）
- [x] `/v1/signup` `/v1/password/reset/request` で challenge 必須が機能する
- [x] `/v1/login` `/v1/login/google` でリスク時 challenge 要求が機能する
- [x] challenge 未提出/無効時に 4xx を返し、`security_events` に記録される
- [ ] WAF 側で stuffing / signup burst ルールが有効化される
- [x] fail-open / fail-closed ポリシーが文書化される
- [x] OpenAPI と contract test が更新され、クライアント移行手順が定義される
- [x] 関連テスト（unit/contract）が追加される
- [ ] `pnpm verify` が通る

## 5. スコープ
### 5.1 対象
- `apps/idp-server/src/modules/auth/auth.routes.ts`
- `apps/idp-server/src/modules/auth/auth.service.ts`
- `apps/idp-server/src/config/env.ts`
- `apps/idp-server/src/core/metrics.ts`
- `apps/idp-server/src/modules/auth/*.test.ts`
- `apps/idp-server/src/contracts/public-auth.openapi-contract.test.ts`
- `packages/shared/src/schemas/auth.ts`
- `docs/openapi.yaml`
- `docs/security-event-catalog.md`
- `docs/security-runbook.md`
- `docs/alerts/critical-alert-rules.md`

### 5.2 対象外
- 外部ベンダー契約・料金交渉
- 独自デバイスフィンガープリント基盤の開発
- SIEM製品入れ替え

## 6. 実行前提・依存関係
1. Bot対策プロバイダを Cloudflare Turnstile で統一
2. 環境変数を追加
  - `TURNSTILE_SECRET_KEY`
  - `TURNSTILE_SITE_KEY`
  - `TURNSTILE_VERIFY_URL`（default: `https://challenges.cloudflare.com/turnstile/v0/siteverify`）
  - `TURNSTILE_REQUIRED_ACTIONS`（CSV: 例 `signup,password_reset`）
  - `TURNSTILE_ENFORCE_LOGIN_MODE`（`off|risk|always`, default `risk`）
  - `TURNSTILE_EXPECTED_HOSTNAME`（任意。設定時は一致必須）
3. 追加イベント名を固定
  - `bot.challenge.missing`
  - `bot.challenge.invalid`
  - `bot.challenge.provider_error`
  - `bot.risk.blocked`
4. WAF管理権限（SecOps）とIdP実装権限（Backend）を分離

## 7. 実装タスク（即時着手順）
### Task 1: Challenge 検証基盤（Day 1-2）
担当: Backend

対象:
- `apps/idp-server/src/config/env.ts`
- `packages/shared/src/schemas/auth.ts`
- `apps/idp-server/src/modules/auth/auth.routes.ts`
- `apps/idp-server/src/modules/auth/*.test.ts`

内容:
- `signup/login/google-login/password-reset-request` に challenge token 入力項目を追加
- Turnstile Siteverify を server-side で呼び出す
- `success` 判定に加え、`action` と `hostname`（設定時）を検証
- token 未提出/無効時は 4xx を返しイベント記録

受け入れ条件:
- signup/reset は token 必須で拒否動作が再現できる
- login/google-login は mode 設定に従って token 要求可否が切り替わる

### Task 2: リスク判定とアクション分岐（Day 2-4）
担当: Backend + Security

対象:
- `apps/idp-server/src/modules/auth/auth.service.ts`
- `apps/idp-server/src/core/metrics.ts`
- `apps/idp-server/src/modules/auth/*.test.ts`

内容:
- スコア依存ではなく、以下シグナルで低/中/高リスク判定
  - 同一IP/同一アカウントの短時間失敗回数
  - UA/IP の異常パターン（急変・高頻度）
  - challenge 失敗・欠損率
- 判定アクション:
  - 低: 許可
  - 中: challenge 要求または MFA 要求
  - 高: 拒否 + `bot.risk.blocked`
- メトリクス追加:
  - `idp_bot_challenge_total{result="passed|failed|missing|error"}`
  - `idp_bot_block_total{endpoint="signup|login|google_login|password_reset"}`

受け入れ条件:
- 高リスク入力で拒否とイベント/メトリクス記録が確認できる

### Task 3: WAF 連携（Day 3-5）
担当: SecOps

対象:
- WAF 管理コンソール（Cloudflare WAF または AWS WAF）
- `docs/alerts/critical-alert-rules.md`

内容:
- ルール1: `/v1/login` の短時間失敗急増を制限
- ルール2: `/v1/signup` の burst を制限
- ルール3: 悪性IP/ASN deny list 連携

受け入れ条件:
- ステージングで意図した遮断が再現できる

### Task 4: 運用導線更新（Day 4-6）
担当: Security

対象:
- `docs/security-event-catalog.md`
- `docs/security-runbook.md`
- `docs/alerts/critical-alert-rules.md`

内容:
- 追加イベントの重大度・対応 Runbook ID を定義
- `RB-BOT-MITIGATION` を追加
- 封じ込め手順（WAF強化、閾値調整、一時 mode 変更）を固定

受け入れ条件:
- アラートから runbook へ 1 クリックで到達できる

### Task 5: API互換性と段階ロールアウト（Day 7-10）
担当: Backend + QA + SecOps

対象:
- `docs/openapi.yaml`
- `apps/idp-server/src/contracts/public-auth.openapi-contract.test.ts`
- リリース手順書

内容:
- OpenAPI に challenge token 項目を反映
- 既存クライアント向け移行期間を設定（受理期間 + 警告ログ）
- 段階反映:
  1. report-only
  2. signup/reset 強制
  3. login/google-login を risk mode で有効化

受け入れ条件:
- 互換性崩壊なく段階導入でき、`pnpm verify` が通る

## 8. ロールアウト方針
- Phase A: report-only（24時間）
- Phase B: signup/reset を enforce
- Phase C: login/google-login を `risk` mode で有効化
- Phase D: 必要時のみ `always` を短時間適用（恒常運用はしない）

## 9. 障害時ポリシー（可用性優先）
- Turnstile provider 障害時:
  - signup/reset: fail-closed を基本。重大障害時のみ一時 fail-open を手動許可
  - login/google-login: fail-open + rate limit 強化 + 監視強化
- 誤検知増加時:
  - login mode を `off` または `risk` に戻す
  - WAF しきい値を暫定緩和し、変更履歴を runbook に記録

## 10. テストマトリクス
1. API機能
- 有効 token で signup/login/reset が通る
- token 欠損・期限切れ・重複利用で拒否

2. リスク判定
- 同一IP失敗連打時に `bot.risk.blocked` 記録
- 中リスクで challenge 要求または MFA 要求へ遷移

3. 監視連動
- `bot.challenge.invalid` 急増時に alert 発報
- alert から `RB-BOT-MITIGATION` へ遷移

## 11. 検証コマンド
```bash
pnpm --filter @idp/idp-server test
pnpm verify
```

## 12. 実行チェックリスト
- [x] Turnstile 環境変数を追加
- [x] 4対象APIへ challenge 入力/検証を組み込み
- [x] `security_events` イベント種別を追加
- [ ] WAF ルールを staging/prod へ適用
- [x] runbook/alert を更新
- [x] OpenAPI/contract test/移行手順を更新
- [ ] `pnpm verify` 通過

## 13. 実装サマリ（2026-04-26）
- `TURNSTILE_*` と `BOT_RISK_*` の環境変数を追加し、起動時バリデーションを実装した。
- `signup/login/google login/password reset request` に challenge token 入力を追加した。
- Turnstile server-side 検証を追加し、`success/action/hostname` を検証した。
- login系に `off|risk|always` の challenge 強制度と、bot リスク判定（low/medium/high）を追加した。
- `bot.challenge.*` と `bot.risk.blocked` を `security_events` に記録する導線を追加した。
- `idp_bot_challenge_total` / `idp_bot_block_total` メトリクスを追加した。
- `docs/openapi.yaml` / `docs/security-event-catalog.md` / `docs/security-runbook.md` / `docs/alerts/critical-alert-rules.md` を更新した。
