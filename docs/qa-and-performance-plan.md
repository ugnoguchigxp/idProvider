# 品質保証 (QA) および性能試験計画

最終更新: 2026-04-25
対象: 信頼性と高パフォーマンスの担保

---

## 1. 目的
大規模（100万人規模）な利用に耐えうる性能目標を達成し、主要な認証フローが常に正しく動作することを自動テストによって保証する。

## 2. テスト戦略

### 2-1. 主要フローの E2E テスト
API レベルでのシナリオテストを整備し、コンポーネント間の連携を検証する。
- **対象フロー**:
  - `Signup`: ユーザー作成 -> メール検証 -> ログイン可否。
  - `Login`: 認証成功 -> トークン発行 -> ログイン失敗（レート制限・ロック）。
  - `Token Refresh`: RTR (Rotation) の正常系および再利用検知による失効。
  - `Authorization Check`: ロール/パーミッションに基づく認可結果の整合性。
- **使用ツール**: Vitest + `hono/testing`（`supertest` は使用しない）

#### 2-1-1. E2E 受け入れ基準（実装完了条件）

| フロー | シナリオ | 期待ステータス/レスポンス | サーバー側期待状態 |
| :--- | :--- | :--- | :--- |
| Signup | 新規ユーザー作成（メール未検証） | `201`。`userId` と `verificationRequired=true` を返す | `users` にレコード作成。`emailVerifiedAt=null` |
| Signup | メール検証トークン適用後にログイン | 検証APIが `204`、ログインAPIが `200` | `emailVerifiedAt` が更新される |
| Signup | 未検証状態でログイン | `403`（または仕様で定義した拒否コード） | トークン未発行、監査ログに拒否理由を記録 |
| Login | 正常ログイン（正しいID/PW） | `200`。`accessToken` / `refreshToken` を返す | 最終ログイン時刻更新、失敗カウンタ初期化 |
| Login | パスワード誤りを閾値未満で繰り返し | `401` | 失敗カウンタ増加 |
| Login | 閾値超過後のログイン | `429` または `423`（仕様で固定） | ロック状態が設定される |
| Token Refresh | 有効な `refreshToken` による更新 | `200`。新しい `accessToken` / `refreshToken` を返す | 旧 `refreshToken` は無効化、新規トークン保存 |
| Token Refresh | 失効済み/再利用 `refreshToken` の使用 | `401` | 当該セッションを失効、監査ログ記録 |
| Authorization Check | 権限ありロールで保護API呼び出し | `200` | 判定ログに allow を記録 |
| Authorization Check | 権限なしロールで保護API呼び出し | `403` | 判定ログに deny を記録 |

補足:
- 各フローで DB アサーション対象テーブルと監査ログ項目をテストケースごとに固定する。
- エラー時レスポンスの `errorCode` / `message` の最小必須項目を OpenAPI と一致させる。

### 2-2. 契約テスト (Contract Testing)
OpenAPI 仕様書 (`openapi.yaml`) と実際の実装が乖離していないかを CI で検証する。
- **手法**:
  - `prism` 等を用いた OpenAPI へのリクエスト/レスポンス・バリデーション。
  - Zod スキーマと OpenAPI 定義の自動同期確認。

### 2-3. セキュリティテスト
- **静的解析**: `biome lint`, `npm audit`, `snyk` による脆弱性スキャン。
- **動的解析 (DAST)**: ログインエンドポイント等への基本的なペネトレーションテスト。

## 3. 性能目標 (Performance Targets)

以下の数値をサービス開始時の代表目標（初期値）として定義する。

| 対象操作 | 目標 TPS | p95 Latency | 許容エラー率 |
| :--- | :--- | :--- | :--- |
| **Login (Password)** | 200 TPS | < 200ms | < 0.1% |
| **Token Refresh** | 500 TPS | < 100ms | < 0.01% |
| **Authorization Check** | 1,000 TPS | < 50ms | < 0.001% |

- **条件**: データベース接続およびキャッシュ（Redis）が正常に動作している環境。
- **環境スペック想定**: Azure VM `2 vCPU / 8GB RAM`（単一インスタンス）
- **負荷モデル**: ステップ状に負荷を上げ、限界値（Breaking Point）を特定する。
- **本ドキュメントでの扱い**: 実際の負荷試験（実トラフィック送信）は実施しない。k6 シナリオ実装としきい値定義、CI での構文/静的検証までを対象とする。

## 4. 負荷試験の実装
- **使用ツール**: [k6](https://k6.io/) (TypeScript/JavaScript で記述可能で高パフォーマンス)
- **試験場所**: 実行はしない（準備のみ）。将来実施時はステージング環境を使用。
- **今回の実装範囲**:
  - `apps/idp-server/load-tests/` に主要シナリオ（Login/Token Refresh/Authorization）を作成。
  - k6 `thresholds` に TPS / p95 / error rate の目標値をコード化。
  - CI では `k6 archive` または `k6 inspect` による構文検証のみを行う。

## 5. CI/CD 統合 (GitHub Actions)
1. **Pull Request 時**: 
   - `lint`、`typecheck`、ユニット/E2E、OpenAPI lint を実行。
   - セキュリティは `npm audit --audit-level=high` までを必須化。
   - k6 は「実行」ではなくシナリオ妥当性チェックのみ実行。
   - すべて通過しない限りマージ不可。
2. **Main Branch マージ時**:
   - ステージング環境の `standby` ノードにのみ自動デプロイ。
   - `standby` で `/healthz` とスモーク E2E（Login と Token Refresh の最小経路）を実行。
   - 検証成功後にリバースプロクシの向き先を切り替え（`online`/`standby` 反転）。
   - 実負荷試験は実施しない。
3. **定期実行 (Scheduled)**:
   - 深夜帯に軽量回帰ジョブ（OpenAPI lint、主要 E2E、`npm audit`）を実行。
   - 実負荷試験は含めない。

### 5-1. ジョブ分割の具体イメージ

| ワークフロー | トリガー | 目的 | 主なジョブ |
| :--- | :--- | :--- | :--- |
| `ci-pr.yml` | `pull_request` | マージ前品質ゲート | `lint` / `typecheck` / `unit-e2e` / `openapi-contract` / `security-audit` / `k6-validate` |
| `deploy-main.yml` | `push` (`main`) | リリース安全性確保 | `build` / `deploy-standby` / `verify-standby` / `switch-traffic` |
| `nightly-regression.yml` | `schedule` (毎日深夜) | ドリフト早期検知 | `openapi-contract` / `core-e2e` / `security-audit` |

ジョブ分割ルール:
- PR は 10-15 分以内で終わる軽量ジョブのみ必須化し、開発速度を優先する。
- `main` 後は `standby` デプロイ -> 検証 -> 切替の順で実行し、障害を早期に検知する。
- 夜間は回帰検知に集中し、時間のかかる検証を定期実行する。
- 実負荷試験ジョブは本計画の対象外とし、将来導入時に別ワークフローとして追加する。

## 6. デプロイ設計方針（低依存・段階拡張）

### 6-1. Phase 1（現時点）: LB なし Active/Standby
- VM2台構成（`online` / `standby`）で運用する。
- 新バージョンは常に `standby` に先行配備する。
- `standby` のヘルスチェックとスモーク E2E 成功後に、リバースプロクシ設定を切り替える。
- 問題時は即座に向き先を戻してロールバックする。

### 6-2. Phase 2（将来）: LB 導入へ差し替え
- 切替の責務を「リバースプロクシ設定変更」から「LB の重み/バックエンド切替」に置換する。
- デプロイ手順（`standby` 配備 -> 検証 -> 切替）は維持し、運用手順の互換性を保つ。
- これにより、初期コストを抑えつつ将来の可用性強化へ移行可能にする。

### 6-3. 依存性を上げないための実装ルール
- 切替操作は `switch-traffic` スクリプトに集約し、実体（Nginx 変更 or LB API 呼び出し）を差し替え可能にする。
- ヘルス判定は `/healthz` と最小スモーク E2E の2段階で固定し、基盤が変わっても同じ判定を使う。
- デプロイ対象ノードの指定は `ONLINE_HOST` / `STANDBY_HOST` の環境変数で管理し、ワークフローのロジックにハードコードしない。
- ロールバックも `switch-traffic --to <previous>` の同一手順で実行可能にする。

## 7. ステップ別タスク
1. **k6 シナリオ作成**: `apps/idp-server` に `load-tests/` ディレクトリを作成。
2. **GitHub Actions ワークフロー整備**: `deploy-standby` / `verify-standby` / `switch-traffic` を含む構成にする。
3. **性能監視基盤の連携**: 将来の実負荷試験に備えてメトリクス連携設計のみ定義する。
