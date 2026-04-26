# 16. OpenID Certification Portal Execution Plan

最終更新: 2026-04-26
ステータス: Planned（P1）
優先度: P1

## 1. 目的
内部 conformance だけでなく、OpenID Certification Portal の実行結果を取得し、OIDC標準適合の対外説明力を `Conditionally Pass` から `Pass` に引き上げる。

達成したい状態:
- OpenID Certification Portal の対象テストを実行する
- 成功/失敗件数と失敗ケースを記録する
- 失敗がある場合は issue 化と期限を固定する
- `docs/openid-conformance-records/` に監査可能な証跡を残す

## 2. 現状整理（2026-04-26）
### 2.1 観測事実
- `docs/openid-conformance-records/2026-04-26-run-001.md` は `Conditionally Pass`
- 判定理由は「Portal suite未実施」
- 内部 conformance / OpenAPI lint / SSO E2E は成功済み

### 2.2 リスク
1. 対外説明で「自己検証のみ」に見える
2. 標準互換の最終根拠が不足し、導入審査で不利
3. production readiness Gate 3 の完了判定を押し下げる

## 3. Gate（Go/No-Go）
### Gate 0: 実行準備
- [ ] Portalアカウント・権限を準備
- [ ] 対象issuer・redirect URI・client設定を固定
- [ ] 実行環境（staging推奨）を固定

Go条件:
- 3項目が埋まり、当日実行可能

No-Go条件:
- Portalログイン不能、または対象環境未固定

### Gate 1: テスト実行
- [ ] OPテストプランを作成
- [ ] 必須ケースを最後まで実行
- [ ] 実行ログ（日時・環境・設定）を保存

Go条件:
- 対象ケースの実行完了

No-Go条件:
- 実行途中停止で未完了

### Gate 2: 判定・是正
- [ ] pass/fail件数を記録
- [ ] fail を issue 化（owner / due date / fallback）
- [ ] `docs/openid-conformance-records/` を更新
- [ ] 可能なら再実行で pass 化

Go条件:
- 記録・課題化・再現手順が揃う

No-Go条件:
- 失敗があるのに記録/owner未設定

## 4. 完了定義（Definition of Done）
- [ ] Portal実行結果が記録済み
- [ ] Record判定が `Pass` または `Conditionally Pass（理由明記）`
- [ ] 失敗ケースの issue URL が記載済み
- [ ] `docs/oidc-compatibility.md` と実装差分が同期済み

## 5. スコープ
### 5.1 対象
- `docs/openid-conformance-suite-runbook.md`
- `docs/openid-conformance-records/2026-04-26-run-001.md`
- `docs/oidc-compatibility.md`
- `apps/idp-server/src/core/oidc-provider.ts`（失敗時に必要なら修正）
- `apps/idp-server/src/core/oidc-provider.conformance.test.ts`（失敗時に必要なら修正）

### 5.2 対象外
- FAPI advanced profile 完全対応
- Dynamic Client Registration 実装

## 6. 実行タスク
### Task 1: 実行前検証（Day 0）
担当: Backend + Security

内容:
- `pnpm verify:oidc-conformance`
- `pnpm verify:sso-e2e`
- discovery/JWKS/token endpoint の疎通確認

受け入れ条件:
- ローカル/ステージングの基礎検証成功

### Task 2: Portal実行（Day 0-1）
担当: Backend Lead

内容:
- PortalでOPテストプランを作成
- 対象ケースを実行し、結果を保存

受け入れ条件:
- 実行完了と結果エクスポート取得

### Task 3: 結果反映（Day 1）
担当: Backend + QA

内容:
- `docs/openid-conformance-records/2026-04-26-run-001.md` へ追記
- failケースを issue 化しURL記載
- 必要なら修正後に再実行

受け入れ条件:
- Record が監査可能な状態で更新済み

## 7. 検証コマンド
```bash
pnpm verify:oidc-conformance
pnpm verify:sso-e2e
pnpm verify:openapi
```

## 8. 証跡保存
- 実行記録: `docs/openid-conformance-records/`
- 失敗分析: `docs/test-failure.md`
- 互換性同期: `docs/oidc-compatibility.md`

## 9. スケジュール（固定日付）
1. 2026-04-26: Task 1（事前検証）
2. 2026-04-27: Task 2（Portal実行）
3. 2026-04-27: Task 3（結果反映・必要なら再実行）

## 10. 判定基準
- `Pass`: Portal主要ケースが成功し、失敗なし
- `Conditionally Pass`: 一部失敗ありだが issue/期限/fallback が固定されている
- `Fail`: 実行未完了、または重大失敗が未管理

## 11. 成果物
- 更新済み conformance record
- 失敗ケース issue 一覧
- 必要時の修正PR（実装 + テスト + 互換性ドキュメント）

