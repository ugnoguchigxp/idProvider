# Security Event Catalog

最終更新: 2026-04-26

## 1. 目的
`security_events` のイベント定義を一元化し、監視ルールとRunbookの紐付けを固定する。

## 2. スキーマ
出典: `packages/db/src/schema.ts`

- table: `security_events`
- columns: `id`, `user_id`, `event_type`, `payload`, `created_at`

## 3. Catalog
| Event Type | Status | Severity | Trigger | Primary Runbook | Notes |
|---|---|---|---|---|---|
| `mfa.recovery_codes.generated` | Implemented | Medium | recovery code生成 | RB-MFA-RECOVERY | 生成理由をpayloadに保持 |
| `mfa.recovery_codes.revoked` | Implemented | Medium | regenerate開始 | RB-MFA-RECOVERY | 再生成前に旧コード失効 |
| `mfa.recovery_code.used` | Implemented | High | recovery code利用成功 | RB-MFA-RECOVERY | 残数をpayloadに保持 |
| `mfa.recovery_codes.low` | Implemented | High | 残数閾値以下 | RB-MFA-RECOVERY | 通知連携対象 |
| `account.deletion.requested` | Implemented | High | アカウント削除要求 | RB-ACCOUNT-DELETE | 不正削除監視対象 |
| `login.success` | Implemented | Medium | ログイン成功 | RB-CRED-STUFFING | email+password / google で記録 |
| `login.failed` | Implemented | High | ログイン失敗 | RB-CRED-STUFFING | invalid credential / inactive user |
| `refresh_token.reuse_detected` | Implemented | Critical | refresh token再利用検知 | RB-TOKEN-REUSE | token not found / rotation conflict |
| `identity.google.linked` | Implemented | High | Google link成功 | RB-IDENTITY-MISLINK | 自身アカウント連携時に記録 |
| `identity.google.unlinked` | Implemented | Medium | Google unlink成功 | RB-IDENTITY-MISLINK | provider別に記録 |
| `admin.config.updated` | Implemented | Critical | admin設定変更 | RB-ADMIN-CONFIG | social/notification/template更新 |
| `admin.access.denied` | Implemented | High | 管理APIの権限不足アクセス | RB-ADMIN-CONFIG | requiredPermission/path/methodをpayloadに保持 |
| `key.rotation.scheduled` | Implemented | High | 起動時の定期ローテーション実行 | RB-KEY-COMPROMISE | due時のみ発火 |
| `key.rotation.manual` | Implemented | Critical | 管理者手動ローテーション実行 | RB-KEY-COMPROMISE | 新旧kidをpayloadへ記録 |
| `key.rotation.emergency` | Implemented | Critical | 緊急ローテーション実行 | RB-KEY-COMPROMISE | 旧鍵の即時失効を伴う |
| `key.revoked` | Implemented | Critical | 緊急ローテーションで旧鍵失効 | RB-KEY-COMPROMISE | revoke対象kidを記録 |
| `audit.export.generated` | Implemented | High | 監査ログエクスポート生成 | RB-AUDIT-INTEGRITY | exportIdとhashをpayloadに記録 |
| `bot.challenge.missing` | Implemented | High | challenge必須APIでtoken未提出 | RB-BOT-MITIGATION | endpoint, action, ipAddress を記録 |
| `bot.challenge.invalid` | Implemented | High | challenge検証失敗（action/hostname不一致含む） | RB-BOT-MITIGATION | errorCodes, actionOk, hostnameOk を記録 |
| `bot.challenge.provider_error` | Implemented | Critical | challenge provider検証エラー | RB-BOT-MITIGATION | fail-open/fail-closed判断材料 |
| `bot.risk.blocked` | Implemented | Critical | botリスク判定でブロック | RB-BOT-MITIGATION | endpoint, ipAddress, email(可能時) を記録 |

## 4. アラート方針
- Critical: 即時ページング（オンコール）
- High: 5分以内通知（Slack/Pager）
- Medium: ダッシュボード監視 + 日次レビュー

## 5. サンプル運用SQL
### 5.1 直近1時間のHigh/Critical候補
```sql
select event_type, count(*) as c
from security_events
where created_at >= now() - interval '1 hour'
  and event_type in (
    'mfa.recovery_code.used',
    'mfa.recovery_codes.low',
    'account.deletion.requested',
    'refresh_token.reuse_detected',
    'admin.config.updated',
    'key.rotation.scheduled',
    'key.rotation.manual',
    'key.rotation.emergency',
    'key.revoked',
    'audit.export.generated',
    'bot.challenge.missing',
    'bot.challenge.invalid',
    'bot.challenge.provider_error',
    'bot.risk.blocked'
  )
group by event_type
order by c desc;
```

### 5.2 特定ユーザーのイベント時系列
```sql
select created_at, event_type, payload
from security_events
where user_id = :user_id
order by created_at desc
limit 200;
```

## 6. ガバナンス
- 新規イベント追加時は本ファイル更新を必須にする。
- 各イベントはRunbook IDを必ず持つ。
- 監視ルール変更時は影響イベントを記録する。
