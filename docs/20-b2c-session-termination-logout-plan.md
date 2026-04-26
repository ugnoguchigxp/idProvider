# 20. B2C Session Termination / Unified Logout Plan

最終更新: 2026-04-26  
ステータス: Implemented  
優先度: P1

## 1. 目的
B2C向けの複数Web/BFF/モバイルアプリで、ログアウト後に「別アプリではログイン済み」「refresh tokenだけ残る」「IdPセッションだけ残る」といったゾンビログイン状態を起こさないため、セッション終了の契約を固定する。

この計画では、OpenID Certification、SCIM、管理画面強化、Front/Back-channel Logout完全実装は扱わない。今すぐ価値が出る範囲として、既存API、SDK、BFFサンプル、runbookを統一する。

## 2. 現状
### 2.1 実装済み
- Hono互換API:
  - `POST /v1/logout`
  - `POST /v1/sessions/revoke`
  - `POST /v1/sessions/revoke-all`
  - `POST /oauth/revocation`
- OIDC provider:
  - RP-Initiated Logout enabled
  - discovery metadataに `end_session_endpoint` を提供
- SDK:
  - `packages/server-sdk` に `createLogoutUrl()` / `revokeToken()` がある
  - `packages/oidc-client-sdk` はserver-sdk経由で `createLogoutUrl()` / `revokeToken()` を公開
  - Kotlin/Swift mobile SDKはlogin MVP中心で、統一logout APIがない
- Example BFF:
  - local logoutとglobal logoutの最小導線がある

### 2.2 問題
1. SDK間でlogout APIの責務名が揃っていない
2. mobile SDKにlogout URL生成、token revoke、端末内token破棄の契約がない
3. local logout、global logout、all sessions revoke、token revocationの使い分けが実装者に委ねられている
4. パスワード変更、MFAリセット、端末紛失、退会時にどのsession/tokenを失効すべきかがSDK利用者から見えにくい

## 3. 設計原則
### 3.1 セッションの種類
本プロジェクトでは以下を明確に分ける。

1. App local session
- BFFやモバイルアプリが自分で保持するログイン状態
- 例: BFFのhttpOnly cookie、モバイルのKeychain/Keystore内token

2. IdP global session
- IdPドメイン上のOIDCログイン状態
- RP-Initiated Logoutで終了する

3. API refresh session
- `user_sessions` とrefresh tokenで表現されるサーバー側セッション
- `/v1/sessions/revoke-all` や `/oauth/revocation` で失効する

### 3.2 ゾンビログイン防止ルール
- local logoutは必ずApp local sessionを削除する
- global logoutはlocal logoutを先に実行し、その後IdP logout URLへ遷移する
- refresh tokenを保持しているSDKは、logout時にrevokeを試行してからローカル保存を削除する
- revoke失敗時もローカル保存は削除する。ただし再試行用にtoken本体をログや永続queueへ残さない
- all sessions revoke後は既存refresh tokenによる復帰を許可しない
- password change、MFA reset、account deletion、account lockでは原則all sessions revokeを実行する

## 4. 統一SDK Logout Contract
### 4.1 共通API
各SDKは同じ意味のAPIを提供する。

```text
createLogoutUrl(input) -> string
revokeToken(input) -> void
logout(input) -> LogoutResult
```

`logout(input)` はSDK内の高水準APIとする。各環境でlocal session削除の実体は異なるため、SDKはcallback/hookで呼び出す。

### 4.2 入力
```ts
type LogoutInput = {
  mode: "local" | "global";
  refreshToken?: string;
  accessToken?: string;
  idTokenHint?: string;
  postLogoutRedirectUri?: string;
  state?: string;
  clearLocalSession: () => void | Promise<void>;
};
```

### 4.3 出力
```ts
type LogoutResult = {
  localSessionCleared: boolean;
  refreshTokenRevoked: boolean;
  accessTokenRevoked: boolean;
  logoutUrl?: string;
  warnings: string[];
};
```

### 4.4 挙動
- `mode = local`
  - `refreshToken` があればrevokeを試行
  - `accessToken` があればrevokeを試行
  - `clearLocalSession()` を必ず実行
  - IdP logout URLは返さない
- `mode = global`
  - local logoutと同じ処理を行う
  - `createLogoutUrl()` でIdP logout URLを返す
  - logout URL生成に失敗した場合もlocal session削除を優先し、warningを返す
  - BFF/Browserは返却URLへredirectする
  - MobileはASWebAuthenticationSession/Custom Tab等でURLを開く

## 5. 実装スコープ
### PR-20-01: SDK契約とNode実装
対象:
- `packages/server-sdk/src/index.ts`
- `packages/server-sdk/src/__tests__/index.test.ts`
- `packages/oidc-client-sdk/src/index.ts`
- `packages/oidc-client-sdk/src/__tests__/index.test.ts`
- `docs/oidc-client.md`

内容:
- `LogoutInput` / `LogoutResult` をserver-sdkに追加
- `logout()` をserver-sdkに追加
- `oidc-client-sdk` から同じ `logout()` を公開
- revoke失敗時でも `clearLocalSession()` が実行されることをテスト
- global logout時に `logoutUrl` が返ることをテスト

受け入れ条件:
- Node/BFF利用者が `logout({ mode: "global", ... })` だけで安全な順序を使える
- `pnpm --filter @idp/server-sdk test` が通る
- `pnpm --filter @idp/oidc-client-sdk test` が通る

### PR-20-02: Kotlin/Swift SDKの統一logout API
対象:
- `packages/mobile-kotlin-sdk/src/main/kotlin/com/idp/sdk/MobileKotlinSdk.kt`
- `packages/mobile-kotlin-sdk/src/test/kotlin/com/idp/sdk/MobileKotlinSdkTest.kt`
- `packages/mobile-swift-sdk/Sources/MobileSwiftSdk/MobileSwiftSdk.swift`
- `packages/mobile-swift-sdk/Tests/MobileSwiftSdkTests/MobileSwiftSdkTests.swift`
- `packages/mobile-kotlin-sdk/README.md`
- `packages/mobile-swift-sdk/README.md`

内容:
- `createLogoutUrl()` をKotlin/Swiftに追加
- `logout()` のMVP契約を追加
- MVPではnetwork revoke未実装の場合も、local token purgeとglobal logout URL生成を固定
- mobileはtoken本体をログに出さない方針をREADMEに明記

受け入れ条件:
- Kotlin/Swiftで同じ概念名のlogout APIが使える
- local logoutは端末内token削除hookを必ず呼ぶ
- global logoutはIdP logout URLを返す
- `./gradlew test` と `swift test` が通る

### PR-20-03: Example BFFのゾンビログイン防止
対象:
- `apps/example-bff/src/app.ts`
- `apps/example-bff/src/__tests__/app.test.ts`
- `apps/example-bff/README.md`

内容:
- `/logout` はlocal session削除を明確化
- `/logout/global` はSDK `logout(mode=global)` を使う
- local cookie削除後にIdP logoutへredirectする順序を固定
- callback pending cookieもlogout時に削除する

受け入れ条件:
- local logout後にBFF cookieが消える
- global logout後にBFF cookieとpending cookieが消え、IdP logout URLへredirectする
- BFF cookieにOIDC tokenが残らないことを既存テストで維持する

### PR-20-04: Account Protection連携
対象:
- `apps/idp-server/src/modules/auth/*`
- `apps/idp-server/src/modules/mfa/*`
- `apps/idp-server/src/modules/users/*`
- `apps/idp-server/src/modules/sessions/*`
- 必要なテスト

内容:
- password change成功時は本人の全セッションを失効する
- MFA recovery code再生成後は本人の全セッションを失効する
- account deletionは既存実装のセッション失効を維持する
- account lockは現時点で管理APIがないため対象外とする

受け入れ条件:
- 高リスク操作後に古いrefresh tokenで復帰できない
- どの操作で何を失効したか監査ログから追跡できる
- 既存login/refresh/logoutの挙動を壊さない

### PR-20-05: Runbookと検証
対象:
- `docs/runbooks/session-termination.md`（新規）
- `docs/security-runbook.md`
- `docs/samples/sdk-node-example.md`
- `docs/samples/sdk-kotlin-example.md`
- `docs/samples/sdk-swift-example.md`

内容:
- 端末紛失、アカウント乗っ取り疑い、パスワード変更、MFA再設定、退会時の失効手順を明記
- SDK別のlogout実装例を更新
- 「local logoutだけではIdP global sessionは消えない」ことを明記

受け入れ条件:
- 開発者がBFF/Mobileで同じlogoutモデルを実装できる
- オンコールがゾンビログイン疑いの調査手順を追える

## 6. テストマトリクス
| 項目 | 期待結果 |
| --- | --- |
| SDK local logout | revoke試行後、local session clear hookが実行される |
| SDK global logout | local logout後、IdP logout URLまたはwarningが返る |
| revoke endpoint障害 | local sessionは削除され、warningが返る |
| BFF local logout | local cookieとpending cookieが削除される |
| BFF global logout | cookie削除後、IdP logoutへredirect |
| revoke-all後refresh | 古いrefresh tokenは `invalid_grant` / `invalid_token` |
| password change後refresh | 既存refresh tokenで復帰できない |
| mobile global logout | token purge hook実行後、logout URLを開ける |

## 7. やらないこと
- Front-channel Logout完全実装
- Back-channel Logout完全実装
- SAML SLO
- 全RPへのリアルタイムlogout通知
- OpenID Certification目的の追加仕様対応
- SCIM 2.0連携

## 8. 実装順序
1. PR-20-01: Node/server SDKの `logout()` 契約を実装
2. PR-20-03: Example BFFをSDK contractへ寄せる
3. PR-20-02: Kotlin/Swift SDKに同じlogout概念を追加
4. PR-20-05: runbookとサンプルを更新
5. PR-20-04: account protection連携を必要範囲で追加
6. `pnpm verify`

## 9. 完了定義
- [x] server-sdk / oidc-client-sdk / Kotlin / Swiftで統一logout APIがある
- [x] global logoutはlocal session削除後にIdP logoutへ遷移する
- [x] revoke失敗時もローカル保存が残らない
- [x] high-risk操作後に古いrefresh tokenで復帰できない
- [x] BFFサンプルでゾンビログイン防止の実装順序が固定される
- [x] runbookに端末紛失・乗っ取り疑い・MFA再設定・退会時の失効手順がある
- [x] `pnpm verify` が通る
