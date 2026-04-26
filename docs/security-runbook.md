# Security Runbook

最終更新: 2026-04-26

## 1. 重大度
- SEV1: 認証基盤侵害または広域ログイン不能
- SEV2: 一部ユーザーへの影響、継続攻撃を検知
- SEV3: 単発異常、影響限定

## 2. 共通初動（15分以内）
1. インシデントチケットを起票し、時刻を固定する。
2. 影響範囲を仮判定する（ユーザー数、API、期間）。
3. 証跡保全を開始する（`security_events` / `audit_logs` / APIログ）。
4. 一次封じ込めの要否を判断する（token失効、admin操作停止）。
5. 当番からSecurity Leadへエスカレーションする。

## 3. シナリオ別手順

### RB-CRED-STUFFING: credential stuffing急増
Trigger:
- `/v1/login` の401率が平常比3倍以上（5分窓）

Triage:
```sql
select reason, count(*)
from login_attempts
where created_at >= now() - interval '15 minutes'
group by reason
order by count(*) desc;
```

Containment:
1. rate limit閾値の一時強化
2. 異常IP帯のアクセス制限
3. 高リスクユーザーの再認証要求

Recovery:
- 失敗率が平常に戻るまで15分間隔で監視

Exit Criteria:
- 60分継続で異常閾値未満

### RB-TOKEN-REUSE: refresh token reuse検知
Trigger:
- `refresh_token.reuse_detected` イベント発生

Triage:
```sql
select created_at, user_id, payload
from security_events
where event_type = 'refresh_token.reuse_detected'
  and created_at >= now() - interval '24 hours'
order by created_at desc;
```

Containment:
1. 対象ユーザー全セッション失効
2. 直近1時間の関連IPを抽出
3. 必要に応じて対象ユーザーに通知

Recovery:
- 強制再ログイン後の異常再発有無を確認

Exit Criteria:
- 24時間再発なし

### RB-MFA-RECOVERY: recovery code abuse
Trigger:
- `mfa.recovery_code.used` の急増
- `mfa.recovery_codes.low` 多発

Triage:
```sql
select user_id, count(*)
from security_events
where event_type = 'mfa.recovery_code.used'
  and created_at >= now() - interval '24 hours'
group by user_id
order by count(*) desc;
```

Containment:
1. 対象ユーザーのrecovery codesを再生成
2. 高リスク時は全セッション失効

Recovery:
- MFA再設定完了を確認

Exit Criteria:
- 異常利用ユーザーが収束

### RB-IDENTITY-MISLINK: Google連携不正疑い
Trigger:
- 短時間でlink/unlinkが反復
- ユーザーから不正連携報告

Triage:
1. 対象ユーザーのexternal identity状態を確認
2. `audit_logs` の link/unlink 操作履歴を確認

Containment:
1. 連携解除
2. 全セッション失効
3. パスワード変更 + MFA再検証を要求

Recovery:
- 正当な連携状態へ復元

Exit Criteria:
- 利用者確認済み

### RB-ADMIN-CONFIG: 管理設定不正変更
Trigger:
- 想定外の`/v1/admin/configs*` 更新

Triage:
```sql
select created_at, actor_user_id, action, payload
from audit_logs
where action like 'admin.config.%'
  and created_at >= now() - interval '24 hours'
order by created_at desc;
```

Containment:
1. 変更の即時ロールバック
2. 影響機能（Google login/email template等）を制限
3. 管理者トークン失効

Recovery:
- 差分レビュー後に段階再開

Exit Criteria:
- 設定の正当性を二者承認

### RB-ACCOUNT-DELETE: account deletion abuse
Trigger:
- `account.deletion.requested` の急増

Triage:
```sql
select user_id, count(*)
from security_events
where event_type = 'account.deletion.requested'
  and created_at >= now() - interval '24 hours'
group by user_id
order by count(*) desc;
```

Containment:
1. 疑わしい削除要求の実行停止（grace中ユーザー確認）
2. 該当ユーザーへ本人確認連絡

Recovery:
- 正当要求のみ再キュー

Exit Criteria:
- 不正要求ゼロ、誤削除ゼロ

### RB-AUDIT-INTEGRITY: 監査ログ完全性異常
Trigger:
- `/v1/admin/audit/integrity` で `ok=false`
- 監査提出時に manifest hash 不一致

Triage:
1. 影響期間を固定して再検証（from/toを固定）
2. `brokenAt` の前後イベントを抽出
3. retention job 実行タイミングとの相関を確認

Containment:
1. 監査ログへの書き込み経路変更を一時停止（緊急変更凍結）
2. 直近エクスポートを再生成しハッシュ再計算
3. 改ざん疑いがある場合は証跡を別ストレージへ退避

Recovery:
- 原因（実装不整合/運用誤操作）を特定し修正後に同一期間で再検証

Exit Criteria:
- 同一期間で `ok=true` を確認し、再発防止Issue登録済み

### RB-DR-RESTORE: 障害時復旧（Backup/DR）
Trigger:
- DB破損、migration失敗、長時間の認証不能

Triage:
1. 影響範囲（login/refresh/jwks）を特定
2. RTO/RPO目標とのギャップを試算
3. 復旧シナリオ（snapshot復元 or PITR）を確定

Containment:
1. 変更凍結（deploy/admin設定変更）を実施
2. ジョブ停止フラグを設定
  - `RETENTION_JOB_ENABLED=false`
  - `ACCOUNT_DELETION_JOB_ENABLED=false`

Recovery:
1. `docs/runbooks/restore-rehearsal.md` に沿って復旧
2. `signing_keys` / login / refresh / jwks の健全性を確認
3. 安定確認後にジョブ停止フラグを解除

Exit Criteria:
- `/readyz` 復帰
- 主要認証フローのエラー率が平常化
- DR記録テンプレートを1件更新

## 4. 連絡・エスカレーション
- 1st responder: On-call engineer
- 2nd responder: Security Lead
- 3rd responder: Product owner / Legal (必要時)

## 5. 事後対応
1. 24時間以内に暫定報告
2. 72時間以内にポストモーテム
3. 再発防止IssueをP1/P2で登録
