# SDK分離計画（Server / Frontend）

最終更新: 2026-04-26  
対象: `packages/server-sdk` と `packages/oidc-client-sdk`

---

## 1. 結論
- 初期実装は **`packages/server-sdk` のみ**で進める。
- フロントエンド向けSDKは、public client を正式サポートする段階まで実装しない。
- 認証は**IdP側で実施し、アプリへリダイレクトで戻す**前提で設計する。
- SDK は SSO IdP 機能の利用者であり、不足している IdP 機能の代替にはしない。
- SSO IdP としての不足点は `docs/sso-idp-gap-plan.md` を正とする。

## 2. パッケージ方針
### 2.1 `packages/server-sdk`（優先実装）
責務:
- OIDC discovery metadata の取得
- Authorization Code + PKCE の login redirect URL 生成
- code exchange（`${OIDC_ISSUER}/token`）
- ID Token検証
- UserInfo取得（`${OIDC_ISSUER}/me`）
- logout URL生成（`${OIDC_ISSUER}/session/end`）
- サーバー間通信向けの timeout / retry / error normalize / observability

対象利用者:
- BFF
- API Gateway
- 各マイクロサービス

### 2.2 `packages/oidc-client-sdk`（将来拡張）
責務:
- Authorization Code + PKCE の redirect フロー
- `loginRedirect()` / `handleRedirectCallback()` / `logoutRedirect()`
- token管理（最小限、漏洩対策優先）

対象利用者:
- SPA / Webフロントエンド

注記:
- 「ログイン画面」は frontend 側で持たず、IdP の認証画面へ遷移する。
- 初期標準構成では BFF / API Gateway が OIDC client になるため、frontend SDK は不要。

## 3. frontend向けSDK（MSALライク）実現可能性
### 3.1 判定
**実現可能。ただし現状のIdP設定のままでは開始不可。**

### 3.2 現状の主要制約
- OIDC provider の client 設定が envベースの単一 client 前提
- `token_endpoint_auth_method` は実装上 `client_secret_basic` のみ
- public client（`token_endpoint_auth_method=none`）を前提とした frontend flow が未対応

## 4. frontend対応の前提作業（IdP側）
1. OIDC provider の client 解決を DB registry ベースへ統合する
2. client種別ごとの auth method をサポートする
   - confidential: `client_secret_basic`
   - public: `none`（PKCE必須）
3. redirect URI 検証を client単位で厳格化する
4. OAuth/OIDC conformance test を public client ケースまで拡張する
5. `docs/openapi.yaml` / `docs/oidc-compatibility.md` を更新する

## 5. 実装順序
1. **Phase 0: IdPのSSO P0ギャップを解消**
   - `docs/sso-idp-gap-plan.md` のP0項目を完了
   - IdP側で Authorization Code + PKCE / session / claims 契約を固定
2. **Phase 1: `server-sdk` を実装**
   - 既存サーバー連携を安定化
   - 運用監視（429/timeout/retry）を先に固める
3. **Phase 2: IdPのpublic client対応（必要になった場合）**
   - OIDC provider / client registry 連携改修
   - conformance test 拡張
4. **Phase 3: `oidc-client-sdk` 実装（必要になった場合）**
   - redirect login/callback/logout API
   - サンプルSPAでE2E検証

## 6. Go/No-Go基準
### 6.1 server-sdk
- OIDC discovery / authorization URL生成 / token exchange / ID Token検証 / userinfo / logout URL生成の契約テスト成功
- 401/429/5xx/timeout のエラーマッピングが仕様通り
- token/secret のログマスキング保証

### 6.2 frontend SDK
- public client で authorization code + PKCE が通る
- redirect/callback/logout のE2E成功
- 認証情報漏洩（URL/ログ/ストレージ）対策がテストで担保される

## 7. 直近アクション
- 直近は `packages/server-sdk` ではなく、IdPのSSO P0ギャップ整理と修正を優先する。
- `packages/server-sdk` は、IdP側のSSO契約が固まってから実装する。
- `packages/oidc-client-sdk` は初期スコープ外とする。
