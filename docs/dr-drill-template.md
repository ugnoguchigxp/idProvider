# DR Drill Record Template

最終更新: 2026-04-26

## 1. Drill情報
- Drill ID:
- 実施日時 (JST):
- 実施者:
- シナリオ: (DB破損 / AZ障害 / migration失敗 など)

## 2. タイムライン
- 検知時刻:
- 一次対応開始:
- 復旧開始:
- サービス復旧完了:
- クローズ:

## 3. 実測値
- 目標RTO:
- 実測RTO:
- 目標RPO:
- 実測RPO:

## 4. 技術結果
- Postgres復元: 成功 / 失敗
- Redis復元: 成功 / 失敗
- signing_keys整合: 正常 / 異常
- login/refresh/jwks: 正常 / 異常

## 5. 問題点
- 問題1:
- 問題2:

## 6. 改善アクション
- [ ] Action / Owner / Due Date
- [ ] Action / Owner / Due Date

## 7. 参照
- 使用Runbook: `docs/runbooks/restore-rehearsal.md`
- インシデントチェックリスト: `docs/incident-response-checklist.md`
