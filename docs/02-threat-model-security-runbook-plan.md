# Threat Model・Security Runbook計画（実行可能版）

最終更新: 2026-04-26

## 0. 実装状況（2026-04-26）
- [x] `docs/threat-model.md` 作成
- [x] `docs/security-runbook.md` 作成
- [x] `docs/incident-response-checklist.md` 作成
- [x] `docs/security-event-catalog.md` 作成
- [x] `docs/risk-register.md` 作成
- [x] `login.success` / `login.failed` の security event 実装
- [x] `refresh_token.reuse_detected` の security event 実装
- [x] `identity.google.linked` / `identity.google.unlinked` の security event 実装
- [x] `admin.config.updated` の security event 実装
- [x] `pnpm verify` 通過

## 1. 目的
自前IdPを本番運用する前提で、以下を監査説明可能な形にする。

- 何を守るか（資産・境界・前提）
- 何が起こり得るか（脅威・攻撃経路・被害）
- どう防ぐか（予防統制）
- どう検知するか（監視・アラート）
- どう対応するか（Runbook・初動・復旧・再発防止）

## 2. 完了定義（Definition of Done）
以下をすべて満たした時点で本計画は完了。

- `docs/threat-model.md` が存在し、主要フローごとの脅威表が完成している。
- `docs/security-runbook.md` が存在し、P1/P2インシデントの手順が即時実行可能な粒度で記載されている。
- `docs/incident-response-checklist.md` が存在し、初動・封じ込め・復旧・報告のチェックリストが完成している。
- `docs/security-event-catalog.md` が存在し、イベント名・発火条件・重要度・Runbook参照が紐づいている。
- `docs/risk-register.md` が存在し、全P1/P2に Owner / Due date / 対応状態がある。
- `pnpm verify` を通した状態で、計画文書の参照先（OpenAPI、実装ファイル、イベント名）が現行実装と矛盾しない。

## 3. スコープ
### 3.1 対象

- 認証・認可・管理系APIの脅威分析
- 主要攻撃シナリオのRunbook作成
- 検知イベントとアラート定義
- 残余リスクの明文化

### 3.2 対象外

- WAF/EDR/SIEM製品選定
- SOC運用の24/7体制設計
- 外部委託先の契約・法務手続き

## 4. 分析対象システム境界
### 4.1 重要資産

- 認証情報: password hash, refresh token, access token
- MFA情報: TOTP secret, recovery codes, WebAuthn credential
- アイデンティティ情報: user profile, external identity mapping
- 権限情報: RBAC permission, entitlement
- 管理設定: social login, notification, email template
- 監査証跡: audit_logs, security_events

### 4.2 信頼境界

- Public client ↔ API (`apps/idp-server`)
- API ↔ DB (`packages/db`)
- API ↔ Redis
- API ↔ Google OIDC
- Admin UI ↔ Admin API

### 4.3 主要エントリポイント

- Public auth: `/v1/signup`, `/v1/login`, `/v1/login/google`, `/oauth/token`
- MFA/WebAuthn: `/v1/mfa/*`
- OAuth/OIDC: `/.well-known/*`, `/oauth/introspection`, `/oauth/revocation`
- Admin: `/v1/admin/configs*`
- Account linkage: `/v1/identities/google/link`, `/v1/identities/google/unlink`

## 5. 成果物（ファイル単位）
### 5.1 `docs/threat-model.md`

必須章:

1. システム概要と資産一覧
2. データフロー図（最低1枚）
3. 脅威一覧（STRIDE観点）
4. 脅威ごとの対策表（Prevent / Detect / Respond / Residual）
5. 優先度付き対策バックログ

### 5.2 `docs/security-runbook.md`

必須章:

1. 重大度定義（SEV1/SEV2/SEV3）
2. 共通初動手順（15分以内）
3. シナリオ別手順
4. 連絡・エスカレーション
5. 復旧判定と事後レビュー

### 5.3 `docs/incident-response-checklist.md`

必須項目:

- 検知時刻、担当、影響範囲
- 封じ込め実施項目
- 証跡保全項目
- 復旧確認項目
- ポストモーテム項目

### 5.4 `docs/security-event-catalog.md`

最低限カバーするイベント群:

- `login.success`
- `refresh_token.reuse_detected`
- `mfa.enroll_started`
- `mfa.enabled`
- `mfa.login_verified`
- `password.changed`
- `password.reset.requested`
- `email.verification.requested`
- `email.verified`
- `identity.google.linked`
- `identity.google.unlinked`
- `logout.success`

### 5.5 `docs/risk-register.md`

必須列:

- Risk ID
- Threat
- Affected Flow
- Likelihood (1-5)
- Impact (1-5)
- Score
- Priority (P1/P2/P3)
- Owner
- Due Date
- Status
- Residual Risk

## 6. 脅威モデリング手順
1. 対象フローを固定する。
2. フローごとに資産・境界・前提を定義する。
3. STRIDEで脅威を列挙する。
4. 既存実装での防御を確認する。
5. 検知可能性を評価する。
6. 対応難易度を加味して優先度を決める。
7. RunbookとRisk registerへ反映する。

## 7. リスク評価ルール
- Likelihood: 1（稀）〜5（高頻度）
- Impact: 1（軽微）〜5（重大）
- Score = Likelihood × Impact
- 優先度:
  - P1: 15-25
  - P2: 8-14
  - P3: 1-7

補正ルール:

- 法令・監査違反に直結する場合は1段階優先度を引き上げる。
- 検知不能な脅威は最低P2とする。

## 8. Runbook対象インシデント（初期版）
- Credential stuffing急増
- Refresh token reuse多発
- MFA bypass疑い
- Google identity mislink/takeover疑い
- Admin config不正変更
- 監査ログ改ざん疑い

各インシデントで定義する内容:

- Trigger（検知条件）
- Triage（確認ログ・確認SQL）
- Containment（封じ込め手順）
- Eradication/Recovery（復旧）
- Communication（関係者連絡）
- Exit Criteria（終息判定）

## 9. 実装との接続ポイント
- API契約: `docs/openapi.yaml`
- ルーティング: `apps/idp-server/src/modules/*/*.routes.ts`
- 認証ロジック: `apps/idp-server/src/modules/auth/auth.service.ts`
- MFAロジック: `apps/idp-server/src/modules/mfa/*.ts`
- 監査記録: `apps/idp-server/src/modules/audit/audit.repository.ts`
- セキュリティイベント格納: `packages/db/src/schema.ts` (`security_events`)

## 10. 実行計画（2週間）
### Week 1（2026-04-27 〜 2026-05-01）
1. 脅威モデル骨子作成
2. 主要フロー6本の脅威表作成
3. P1/P2の暫定抽出
4. security-event catalog 初版作成

### Week 2（2026-05-04 〜 2026-05-08）
1. Runbook 6シナリオ作成
2. Incident checklist作成
3. Risk register確定
4. レビュー反映・凍結

## 11. タスク分解（すぐ着手できる粒度）
1. `docs/threat-model.md` を新規作成する（担当: Security Lead、期日: 2026-04-29）。
2. Public authとMFAの脅威表を埋める（担当: Backend A、期日: 2026-04-30）。
3. OAuth/OIDCとAdmin APIの脅威表を埋める（担当: Backend B、期日: 2026-04-30）。
4. `docs/security-event-catalog.md` を作成しイベント紐付けを完了する（担当: Backend A、期日: 2026-05-01）。
5. `docs/security-runbook.md` を作成し6シナリオを実装する（担当: Security Lead、期日: 2026-05-07）。
6. `docs/incident-response-checklist.md` を作成する（担当: SRE、期日: 2026-05-07）。
7. `docs/risk-register.md` を確定する（担当: Security Lead、期日: 2026-05-08）。

## 12. レビュー運用
- レビュー会は週2回（火曜・金曜）
- 各回で確認する観点:
  - 脅威の漏れ
  - 対策の実現可能性
  - 検知とRunbookの接続
  - 残余リスク妥当性

## 13. 受け入れ判定チェックリスト
- `docs/` 配下に成果物5点が存在する。
- Threat modelとRunbookの参照整合が取れている。
- P1/P2に未割当Ownerがない。
- 主要イベントにRunbook参照IDがある。
- 最終レビューで承認者2名以上の承認がある。

## 14. 優先度
最優先。自前IdPの本番導入可否判断と監査説明責任の土台になる。
