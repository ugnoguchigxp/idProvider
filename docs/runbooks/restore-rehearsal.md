# Restore Rehearsal Runbook

最終更新: 2026-04-26
対象: PostgreSQL / Redis / Signing Keys

## 1. 目的
バックアップからの復旧手順を定期的に検証し、RTO/RPO達成可否を実測する。

## 2. 前提
- 演習環境: staging もしくは隔離検証環境
- 取得済みデータ:
  - Postgres snapshot
  - PITRログ（該当時刻まで）
- 作業者:
  - Incident Commander
  - DB Operator
  - Application Operator

## 3. 手順
### 3.1 事前準備
1. 演習チケットを作成し、開始時刻を記録する。
2. 既存ジョブを停止設定にする。
   - `RETENTION_JOB_ENABLED=false`
   - `ACCOUNT_DELETION_JOB_ENABLED=false`
3. 復旧対象時点（target restore timestamp）を確定する。

### 3.2 Postgres復元
1. snapshotを復元する。
2. 必要ならPITRで対象時点までリカバリする。
3. アプリ接続情報を復旧DBへ向ける。

### 3.3 Redis再起動
1. Redisを空状態で起動。
2. アプリ起動後にキャッシュ再生成を許容する。

### 3.4 アプリ起動
1. `pnpm db:migrate` を実行（必要時）。
2. `pnpm --filter @idp/idp-server test` を最低限実行。
3. `GET /healthz` と `GET /readyz` を確認。

## 4. 整合性チェックSQL
### 4.1 ユーザー件数
```sql
select count(*) as users_count from users;
```

### 4.2 セッション有効件数
```sql
select count(*) as active_sessions
from user_sessions
where revoked_at is null and refresh_expires_at > now();
```

### 4.3 署名鍵状態
```sql
select kid, is_active, revoked_at, expires_at
from signing_keys
order by created_at desc;
```

### 4.4 OAuthクライアント整合
```sql
select client_id, status, updated_at
from oauth_clients
order by updated_at desc
limit 50;
```

### 4.5 監査ログ継続性
```sql
select integrity_version, count(*)
from audit_logs
group by integrity_version
order by integrity_version;
```

## 5. 受け入れ判定
- RTO: 30分以内に `/readyz` を復帰
- RPO: 5分以内のデータ欠落に収まる
- Active signing key が1本以上存在
- login / refresh / jwks が動作

## 6. 後処理
1. ジョブ停止設定を元に戻す。
2. 演習記録を `docs/dr-drill-template.md` へ保存。
3. 改善課題をIssue化する。
