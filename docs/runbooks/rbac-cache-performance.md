# RBAC Cache Performance Runbook

最終更新: 2026-04-26

## 1. 対象アラート
- Authorization deny ratio spike
- Authorization latency regression
- RBAC cache invalidation errors

## 2. 一次確認
1. 直近5分のキャッシュヒット率を確認
2. `idp_rbac_cache_error_total` の増加有無を確認
3. `idp_rbac_cache_invalidation_total{result="error"}` を確認

## 3. 切り分け
1. Redis異常
- `idp_dependency_up{dependency="redis"}` を確認
- redis再起動後に回復するかを確認

2. キャッシュキー不整合
- 直近変更で `userId/resource/action/group/org` の正規化を確認
- 失効API実行後に `rbac:v1:auth:<userId>*` が削除されるか確認

3. 実トラフィック急増
- deny ratio上昇が攻撃/設定変更起因かを監査ログで確認

## 4. 暫定対応
- 一時的に `RBAC_CACHE_ENABLED=false` へ切替（必要時）
- または `RBAC_CACHE_PERCENT` を段階的に下げる（100 -> 50 -> 0）

## 5. 恒久対応
- 失効イベント時の purge 導線を追加/修正
- しきい値再調整とダッシュボード更新
