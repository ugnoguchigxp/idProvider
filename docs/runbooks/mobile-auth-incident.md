# Mobile Auth Incident Runbook

最終更新: 2026-04-26  
対象: iOS/AndroidアプリのOIDCログイン・トークン更新障害

## 1. 目的
モバイルクライアントで認証不能・再認証ループ・MFA遷移失敗が発生した際に、検知から復旧までを標準化する。

## 2. 主要シグナル
1. `/oauth/token` の `invalid_grant` が急増
2. `mfa_required` 後の成功率低下
3. `oidc_timeout` / `oidc_rate_limited` の増加
4. クライアントログの `state mismatch` 増加

## 3. 影響レベル判定
1. Sev1
- 新規ログイン成功率が10分平均で70%未満
2. Sev2
- refresh失敗率が10分平均で20%超
3. Sev3
- 特定OSバージョンや特定アプリバージョンのみ失敗

## 4. 初動（15分以内）
1. 直近30分の失敗コード内訳を確認
```bash
pnpm --filter @idp/idp-server run scripts:auth:error-summary --window=30m
```
2. 失敗の主因を分類
- `invalid_grant` / `token_expired`: トークン失効関連
- `invalid_client`: クライアント設定不整合
- `oidc_timeout` / `oidc_rate_limited`: 一時障害
- `mfa_required` 失敗: step-up導線障害
3. 影響範囲を確定
- iOS / Android
- アプリバージョン
- リージョン

## 5. 事象別の対応
### 5.1 `invalid_grant` / `token_expired` 急増
1. サーバー側のrefresh token有効期限設定と直近変更を確認
2. モバイル側でrefresh token破棄 -> 再ログイン遷移が動作しているか確認
3. 必要時は既知不良バージョンへアラートを出し、強制アップデート判定を実施

### 5.2 `invalid_client` 発生
1. `client_id`, redirect URI, issuer設定の差分確認
2. 秘匿情報漏えいの兆候確認（異常リクエスト元IP/UA）
3. 修正完了までユーザー向けに一般化エラー文言を表示

### 5.3 `oidc_timeout` / `oidc_rate_limited` 発生
1. 依存IdP応答時間・レート制限ヘッダを確認
2. クライアント再試行（最大3回バックオフ）が有効か確認
3. 必要に応じて一時的にアプリAPIタイムアウト閾値を緩和

### 5.4 `mfa_required` 後に完了しない
1. MFAチャレンジ発行と検証ログを突合
2. step-up成功後に `exchangeCode` が再実行されているか確認
3. モバイル側の遷移戻り先URI不整合を確認

## 6. 収束条件
1. ログイン成功率が30分連続で閾値回復
2. refresh失敗率が基準値に復帰
3. P1/P2アラートが解消

## 7. 事後対応（24時間以内）
1. インシデントレビュー記録作成
2. 再発防止PR作成（テスト追加を含む）
3. 監視ルール・閾値の見直し

## 8. 参照
- `docs/oidc-client.md`
- `docs/samples/sdk-kotlin-example.md`
- `docs/samples/sdk-swift-example.md`
- `docs/security-runbook.md`
