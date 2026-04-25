# Threat Model・Security Runbook計画

## 目的
自前IdPを本番運用するうえで、想定脅威、対策、検知、対応手順を明文化し、導入判断と監査対応に耐える状態にする。

## 背景
認証基盤は「安全に見える実装」では不十分。どの攻撃を想定し、どこで防ぎ、突破時にどう検知・対応するかを説明できることが価値になる。

## 対象脅威
- Credential stuffing
- Password brute force
- MFA bypass
- Recovery code abuse
- Account enumeration
- Session hijacking
- Refresh token reuse
- OAuth client impersonation
- Redirect URI abuse
- Google identity takeover/mislink
- WebAuthn challenge replay
- RBAC/entitlement privilege escalation
- Admin config abuse
- Account deletion abuse
- Audit log tampering

## 成果物
- `docs/threat-model.md`
- `docs/security-runbook.md`
- `docs/incident-response-checklist.md`
- Security event catalog
- Attack tree
- Risk register

## 実装方針
- STRIDEまたはLINDDUNベースで主要フローを整理する。
- 各脅威に対して prevention, detection, response, residual risk を書く。
- Security eventとalert ruleへ接続する。
- Runbookはオンコールが使える手順として書く。

## フェーズ
1. 資産、信頼境界、データ分類を定義する。
2. 認証・MFA・OAuth・RBAC・管理APIごとに脅威表を作る。
3. 既存対策を棚卸しする。
4. 不足対策をissue化する。
5. インシデント対応手順を整備する。

## 受け入れ条件
- 主要認証フローに脅威モデルがある。
- P1/P2リスクに対策または明示的な残リスクがある。
- セキュリティイベントとrunbookが対応している。
- 新機能追加時に脅威モデル更新が必須になる。

## 優先度
最優先。自前IdPの説明責任と本番導入判断に直結する。
