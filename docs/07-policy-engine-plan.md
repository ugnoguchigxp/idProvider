# Policy Engine計画

## 目的
RBAC、entitlement、contextを統合し、B2B SaaSで必要な条件付き認可を扱えるpolicy engineへ拡張する。

## 背景
単純なRBACだけでは、組織、グループ、契約プラン、数量制限、IP、時間、リスクスコアなどを組み合わせた認可に対応しづらい。自前IdPの差別化は認可ロジックを自社要件に合わせられる点にある。

## 対象
- Permission check
- Entitlement check
- Organization/group scope
- Quantity limit
- Context-aware policy
- Risk-based policy
- Deny reason
- Policy decision audit

## 設計方針
- Policy decisionは`allowed`, `reason`, `source`, `matchedPolicy`, `context`を返す。
- RBACとentitlementを下位resolverとして扱う。
- 明示denyをallowより優先する。
- Policy evaluationは監査可能にする。
- 複雑なDSLは初期段階では避け、型安全なJSON policyから始める。

## フェーズ
1. 現行RBAC/entitlementのdecision modelを整理する。
2. Policy schemaを定義する。
3. Policy repository/serviceを追加する。
4. authorization/checkをpolicy engine経由にする。
5. deny reasonとauditを追加する。
6. テストケースを組織/グループ/数量/時間/IPで追加する。

## 受け入れ条件
- RBACとentitlementを統合して判定できる。
- deny reasonが安定して返る。
- policy変更がaudit logに残る。
- policy評価結果がデバッグ可能である。
- 既存authorization APIの後方互換性を維持する。

## 優先度
中高。自前で持つ価値を大きく上げる差別化領域。
