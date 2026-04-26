# Incident Response Checklist

最終更新: 2026-04-26

## 1. 基本情報
- Incident ID:
- 発生日時 (JST):
- 検知経路 (alert / report / manual):
- 初動担当:
- 重大度 (SEV1/SEV2/SEV3):

## 2. 初動チェック（0-15分）
- [ ] 影響範囲（ユーザー/API）を仮確定
- [ ] チケット作成・関係者招集
- [ ] 証跡保全開始（logs / security_events / audit_logs）
- [ ] 対応Runbook IDを選択
- [ ] 一次封じ込め要否を判断

## 3. 封じ込めチェック（15-60分）
- [ ] 侵害疑いセッションを失効
- [ ] 必要に応じて特定機能を一時停止
- [ ] rate limit/アクセス制限を強化
- [ ] 変更凍結（admin設定/API deploy）を判断

## 4. 証跡保全
- [ ] 対象期間のAPIログを保全
- [ ] `security_events` 抽出結果を保全
- [ ] `audit_logs` 抽出結果を保全
- [ ] 関連DBスナップショットを記録

推奨SQL:
```sql
select created_at, event_type, user_id, payload
from security_events
where created_at between :from and :to
order by created_at;
```

```sql
select created_at, action, actor_user_id, resource_type, resource_id, payload
from audit_logs
where created_at between :from and :to
order by created_at;
```

## 5. 復旧チェック
- [ ] 必要時、`docs/runbooks/restore-rehearsal.md` に沿って復旧を実施
- [ ] 復旧中は破壊的ジョブ停止を確認（`RETENTION_JOB_ENABLED=false`, `ACCOUNT_DELETION_JOB_ENABLED=false`）
- [ ] 影響機能の健全性確認
- [ ] 監視値が平常化したことを確認
- [ ] 再発兆候がないことを確認
- [ ] 必要なユーザー通知を実施

## 6. クローズ前
- [ ] Root cause仮説を文書化
- [ ] 恒久対策Issueを登録
- [ ] 期限付きOwnerを設定
- [ ] 事後レビュー日程を確定

## 7. 事後レビュー項目
- Detection gap は何か
- Initial response の遅延要因は何か
- 封じ込めの妥当性
- 監視ルール/Runbook更新点
- DR drill反映事項（`docs/dr-drill-template.md`）の有無
