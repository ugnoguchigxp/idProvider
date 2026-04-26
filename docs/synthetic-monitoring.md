# Synthetic Monitoring

最終更新: 2026-04-26

## 1. 対象
- `GET /.well-known/openid-configuration`
- `GET /.well-known/jwks.json`
- `POST /v1/login`（staging専用テストユーザー）

## 2. 実行間隔
- 1分ごと

## 3. 失敗判定
- 2連続失敗でHigh
- 5分間継続失敗でCritical

## 4. 連携Runbook
- discovery/jwks失敗: `RB-DR-RESTORE`
- login失敗急増: `RB-CRED-STUFFING`
