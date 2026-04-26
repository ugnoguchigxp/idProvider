# 05. Key Management・Rotation 実装計画

最終更新: 2026-04-26
ステータス: Completed
優先度: P1

## 1. 背景と目的
IdP の信頼境界は署名鍵に依存するため、鍵ライフサイクル（生成・ローテーション・失効・監査・復旧）をアプリ運用として成立させる。

この計画の目的:
- 平常時の定期ローテーションを安全に継続できる
- 漏洩疑い時に即時封じ込め（緊急失効）できる
- 監査時に鍵変更履歴と実行理由を説明できる

## 2. 完了定義（Definition of Done）
以下をすべて満たしたら完了:

- [x] 手動ローテーションと緊急失効の実行APIがある
- [x] `signing_keys` の状態遷移（active / grace / revoked）が実装で明示される
- [x] JWKS に公開される鍵条件（active + grace, revoked除外）が固定される
- [x] 鍵操作イベントが監査ログに記録される
- [x] OpenAPI 契約と実装が一致する
- [x] Runbook（漏洩対応）が存在し、運用手順が実行可能
- [x] `pnpm verify` が通る

## 3. スコープ
### 3.1 対象
- `packages/auth-core/src/key-store-service.ts`
- `packages/db/src/schema.ts`
- `infra/migrations/*`（鍵ライフサイクル列追加）
- `apps/idp-server/src/modules/keys/*`
- `apps/idp-server/src/app.ts`
- `apps/idp-server/src/index.ts`
- `docs/openapi.yaml`
- `docs/security-event-catalog.md`
- `docs/key-compromise-runbook.md`
- `README.md`

### 3.2 対象外
- KMS/HSM への移行本実装（将来フェーズ）
- SIEM 連携の自動化実装
- OpenID Certification 申請作業そのもの

## 4. 現状課題（解消対象）
1. 自動ローテーションはあるが、運用主導の手動・緊急操作経路が弱い
2. 鍵状態と変更理由の監査説明が不足しやすい
3. JWKS 公開条件が運用仕様として明文化されていない
4. 漏洩時対応の標準手順が不足している

## 5. 設計方針
### 5.1 鍵状態モデル
- `active`: 署名に使用
- `grace`: 新規署名には使わないが JWKS で検証互換のため公開
- `revoked`: JWKS 非公開、監査目的で保持

### 5.2 状態遷移ルール
- scheduled rotation: active -> grace, 新active作成
- manual rotation: active -> grace, 新active作成
- emergency rotation: 旧activeを即時 revoked、新active作成

### 5.3 不変条件
1. 署名に使う鍵は常に active 1本のみ
2. JWKS 公開対象は revoked 以外
3. `kid` は再利用しない
4. 緊急失効時は旧activeを即時 JWKS から外す

## 6. 実装タスク（着手順）
### Task 1: DB スキーマ拡張
対象:
- `packages/db/src/schema.ts`
- `infra/migrations/0007_extend_signing_keys_lifecycle.sql`

実装内容:
- `signing_keys` に以下を追加
  - `rotation_reason` (`scheduled`/`manual`/`emergency`)
  - `rotated_by` (admin user id)
  - `revoked_at`

受け入れ条件:
- migration 適用/ロールバックが可能
- 既存データから破壊的変更なしで移行できる

### Task 2: KeyStore ライフサイクル強化
対象:
- `packages/auth-core/src/key-store-service.ts`

実装内容:
- `rotateManual(actorUserId?)`
- `rotateEmergency(actorUserId?)`
- `listKeys()`
- JWKS 取得時に `revoked_at IS NULL` を強制

受け入れ条件:
- 状態遷移がメソッド単位で明示される
- emergency で旧activeが即時検証不能になる

### Task 3: Admin API 追加
対象:
- `apps/idp-server/src/modules/keys/keys.routes.ts`
- `apps/idp-server/src/app.ts`

実装内容:
- `GET /v1/admin/keys`
- `POST /v1/admin/keys/rotate`
- `POST /v1/admin/keys/rotate-emergency`
- admin 権限でのみ実行可能

受け入れ条件:
- 認可なしリクエストは拒否される
- 監査ログに actor と reason が残る

### Task 4: 監査イベント
対象:
- `apps/idp-server/src/index.ts`
- `apps/idp-server/src/modules/keys/keys.routes.ts`
- `docs/security-event-catalog.md`

実装内容:
- `key.rotation.scheduled`
- `key.rotation.manual`
- `key.rotation.emergency`
- `key.revoked`

受け入れ条件:
- 主要鍵操作が追跡可能
- event catalog と実装名が一致

### Task 5: 契約と運用文書
対象:
- `docs/openapi.yaml`
- `docs/key-compromise-runbook.md`
- `README.md`

実装内容:
- 管理APIの OpenAPI 追加
- 事故対応手順（封じ込め、影響評価、復旧）を Runbook 化
- README の API 一覧を更新

受け入れ条件:
- 仕様・実装・ドキュメント差分がない

### Task 6: テスト整備
対象:
- `packages/auth-core/src/__tests__/key-store-service.test.ts`
- `apps/idp-server/src/modules/keys/keys.test.ts`
- 必要に応じて契約テスト

実装内容:
- scheduled/manual/emergency の状態遷移
- JWKS の公開条件
- 管理APIの認可とレスポンス

受け入れ条件:
- 回帰防止テストが主要分岐をカバー

## 7. テストマトリクス
1. Scheduled rotation
- 期限前は回転しない
- 期限後は新active作成 + 旧activeをgrace化

2. Manual rotation
- 実行時点でactive切替
- 旧activeはgraceに移行

3. Emergency rotation
- 旧activeが即時 revoked
- JWKS から旧active除外

4. API認可
- admin のみ成功
- 一般ユーザーは拒否

5. 監査イベント
- イベント種別、実行者、理由が保存される

## 8. 検証コマンド
```bash
pnpm db:migrate
pnpm --filter @idp/auth-core test
pnpm --filter @idp/idp-server test
pnpm verify:openapi
pnpm verify
```

## 9. ロールアウト計画
### Phase A: 事前準備
- migration 適用
- KeyStore 実装反映

### Phase B: API 導入
- 管理API公開
- OpenAPI/README更新

### Phase C: 運用移行
- runbook 周知
- 当番オペレーションへの組み込み

## 10. ロールバック戦略
- API 不具合時: keys routes のマウント停止（機能フラグまたはデプロイ巻き戻し）
- migration 問題時: DB スナップショット復元を優先（DDL rollback はデータ状態を見て判断）
- emergency 実行誤り時: 新鍵を active 維持しつつ、影響範囲を runbook で評価

## 11. リスク登録
1. emergency実行で既存トークン失効が急増
- 対策: 影響通知テンプレートと一次対応フローを runbook に含める

2. grace期間不整合で検証失敗
- 対策: TTL連動ルールを固定しテストで担保

3. 管理操作ミス
- 対策: admin制約、監査ログ、実行理由の記録を必須化

## 12. 実装チェックリスト
- [x] DB migration 作成・適用確認
- [x] KeyStore に manual/emergency/list 実装
- [x] admin keys routes 実装・マウント
- [x] security event 実装・カタログ反映
- [x] OpenAPI/README/Runbook 更新
- [x] ユニット・統合・契約テスト追加
- [x] `pnpm verify` 通過

## 13. 実装後の成果物
- コード差分（DB/KeyStore/API/Test）
- OpenAPI 更新
- 運用Runbook
- verify 成功ログ

## 14. 実装完了サマリ（2026-04-26）
- 手動/緊急ローテーション管理APIを追加し、admin認可と監査イベントを実装済み。
- `signing_keys` にライフサイクル列（`rotation_reason`, `rotated_by`, `revoked_at`）を導入済み。
- KeyStore で scheduled/manual/emergency の遷移と JWKS 公開制御（revoked除外）を実装済み。
- OpenAPI・README・Runbook・契約テストを更新し、`pnpm verify` の成功を確認済み。
