# 11. 不正検知（Fraud Detection）とボット対策 実装計画

最終更新: 2026-04-26
ステータス: Planned
優先度: P1

## 1. 目的
B2C向けIdPで増加しやすい credential stuffing・ボット大量登録・パスワードリセット悪用を、UX劣化を最小化しながら抑止する。

達成したい状態:
- 攻撃トラフィックをエッジ（WAF）とアプリ（IdP）の2段で遮断できる
- `/v1/signup` `/v1/login` `/v1/password/reset/request` で bot challenge を強制できる
- 高リスクログインを `security_events` と連携して検知し、追加認証または拒否を自動化できる
- 誤検知時に閾値を調整して短時間で運用復旧できる

## 2. 現状整理（2026-04-26）
### 2.1 実装済み
- 認証系APIにレート制限がある
  - `RATE_LIMIT_SIGNUP_PER_MIN`
  - `RATE_LIMIT_LOGIN_PER_MIN`
  - `RATE_LIMIT_OAUTH_PER_MIN`
- `login.success` / `login.failed` などの `security_events` は記録済み
- `docs/security-runbook.md` と `docs/security-event-catalog.md` が運用基盤として存在

### 2.2 ギャップ
1. CAPTCHA/Turnstile のサーバー検証が未実装
2. エッジWAFとIdPのリスク判定連動が未定義
3. ボット関連イベント種別とアラート閾値が未定義
4. 「拒否・追加認証・許可」の判定基準が運用上固定されていない

## 3. 完了定義（Definition of Done）
- [ ] `/v1/signup` `/v1/login` `/v1/login/google` `/v1/password/reset/request` に bot challenge 検証が入る
- [ ] challenge未提出/不正スコア時に 4xx で拒否し、`security_events` に記録される
- [ ] WAF側で credential stuffing と signup burst のルールが有効化される
- [ ] リスク判定（低・中・高）とアクション（許可・追加認証・拒否）が文書化される
- [ ] `docs/security-runbook.md` に BOT対策シナリオが追記される
- [ ] 関連テスト（unit/contract）が追加される
- [ ] `pnpm verify` が通る

## 4. スコープ
### 4.1 対象
- `apps/idp-server/src/modules/auth/auth.routes.ts`
- `apps/idp-server/src/modules/auth/auth.service.ts`
- `apps/idp-server/src/config/env.ts`
- `apps/idp-server/src/core/metrics.ts`
- `apps/idp-server/src/modules/auth/*.test.ts`
- `apps/idp-server/src/contracts/public-auth.openapi-contract.test.ts`
- `docs/security-event-catalog.md`
- `docs/security-runbook.md`
- `docs/alerts/critical-alert-rules.md`
- `docs/11-fraud-detection-bot-mitigation-plan.md`

### 4.2 対象外
- 外部ベンダー契約・料金交渉
- 端末フィンガープリントの独自実装
- SIEM製品入れ替え

## 5. 実行前提・依存関係
1. Bot対策プロバイダを `Cloudflare Turnstile` で統一（本計画の前提）
2. 秘密情報を環境変数で管理
  - `TURNSTILE_SECRET_KEY`
  - `TURNSTILE_SITE_KEY`
  - `TURNSTILE_MIN_SCORE`（初期値 0.5）
3. `security_events` に追加するイベント名を先に固定
  - `bot.challenge.failed`
  - `bot.challenge.missing`
  - `bot.risk.blocked`
4. WAF管理権限（SecOps）とIdP実装権限（Backend）の担当を分ける

## 6. 実装タスク（即時着手順）
### Task 1: Challenge検証基盤の実装（Day 1-2）
担当: Backend

対象:
- `apps/idp-server/src/config/env.ts`
- `apps/idp-server/src/modules/auth/auth.routes.ts`
- `apps/idp-server/src/modules/auth/*.test.ts`

内容:
- Turnstileトークン受け取り用のリクエスト項目を追加
- サーバー側検証処理を追加（トークン未提出時は拒否）
- 検証失敗時に `bot.challenge.missing` / `bot.challenge.failed` を記録

受け入れ条件:
- 4対象APIで token 必須化が機能し、未提出時に 4xx を返す

### Task 2: リスクスコア判定とアクション分岐（Day 2-4）
担当: Backend + Security

対象:
- `apps/idp-server/src/modules/auth/auth.service.ts`
- `apps/idp-server/src/core/metrics.ts`
- `apps/idp-server/src/modules/auth/*.test.ts`

内容:
- 入力シグナル（challenge score, IP, 失敗回数, UA）から低/中/高の3段階判定
- 判定アクション:
  - 低: 許可
  - 中: 追加認証（MFA要求）
  - 高: 拒否 + `bot.risk.blocked`
- メトリクス追加: `idp_bot_challenge_total`, `idp_bot_block_total`

受け入れ条件:
- 高リスク入力で認証が拒否され、イベント/メトリクスが記録される

### Task 3: WAFルール実装（Day 3-5）
担当: SecOps

対象:
- WAF管理コンソール（AWS WAF または Cloudflare WAF）
- `docs/alerts/critical-alert-rules.md`

内容:
- ルール1: `/v1/login` の短時間失敗急増を遮断
- ルール2: `/v1/signup` の burst トラフィックを遮断
- ルール3: 既知悪性IP/ASNの deny list 連携

受け入れ条件:
- ステージングで意図した遮断動作を再現できる

### Task 4: 監視・Runbook更新（Day 4-6）
担当: Security

対象:
- `docs/security-event-catalog.md`
- `docs/security-runbook.md`
- `docs/alerts/critical-alert-rules.md`

内容:
- イベント追加と重大度を定義
- Runbookに `RB-BOT-MITIGATION` を追加
- 閾値超過時の封じ込め手順（WAF強化/閾値変更/一時ブロック）を固定

受け入れ条件:
- アラートからRunbookまで1クリックで辿れる

### Task 5: E2E検証と本番反映（Day 7-10）
担当: Backend + QA + SecOps

対象:
- `apps/idp-server/src/contracts/public-auth.openapi-contract.test.ts`
- CI/CDデプロイ手順

内容:
- 正常系: 正常challengeで signup/login/reset が通る
- 異常系: 無効challenge、score不足、短時間再試行で拒否される
- 本番反映は段階的に有効化（signup -> password reset -> login）

受け入れ条件:
- 本番で誤検知率を監視しつつ3日間安定運用できる

## 7. 実行スケジュール（固定日付）
1. 2026-04-27: Task 1 着手、環境変数とリクエスト拡張
2. 2026-04-28: Task 1 完了、Task 2 着手
3. 2026-04-29: Task 2 中間レビュー（判定閾値を暫定固定）
4. 2026-04-30: Task 3 実装・ステージング検証
5. 2026-05-01: Task 4 完了（イベント/Runbook/アラート）
6. 2026-05-04: Task 5 開始（E2E・負荷・誤検知確認）
7. 2026-05-08: 本番段階反映完了、運用引き継ぎ

## 8. テストマトリクス
1. API機能
- challenge token が有効なら `/v1/signup` `/v1/login` が成功
- token欠損・期限切れ・改ざんで拒否

2. リスク判定
- 同一IPで失敗連打時に `bot.risk.blocked` が記録
- 中リスクで MFA要求レスポンスに遷移

3. 監視連動
- `bot.challenge.failed` 急増時に alert 発報
- alert から `RB-BOT-MITIGATION` に遷移

## 9. ロールアウト方針
- Phase A: `report-only`（ログのみ）で24時間観測
- Phase B: `/v1/signup` と `/v1/password/reset/request` を強制化
- Phase C: `/v1/login` `/v1/login/google` を強制化

## 10. ロールバック戦略
- challenge provider障害時:
  - 一時的に `report-only` へ戻す
  - WAF rate limitを強化して補完
- 誤検知増加時:
  - `TURNSTILE_MIN_SCORE` を暫定緩和
  - 高リスク閾値を段階調整（変更履歴をRunbookへ記録）

## 11. 検証コマンド
```bash
pnpm --filter @idp/idp-server test
pnpm verify
```

## 12. 実行チェックリスト
- [ ] Turnstile環境変数の追加
- [ ] 4対象APIへのchallenge検証組み込み
- [ ] `security_events` イベント種別の追加
- [ ] WAFルール有効化（staging/prod）
- [ ] runbook/alert更新
- [ ] 誤検知率の3日監視完了
- [ ] `pnpm verify` 通過
