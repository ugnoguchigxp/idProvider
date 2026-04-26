# Observability Bootstrap

最終更新: 2026-04-26

## 1. 目的
ローカルまたはstagingで、認証基盤の最低限の可観測性を短時間で立ち上げる。

## 2. 前提
- Local 30minを完了済み
- `METRICS_ENABLED=true`（`.env` 既定値）

## 3. 監視導入の最小手順
1. synthetic check を実行

```bash
SYNTHETIC_BASE_URL=http://localhost:3000 \
SYNTHETIC_LOGIN_EMAIL=user@example.com \
SYNTHETIC_LOGIN_PASSWORD=Gxp#Idp!2026$Secure \
pnpm --filter @idp/idp-server synthetic:check
```

期待結果:
- synthetic check が成功し、ログイン・health確認が通る

2. ダッシュボード定義を確認
- Security: [../dashboards/idp-security-dashboard.md](../dashboards/idp-security-dashboard.md)
- Reliability: [../dashboards/idp-reliability-dashboard.md](../dashboards/idp-reliability-dashboard.md)

3. クリティカルアラートを確認
- [../alerts/critical-alert-rules.md](../alerts/critical-alert-rules.md)

## 4. stagingへ展開する際のポイント
- `METRICS_BEARER_TOKEN` を必ず設定
- OTel exporter endpoint を環境毎に分離
- synthetic check を定期実行（5分〜10分間隔）

## 5. 失敗時の復旧
1. synthetic check がタイムアウト
- API起動状態と `SYNTHETIC_BASE_URL` を確認

2. メトリクスに値が出ない
- `METRICS_ENABLED` とトークン設定を確認

3. アラートが過剰検知
- `docs/alerts/critical-alert-rules.md` のしきい値を調整し、変更履歴を記録
