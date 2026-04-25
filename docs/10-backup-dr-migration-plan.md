# Backup・DR・Migration運用計画

## 目的
IdP停止・データ破損・migration失敗に備え、復旧可能性を本番投入前に検証する。

## 背景
IdPの障害は全サービスのログイン不能につながる。バックアップがあるだけでは不十分で、restore rehearsalとmigration rollback手順が必要。

## 対象
- Postgres backup/restore
- Redis data loss policy
- Migration apply/rollback
- Seed validation
- Key material backup
- Audit log retention
- RPO/RTO定義
- Disaster recovery runbook

## 方針
- Postgresをsource of truthとする。
- Redisは原則再生成可能な短期データに限定する。
- 署名鍵など重要データのbackup要件を別管理する。
- migrationは前方互換/後方互換を意識する。
- restore rehearsalを定期運用に入れる。

## フェーズ
1. データ分類とRPO/RTOを定義する。
2. backup対象と除外対象を決める。
3. migration checklistを作る。
4. restore rehearsal手順を作る。
5. stagingで定期restore testを実行する。
6. DR drillを実施する。

## 受け入れ条件
- RPO/RTOが定義されている。
- restore手順が実行可能である。
- migration失敗時のrollback/forward fix手順がある。
- key/audit/client/user/session各データの復旧方針が明確である。
- DR drill結果が記録される。

## 優先度
中。本番投入の最後の壁を越えるために必要。
