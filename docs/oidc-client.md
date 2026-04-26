# Server SDK導入計画

最終更新: 2026-04-26  
対象: `packages/server-sdk`

## 1. 方針
BFF / API Gateway / server-side microservice は `packages/server-sdk` を使って IdP SSO を利用する。

認証はIdP側で行い、アプリケーションには Authorization Code redirect で戻る。アプリケーション側は code exchange と token検証後、自ドメインの httpOnly local session cookie を発行する。

この計画は2つの工程に分かれる。

1. `packages/server-sdk` の実装
2. 対象BFF / Gatewayへの組み込み

SDKだけではlocal session cookieを発行できない。cookie名、署名方式、保存先、session TTL、downstream microserviceへ渡す内部認証情報はアプリケーション境界の設計に依存するため、対象BFF / Gateway側で実装する。

## 2. 前提
実装済み:
- production interaction
- PostgreSQL adapterによる OIDC provider state永続化
- DB client registry による confidential client管理
- Authorization Code + PKCE
- ID Token / UserInfo
- RP-Initiated Logout
- 実PostgreSQL / Redis の2 client SSO E2E: `pnpm verify:sso-e2e`

外部SSOの正規endpointは `OIDC_ISSUER` の discovery metadata を使う。

## 3. SDK責務
`packages/server-sdk` が担当すること:
- discovery metadata取得
- login redirect URL生成
- PKCE `code_verifier` / `code_challenge` 生成
- callback後の code exchange
- ID Token署名検証
- issuer / audience / azp / exp / nonce検証
- UserInfo取得
- token refresh
- token introspection
- token revocation
- logout URL生成
- timeout / retryable error normalize
- `completeAuthorizationCodeCallback()` による callback処理の一括実行
- `toSessionIdentity()` によるlocal session用identity生成

アプリケーション側が担当すること:
- `state`, `nonce`, `codeVerifier` の一時保存
- callbackでの `state` 照合
- local session cookie発行
- downstream microserviceへ渡す内部認証情報の設計
- token / secret / authorization header をログに出さない運用

## 4. 実装状況
SDK側は以下を実装対象とする。

| 項目 | 状態 | API |
| --- | --- | --- |
| discovery metadata取得 | 実装済み | internal |
| login redirect URL生成 | 実装済み | `createAuthorizationUrl()` |
| PKCE生成 | 実装済み | `createAuthorizationUrl()` |
| code exchange | 実装済み | `exchangeCode()` |
| callback一括処理 | 実装済み | `completeAuthorizationCodeCallback()` |
| ID Token署名検証 | 実装済み | `verifyIdToken()` |
| issuer / audience / azp / exp / nonce検証 | 実装済み | `verifyIdToken()` |
| UserInfo取得 | 実装済み | `getUserInfo()` |
| local session用identity生成 | 実装済み | `toSessionIdentity()` |
| token refresh | 実装済み | `refreshTokens()` |
| token introspection | 実装済み | `introspectToken()` |
| token revocation | 実装済み | `revokeToken()` |
| logout URL生成 | 実装済み | `createLogoutUrl()` |
| timeout / retryable error normalize | 実装済み | `ServerSdkError` |

example BFF側は以下を実装済み。

| 項目 | 状態 | 対象 |
| --- | --- | --- |
| 別HonoアプリとしてのBFF | 実装済み | `apps/example-bff` |
| IdP redirect login | 実装済み | `GET /login` |
| callback処理 | 実装済み | `GET /callback` |
| local session cookie発行 | 実装済み | `example_bff_session` |
| tokenをcookieへ保存しない方針 | 実装済み | identity snapshotのみ保存 |
| local logout | 実装済み | `POST /logout` |
| global logout redirect | 実装済み | `POST /logout/global` |
| login / callback / local logout後の再SSO E2E | 実装済み | `pnpm verify:example-bff-e2e` |

このリポジトリでまだ本番組み込みとして未完了の工程:
- 実サービスのBFF / Gatewayへの組み込み
- downstream microserviceへ渡す内部認証情報の実装
- 実サービス固有のsession store / cookie名 / TTL / 署名鍵管理
- 実サービスBFF / Gatewayでのlogin / callback / logout E2E

未完了理由:
- `apps/example-bff` はSDK利用方法とSSO動作を確認するリファレンス実装であり、実サービスのBFF / Gatewayそのものではない。
- `apps/admin-ui` はSPAであり、server SDKでsecretを保持する前提と合わない。
- `apps/idp-server` はIdP本体であり、SSOを利用するRP側BFFではない。

## 5. 導入手順
1. BFF / GatewayをDB client registryに confidential client として登録する。
2. redirect URIを登録する。
3. `client_id` / `client_secret` をBFF / Gatewayのsecret管理に設定する。
4. 未ログイン時に `createAuthorizationUrl()` でIdPへredirectする。
5. callbackで `completeAuthorizationCodeCallback()` を呼ぶ。
6. 返却された検証済みID TokenまたはUserInfoからlocal sessionのユーザー情報を作る。
7. local session cookieを発行する。
8. logout時はlocal logoutとIdP global logoutを分けて実装する。

低レベルAPIを個別に使う場合:
- `exchangeCode()` で token endpoint にcodeを交換する。
- `verifyIdToken()` でID Tokenを検証する。
- 必要に応じて `getUserInfo()` でprofileを取得する。
- `refreshTokens()` でrefresh tokenを更新する。
- `introspectToken()` でtoken有効性を確認する。
- `revokeToken()` でrefresh token等を失効する。
- `toSessionIdentity()` でlocal sessionに保存する最小identityを作る。

## 6. Logout
local logout:
- アプリケーションのlocal session cookieだけを削除する。
- IdP sessionは残る。
- 再度login redirectすると再認証なしで戻れる。

global logout:
- `createLogoutUrl()` でIdP logout URLを生成してredirectする。
- IdP sessionを削除する。
- 他clientでも再ログインが必要になる。

## 7. Go基準
- `pnpm verify:sso-e2e` が成功する。
- `pnpm verify:example-bff-e2e` が成功する。
- 対象BFF / Gatewayでlogin / callback / logoutがE2E成功する。
- local session cookieが httpOnly / secure / sameSite 方針に従う。
- token / secret / authorization header がログに出ない。
- IdP再起動後もSSOが継続する。

## 8. 次に必要な実装
この計画を完全完了にするには、実サービスのBFF / Gatewayへ組み込む必要がある。

`apps/example-bff` はSDK利用例と回帰テストとして有効だが、実サービスのsession設計を代替しない。
