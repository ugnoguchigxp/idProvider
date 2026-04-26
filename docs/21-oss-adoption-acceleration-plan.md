# 21. OSS導入体験強化 実装計画（詳細版）

最終更新: 2026-04-26
ステータス: Ready for Execution（着手可能）
優先度: P0
関連テーマ: OSS Adoption / DX / Quickstart

## 1. 目的
OSS利用者が、最小セットアップで本プロジェクトを評価・PoC・運用試行できる導入体験を提供する。

達成したい状態:
- 30分Quickstartでログイン成功まで到達できる
- 1日PoCでBFFあり/なし、監視、運用手順まで確認できる
- ドキュメントだけで再現可能（暗黙知ゼロ）

## 2. 非目的（今回やらないこと）
- 商用サポートプランの策定
- 課金モデルや有償版機能の設計
- マルチテナント向け導入ガイド

## 3. 現状整理（2026-04-26）
### 3.1 実装済み
- `README.md` 基本手順
- `apps/example-bff` 統合例
- 運用文書群（runbook / risk register / dashboards）

### 3.2 ギャップ
1. Quickstartがユースケース別に分岐していない
2. サンプルがBFF中心で、SPA/モバイル導線が弱い
3. 観測（メトリクス/アラート）の初期適用手順が不足
4. QuickstartがCIで定期検証されていない

## 4. 成功指標（KPI）
- Time-to-first-success（cloneから初回login成功まで）: 30分以内
- Quickstart再現成功率（CI）: 100%
- 主要サンプル数（動作確認済み）: 3以上（BFFあり/SPA/モバイル）

## 5. スコープ
### 5.1 対象ファイル/ディレクトリ
- `README.md`
- `docs/quickstart/00-overview.md`（新規）
- `docs/quickstart/01-local-30min.md`（新規）
- `docs/quickstart/02-poc-1day.md`（新規）
- `docs/quickstart/03-observability-bootstrap.md`（新規）
- `docs/samples/bff-integration.md`（新規）
- `docs/samples/spa-integration.md`（新規）
- `docs/samples/mobile-integration.md`（新規）
- `apps/example-bff/*`
- `docs/dashboards/*`
- `docs/alerts/critical-alert-rules.md`
- `.github/workflows/nightly-regression.yml`

### 5.2 対象外
- UIデザイン刷新
- 外部クラウド運用代行

## 6. 実装前提（Definition of Ready）
- [ ] Quickstart対象環境（Node 24 / pnpm 10 / Docker）を固定
- [ ] サンプルで利用する固定ユーザー/クライアントを定義
- [ ] 失敗時のトラブルシュート項目のテンプレートを用意
- [ ] 実行時間計測（30分目標）の測定方法を定義

## 7. ドキュメント設計方針
### 7.1 章構成
- `00-overview`: 想定読者と導線図
- `01-local-30min`: 最短起動
- `02-poc-1day`: 監視/復旧/鍵ローテーションまで
- `03-observability-bootstrap`: ダッシュボード・アラート適用

### 7.2 記述ルール
- すべての手順はコピペ可能コマンドで記載
- 期待結果（HTTP status / log行 / UI表示）を明記
- 失敗時の復旧手順を同じページに記載

## 8. 実装ワークストリーム（PR単位）

### PR-21-01: Quickstart再編（骨格）
担当: DX + Backend
期限: 2026-04-27

変更対象:
- `README.md`
- `docs/quickstart/00-overview.md`
- `docs/quickstart/01-local-30min.md`

受け入れ条件:
- [ ] README先頭からQuickstartへ1クリックで遷移
- [ ] 30分手順に開始条件・終了条件がある

検証:
```bash
pnpm install
pnpm stack:up
pnpm db:migrate
pnpm db:seed
pnpm dev
```

### PR-21-02: 1日PoC導線
担当: Backend + SRE
期限: 2026-04-29

変更対象:
- `docs/quickstart/02-poc-1day.md`
- `docs/runbooks/*`（必要箇所のリンク補強）
- `docs/14-production-readiness-plan.md`（参照整備）

受け入れ条件:
- [ ] 認証成功だけでなく運用タスクまで辿れる
- [ ] DR/監視/鍵ローテーションへの導線がある

検証:
```bash
pnpm verify
pnpm verify:oidc-conformance
```

### PR-21-03: サンプル3種の整備
担当: Backend + Frontend + Mobile
期限: 2026-05-01

変更対象:
- `docs/samples/bff-integration.md`
- `docs/samples/spa-integration.md`
- `docs/samples/mobile-integration.md`
- `apps/example-bff/*`（必要最小限）

受け入れ条件:
- [ ] BFFあり / SPA / モバイルの3パターンを提供
- [ ] 各サンプルに想定失敗ケースと復旧手順がある

検証:
```bash
pnpm verify:example-bff-e2e
pnpm verify:sso-e2e
```

### PR-21-04: 観測ブートストラップ
担当: SRE + Security
期限: 2026-05-02

変更対象:
- `docs/quickstart/03-observability-bootstrap.md`
- `docs/dashboards/idp-security-dashboard.md`
- `docs/dashboards/idp-reliability-dashboard.md`
- `docs/alerts/critical-alert-rules.md`

受け入れ条件:
- [ ] 初期ダッシュボードの作成手順が明記
- [ ] Critical/Highアラート導入手順が明記

検証:
- synthetic check手順に従いメトリクス取得を確認

### PR-21-05: Quickstart CI検証
担当: DX + QA
期限: 2026-05-03

変更対象:
- `.github/workflows/nightly-regression.yml`
- `scripts/verify-quickstart.sh`（新規）
- `README.md`

受け入れ条件:
- [ ] Quickstartの主要手順がCIで自動検証される
- [ ] 失敗時にどのステップで落ちたか判別できる

検証:
```bash
bash ./scripts/verify-quickstart.sh
pnpm verify
```

## 9. Quickstart品質基準
- 所要時間が目標（30分/1日）を超える場合、原因と短縮案を記録
- すべての手順で「期待結果」があること
- すべての手順で「よくある失敗」と「復旧」があること

## 10. リスクと対策
1. ドキュメント肥大化で逆に読みにくくなる
- 対策: Quickstartは要点のみ、詳細はrunbookへリンク

2. サンプルがコード変更で壊れる
- 対策: PR-21-05でCI定期検証を導入

3. 観測手順が環境依存で再現不能
- 対策: 最低構成（ローカル）と推奨構成（staging）を分離記載

## 11. ロールバック方針
- 手順の再現性が確保できない場合、直前安定版のQuickstartへ戻す
- CI組み込みで不安定なステップは `experimental` として分離

## 12. 完了定義（Definition of Done）
- [ ] `docs/quickstart/*` が整備される
- [ ] 3サンプル（BFF/SPA/mobile）が文書化される
- [ ] 観測・アラート導入手順がある
- [ ] Quickstart検証がCIに組み込まれる
- [ ] 初見利用者向け30分導線が再現可能

## 13. スケジュール（固定日付）
1. 2026-04-27: PR-21-01
2. 2026-04-29: PR-21-02
3. 2026-05-01: PR-21-03
4. 2026-05-02: PR-21-04
5. 2026-05-03: PR-21-05
