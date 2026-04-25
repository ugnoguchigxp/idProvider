# Tenant・Organization境界計画

## 目的
B2B利用に必要なtenant/organization境界を明確化し、ユーザー、client、role、entitlement、audit logを安全に分離する。

## 背景
自前IdPを複数組織で利用する場合、境界設計が曖昧だと権限昇格やデータ漏洩につながる。B2B SaaS向けIdPとしての価値はtenant分離の強さに依存する。

## 対象
- Tenant model
- Organization model
- User membership
- Tenant-scoped clients
- Tenant-scoped roles/permissions
- Tenant-scoped entitlements
- Tenant admin権限
- Cross-tenant access prevention
- Tenant-aware audit log

## 実装方針
- tenantとorganizationの責務を分ける。
- すべての管理操作にscopeを要求する。
- Repository層でtenant filter漏れを防ぐ。
- Cross-tenant操作はテストで重点的に潰す。
- Global adminとtenant adminを明確に分ける。

## フェーズ
1. 現行schemaのorganization/group関連を棚卸しする。
2. tenant/organizationの用語と境界を定義する。
3. DB schemaへtenant_idを導入する範囲を決める。
4. client/RBAC/entitlement/auditをtenant-awareにする。
5. tenant admin policyを追加する。
6. cross-tenant regression testsを追加する。

## 受け入れ条件
- tenantを跨いだclient/role/entitlement参照ができない。
- tenant adminは自tenantだけを操作できる。
- audit logをtenant単位で検索できる。
- 既存single-tenant利用が壊れない。

## 優先度
中高。B2B本番利用を狙うなら必須。
