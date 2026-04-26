# 17. SDK / Integration Experience 実装計画（詳細版）

最終更新: 2026-04-26
ステータス: Ready for Execution（着手可能）
優先度: P0
関連テーマ: Single-tenant特化 / Microservices / Mobile

## 1. 目的
シングルテナント前提のOSS IdPとして、複数マイクロサービスとモバイルアプリが短時間で安全に統合できるSDK体験を提供する。

達成したい状態:
- Node / Kotlin / Swift の3系統で、同じ認証体験（login / refresh / revoke / logout）を提供する
- OAuth/OIDCフローとエラーハンドリングがSDK間で揃う
- 初回利用者が `README` とサンプルのみで統合を完了できる

## 2. 非目的（今回やらないこと）
- Dynamic Client Registration
- マルチテナント管理SDK
- FAPI advanced profile完全対応
- 各言語向けの高度なUIコンポーネント提供

## 3. 現状整理（2026-04-26）
### 3.1 実装済み
- `packages/oidc-client-sdk`（TypeScript）
- `apps/example-bff` の最小統合
- `scripts/verify-example-bff-e2e.sh` による回帰導線

### 3.2 ギャップ
1. Kotlin / Swift の公式SDKがない
2. refresh失敗時の再認証ポリシーが仕様固定されていない
3. SDK公開APIの互換性ポリシーが明文化されていない

## 4. 成功指標（KPI）
- Time-to-first-login（Quickstart開始から最初のトークン取得まで）: 30分以内
- SDK統合サンプルの成功率（CI）: 100%
- 破壊的変更の未告知リリース: 0件

## 5. スコープ
### 5.1 対象ファイル/ディレクトリ
- `packages/oidc-client-sdk/*`
- `apps/example-bff/*`
- `docs/oidc-client.md`
- `docs/oidc-compatibility.md`
- `docs/openapi.yaml`
- `docs/samples/sdk-node-example.md`（新規）
- `docs/samples/sdk-kotlin-example.md`（新規）
- `docs/samples/sdk-swift-example.md`（新規）
- `packages/mobile-kotlin-sdk/*`（新規）
- `packages/mobile-swift-sdk/*`（新規）

### 5.2 対象外
- サーバー側の新規認証方式追加（例: CIBA）
- SDKの商用サポート体制設計

## 6. 実装前提（Definition of Ready）
着手前に以下を満たすこと。
- [ ] `docs/oidc-client.md` に標準フロー（PKCE / refresh / revoke / logout）を記述
- [ ] エラーコード一覧（`invalid_grant`, `invalid_client`, `mfa_required` など）を固定
- [ ] SDKのSemVer運用ルールを定義
- [ ] サンプルで利用するテスト用クライアントID/redirect URIを固定

## 7. 設計方針
### 7.1 API方針
- SDKは「OIDC準拠 + 本プロジェクト固有拡張（MFA/entitlement）」の二層APIを持つ
- Core APIは各言語で同名/同責務に寄せる

必須API（3SDK共通）:
- `beginLogin()`
- `exchangeCode()`
- `refreshToken()`
- `revokeToken()`
- `logout()`
- `getUserInfo()`

### 7.2 エラー方針
- すべてのSDKでエラーをカテゴリ化して返す
  - `NetworkError`
  - `TokenExpiredError`
  - `InvalidGrantError`
  - `MfaRequiredError`
  - `ServerError`
- 再試行可否フラグをエラーオブジェクトに持たせる

### 7.3 互換性方針
- `MAJOR`: 破壊的変更
- `MINOR`: 後方互換ありの機能追加
- `PATCH`: バグ修正
- サポート期間: 直近2minorを推奨サポート

## 8. 実装ワークストリーム（PR単位）

### PR-17-01: SDK契約固定
担当: Backend Lead
期限: 2026-04-27

変更対象:
- `docs/oidc-client.md`
- `docs/oidc-compatibility.md`
- `docs/openapi.yaml`（必要なレスポンス例の補強）

受け入れ条件:
- [ ] 3SDK共通APIとエラー契約がドキュメントに存在
- [ ] 例外ケース（refresh失敗、revoked token、MFA step-up）が明示

検証:
```bash
pnpm verify:openapi
pnpm --filter @idp/idp-server test:contract
```

### PR-17-02: Node SDK整理
担当: Backend
期限: 2026-04-29

変更対象:
- `packages/oidc-client-sdk/src/index.ts`
- `packages/oidc-client-sdk/src/__tests__/index.test.ts`
- `packages/oidc-client-sdk/package.json`

受け入れ条件:
- [ ] 公開APIがPR-17-01の契約と一致
- [ ] refresh/revoke時の異常系テストを追加

検証:
```bash
pnpm --filter @idp/oidc-client-sdk test
pnpm --filter @idp/oidc-client-sdk typecheck
```

### PR-17-03: Kotlin SDK最小実装
担当: Mobile
期限: 2026-05-01

変更対象:
- `packages/mobile-kotlin-sdk/README.md`
- `packages/mobile-kotlin-sdk/src/*`（新規）
- `docs/samples/sdk-kotlin-example.md`

受け入れ条件:
- [ ] `login / refresh / logout` の実装
- [ ] 例外マッピング（少なくとも3種）

検証:
- Kotlinユニットテスト（Gradle）
- 手動疎通（stagingまたはlocal）

### PR-17-04: Swift SDK最小実装
担当: Mobile
期限: 2026-05-02

変更対象:
- `packages/mobile-swift-sdk/README.md`
- `packages/mobile-swift-sdk/Sources/*`（新規）
- `docs/samples/sdk-swift-example.md`

受け入れ条件:
- [ ] `login / refresh / logout` の実装
- [ ] 例外マッピング（少なくとも3種）

検証:
- Swift Package test
- 手動疎通（stagingまたはlocal）

### PR-17-05: サンプル統合 + CI導線
担当: Backend + QA
期限: 2026-05-03

変更対象:
- `apps/example-bff/*`
- `docs/samples/sdk-node-example.md`
- `.github/workflows/ci-pr.yml`
- `scripts/verify-example-bff-e2e.sh`

受け入れ条件:
- [ ] `README` から30分以内にNode統合サンプルが動く
- [ ] CIでSDKサンプル検証が回る

検証:
```bash
pnpm verify
pnpm verify:example-bff-e2e
```

## 9. テスト計画
### 9.1 必須テスト
- 正常系: login -> refresh -> userinfo -> logout
- 異常系: invalid_grant, token revoked, network timeout
- 境界系: refresh token多重実行時の挙動

### 9.2 回帰テスト
- 既存 `packages/oidc-client-sdk` のAPI互換性
- `apps/example-bff` のE2E

## 10. ドキュメント成果物
- `docs/oidc-client.md`（契約仕様）
- `docs/samples/sdk-node-example.md`
- `docs/samples/sdk-kotlin-example.md`
- `docs/samples/sdk-swift-example.md`

## 11. リスクと対策
1. SDK間で仕様がズレる
- 対策: PR-17-01で契約固定し、変更時は同時修正を必須化

2. モバイルSDKの実装コスト超過
- 対策: 最小機能（login/refresh/logout）に限定し段階提供

3. サンプルが動かない
- 対策: CIで `verify:example-bff-e2e` を必須化

## 12. ロールバック方針
- SDKの破壊的変更を検出した場合、直前タグへ戻す
- サンプル不整合時は `docs/samples/` を一時的に「experimental」表記に戻す

## 13. 完了定義（Definition of Done）
- [ ] 3SDKで共通契約を満たす
- [ ] Node/Kotlin/Swiftそれぞれで最小フローが通る
- [ ] サンプルがCIで再現可能
- [ ] `pnpm verify` が成功
- [ ] 互換性ポリシーがドキュメント化される

## 14. スケジュール（固定日付）
1. 2026-04-27: PR-17-01
2. 2026-04-29: PR-17-02
3. 2026-05-01: PR-17-03
4. 2026-05-02: PR-17-04
5. 2026-05-03: PR-17-05
