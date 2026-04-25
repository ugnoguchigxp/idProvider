# 権限 (RBAC) および Entitlement 設計計画

最終更新: 2026-04-25
対象: 認可ロジックの高度化

---

## 1. 目的
単なるログイン可否だけでなく、「誰がどのリソースに対して何ができるか (RBAC)」および「どの機能が利用可能か (Entitlement)」を統一的に管理・評価する基盤を構築する。

## 2. コア概念の定義

### 2-1. RBAC (Role-Based Access Control)
- **Role**: 複数の Permission の集合（例: `admin`, `editor`, `viewer`）。
- **Permission**: アトミックな操作権限（例: `user:create`, `report:view`）。
- **ユーザー紐付け**: ユーザーは 1 つ以上の Role を持つ。

### 2-2. Entitlement (機能利用権)
- **概念**: 有料プランや特定フラグに基づく機能の利用可否（例: `max_projects: 5`, `api_access: true`）。
- **評価**: JWT のクレームに含めるか、専用のチェック API で評価する。

### 2-3. Organization / Group
- **Organization**: テナント単位の境界。
- **Group**: 組織内の論理的な集まり。Role は Group 単位で付与可能にする。

## 3. 実装タスク
1. **DB スキーマ実装**: `roles`, `permissions`, `entitlements`, `groups` 等のテーブル作成。
2. **Authorization サービス**: `AuthService` に `checkPermission(userId, action, resource)` メソッドを実装。
3. **API 実装**: 認可結果を返すエンドポイント `POST /v1/authorization/check` の作成。
4. **JWT 拡張**: `id_token` や `access_token` に権限情報を埋め込むロジックの追加。
