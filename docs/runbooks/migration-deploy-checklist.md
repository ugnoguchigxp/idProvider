# Migration Deploy Checklist

最終更新: 2026-04-26
対象: `infra/migrations/*`

## 1. Pre-check
- [ ] 変更種別を判定（expand / contract）
- [ ] 既存コードとの互換性を確認
- [ ] 長時間ロックの可能性を評価
- [ ] 本番バックアップ取得を確認
- [ ] ロールアウト/ロールバック責任者を確定

## 2. 実行前検証
- [ ] stagingで `pnpm db:migrate` 成功
- [ ] stagingで `pnpm verify` 成功
- [ ] migration後に主要API smoke test 成功

## 3. 本番適用
1. デプロイ凍結ウィンドウを確保
2. migration適用
3. アプリ切替
4. `/healthz` `/readyz` を確認

## 4. Post-check
- [ ] login / refresh / jwks の正常性確認
- [ ] `signing_keys` の active key を確認
- [ ] `audit_logs` / `security_events` の記録継続を確認
- [ ] エラーレート急増がないことを確認

## 5. 失敗時対応
- [ ] 破壊的rollbackは原則回避し forward-fix を優先
- [ ] 影響範囲を限定し、read-only運用可否を判断
- [ ] 必要時のみ直前バックアップへ戻す
- [ ] 失敗記録をインシデント票に残す

## 6. 終了条件
- [ ] 30分監視で異常なし
- [ ] 変更記録と結果をrunbookへ反映
