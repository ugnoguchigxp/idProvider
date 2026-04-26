# SSO IdP Gap Plan

最終更新: 2026-04-26

## 1. 目標
Google / Okta のように、IdP が一度のログイン状態を保持し、複数のアプリケーションやマイクロサービスが OIDC によってユーザーを認証できる状態を最低要件とする。

明確に実現したいこと:
- IdP とアプリケーションのドメインが異なっていてもSSOできる
- 各アプリケーションは IdP の cookie を直接読まない
- IdP のログイン状態は IdP ドメインの session cookie で保持する
- 各アプリケーションは OIDC redirect によって IdP にログイン状態を確認させる
- ログイン済みであれば IdP が authorization code を返し、各アプリケーションが自分のドメインでlocal sessionを発行する

想定フロー:
1. ユーザーがアプリ A にアクセスする。
2. アプリ A は未ログインの場合、IdP の authorization endpoint へ redirect する。
3. IdP は自分のログイン画面で認証し、IdP セッション cookie を発行する。
4. IdP は authorization code をアプリ A の redirect URI に返す。
5. アプリ A は code を token endpoint で交換し、ID Token / Access Token / Refresh Token を受け取る。
6. アプリ A は自分のアプリ内セッションを発行してログイン状態を維持する。
7. ユーザーがアプリ B にアクセスした場合、IdP セッションが有効なら再ログインなしで code を発行する。
8. API Gateway / BFF / マイクロサービスは token 検証、userinfo、introspection のいずれかでユーザー情報とログイン有効性を確認する。

## 1.1 クロスドメインSSOの原則
cookie はドメイン単位なので、アプリケーションやマイクロサービスが IdP の cookie を読む設計にはしない。

例:
- IdP: `https://login.example.com`
- App A: `https://app-a.example.com`
- App B: `https://service-b.example.net`

`login.example.com` の cookie は App A / App B から読めない。これは制約ではなく、SSO設計上の前提とする。

SSOは以下で成立させる:
- App A / App B は未ログイン時に IdP の authorization endpoint へ redirect する
- ブラウザは IdP ドメインへアクセスするため、IdP cookie を IdP に送信する
- IdP はログイン済みなら再認証せず authorization code を発行する
- App A / App B は code を token endpoint で交換し、自分のドメインでlocal session cookieを発行する

このため、各マイクロサービスが共有すべきものは IdP cookie ではなく、OIDC の標準フローと token 検証契約である。

## 1.2 BFF / API Gateway / Microservice の責務
BFF または API Gateway がある場合:
- browser redirect / callback / code exchange を BFF が担当する
- BFF は自分のドメインで httpOnly session cookie を発行する
- downstream microservice には、BFF が検証済みユーザー情報または内部tokenを渡す

各マイクロサービスが直接OIDCを扱う場合:
- 各サービスを OIDC confidential client として登録する
- redirect URI をサービスごとに登録する
- code exchange 後、サービス自身がlocal sessionを発行する

推奨初期構成:
- frontend直結ではなく BFF / API Gateway を OIDC client にする
- browser に長寿命tokenを持たせない
- downstream microservice は BFF / Gateway から受け取る内部認証情報を信頼し、必要に応じて IdP introspection / userinfo を使う

## 2. 現状判定
現状は「認証API + 一部OIDC/OAuth endpoint」は存在するが、SSO IdP としては未完成。

主な理由:
- 本番用の IdP ログイン interaction が未整備
- OIDC provider の状態管理が永続化されていない
- OIDC client 解決が DB registry と統合されていない
- userinfo / 標準claims / scope と microservice 連携の契約が不足
- IdP セッションと既存 `user_sessions` の責務が分離されたまま

## 2.1 初期スコープ
初期スコープは **server-sdk only / BFF・API Gateway 標準構成** とする。

含める:
- confidential client の Authorization Code + PKCE
- BFF / API Gateway による callback / code exchange
- BFF / API Gateway が自ドメインでlocal session cookieを発行する前提
- downstream microservice は BFF / Gateway から渡される内部認証情報を使う
- 必要に応じて BFF / Gateway が IdP の userinfo / introspection を呼ぶ

含めない:
- SPA が直接tokenを保持する public client flow
- MSALライク frontend SDK
- browser localStorage/sessionStorage でのtoken管理

public client は将来拡張とし、初期の最低要件には含めない。

## 3. P0 ギャップ
### Gap 1: 本番ログイン interaction がない
`oidc-provider` の `devInteractions` は production で無効化されるため、本番で使うログイン画面と interaction 完了処理が必要。

必要対応:
- IdP ログイン画面を provider interaction と接続する
- 既存 `/v1/login` の認証結果を OIDC interaction completion に接続する
- MFA / Google login / bot mitigation と OIDC interaction の統合方針を決める

### Gap 2: OIDC provider state が永続化されていない
authorization code、grant、session、interaction state が in-memory のままだと、再起動や複数インスタンスで SSO が壊れる。

必要対応:
- PostgreSQL adapter を実装する
- authorization code 再利用拒否を永続 state で検証する
- 複数プロセス相当の integration test を追加する

### Gap 3: Client Registry と OIDC provider が統合されていない
Admin API で OAuth client registry はあるが、`oidc-provider` の client 設定は env 由来の単一 client になっている。

必要対応:
- DB client registry から OIDC client を解決する
- client ごとに redirect URI / grant / scope / status を強制する
- disabled client が authorize/token を使えないことを検証する

### Gap 4: UserInfo / claims / scope 契約が不足
各マイクロサービスが「ログイン済みユーザーか」と「基本ユーザー情報」を得るには、標準的には ID Token claims、userinfo endpoint、または introspection が必要。

必要対応:
- `/userinfo` を公開する、または userinfo 非対応を明示して代替契約を固定する
- `openid profile email` scope と claims の対応を定義する
- `permissions` / `entitlements` は独自claimsとして扱い、標準claimsと分離する

### Gap 5: Token 系統が二重化している
`oidc-provider` の OIDC token と、Hono 側 `/oauth/token` / `user_sessions` の opaque token lifecycle が併存している。

必要対応:
- 外部SSOの正を `oidc-provider` endpoint に固定する
- Hono `/oauth/*` は内部互換APIとして残すか、段階的に統合するか決定する
- token introspection がどちらの token を対象にするか明確化する

### Gap 6: SSO logout 契約が不足
アプリ単位 logout と IdP セッション logout は別物。SSO では少なくとも IdP session を終了する導線が必要。

必要対応:
- RP initiated logout / end_session endpoint の方針を決める
- アプリ local session logout と IdP global logout の違いをドキュメント化する
- front/back-channel logout は初期対象外でも明示する

### Gap 7: server-sdk の契約が未定義
BFF / API Gateway が安全にOIDCを利用するための server-sdk API が未定義。

必要対応:
- login redirect URL 生成
- callback code exchange
- ID Token 検証
- userinfo / introspection 呼び出し
- logout URL 生成
- token / secret をログに出さない error normalize

## 4. 優先実装順
1. OIDC endpoint 責務を固定する
2. PostgreSQL adapter を入れて provider state を永続化する
3. production interaction を実装し、既存 login/MFA と接続する
4. client registry と provider client 解決を統合する
5. confidential client の Authorization Code + PKCE E2E を通す
6. userinfo / claims / scope 契約を固定する
7. logout 契約を実装または明示的に制限する
8. server-sdk をこの契約に合わせて実装する

## 4.1 詳細実装計画
### 実装状況
- [x] Task 1 の初期整理: 外部SSOは `oidc-provider` endpoint、Hono `/oauth/*` はopaque token互換APIとして分離
- [x] Task 2 の初期実装: `oidc-provider` PostgreSQL adapter、DB schema、migration、provider起動時のadapter注入
- [x] Task 3 の初期実装: production interaction ルート、既存email/password login接続、consent自動完了
- [x] Task 4 の初期実装: DB client registry から `oidc-provider` dynamic client を解決し、Argon2 hash secret のまま `client_secret_basic` を検証
- [x] Task 5 の初期実装: `profile` / `email` claims と UserInfo endpoint を有効化
- [x] Task 6 の初期実装: RP-Initiated Logout を有効化
- [x] Task 7 の初期実装: BFF / API Gateway 向け `server-sdk`
- [x] 実DB integration test / 再起動相当検証: `pnpm verify:sso-e2e`
- [x] Authorization Code + PKCE の2 client E2E検証: `pnpm verify:sso-e2e`

### Task 1: endpoint責務の固定
優先度: P0

目的:
- 外部SSOとして公開する正規endpointを `oidc-provider` に固定する。
- Hono `/oauth/*` は既存opaque token互換APIとして扱い、BFF/Gateway向けSSOの正規経路から切り離す。

対象:
- `docs/oidc-compatibility.md`
- `docs/openapi.yaml`
- `docs/sso-idp-gap-plan.md`
- `apps/idp-server/src/app.ts`
- `apps/idp-server/src/modules/auth/auth.routes.ts`

実装内容:
- Discovery に出る authorization/token/userinfo/revocation/introspection endpoint の責務を明記する
- Hono `/oauth/token` が OIDC code exchange endpoint ではないことを明記する
- BFF/Gateway は `OIDC_ISSUER` の discovery metadata を使う方針に統一する

受け入れ条件:
- ドキュメント上、SSO用endpointと互換APIの責務が混ざっていない
- server-sdk の接続先が discovery metadata から決定できる

### Task 2: oidc-provider PostgreSQL adapter
優先度: P0

目的:
- authorization code / interaction / grant / session state を再起動・複数インスタンスで失わない。

対象:
- `packages/db/src/schema.ts`
- `infra/migrations/*`
- `apps/idp-server/src/core/oidc-provider-adapter.ts`
- `apps/idp-server/src/core/oidc-provider.ts`
- `apps/idp-server/src/core/oidc-provider-adapter.test.ts`

実装内容:
- `oidc_provider_states` テーブルを追加する
- Adapter interface の `upsert`, `find`, `findByUid`, `findByUserCode`, `destroy`, `revokeByGrantId`, `consume` を実装する
- `expires_at`, `consumed_at`, `grant_id`, `uid`, `user_code` を保存する
- read時に期限切れを無効扱いにする
- cleanup scriptまたはjobを追加する

受け入れ条件:
- production相当設定で in-memory adapter に依存しない
- authorization code 発行後にプロセスを跨いでも token exchange が成功する
- consumed code の再利用が拒否される

### Task 3: production interaction 実装
優先度: P0

目的:
- IdPドメイン上でログインし、ログイン済みIdP sessionがあれば別clientでも再認証なしにauthorization codeを発行する。

対象:
- `apps/idp-server/src/core/oidc-provider.ts`
- `apps/idp-server/src/modules/auth/*`
- `apps/idp-server/src/modules/mfa/*`
- `apps/idp-server/src/utils/cookie.ts`
- `apps/idp-server/src/app.ts`

実装内容:
- `oidc-provider` interaction URL を独自ログイン画面または既存ログインUIへ接続する
- 既存 email/password login、Google login、MFA 成功後に interaction を完了する
- IdP session cookie の secure / sameSite / domain 方針を確定する
- `prompt=login`、未ログイン、MFA required、login failure の分岐をテストする

受け入れ条件:
- productionで `devInteractions=false` のままログインできる
- App Aでログイン後、App Bのauthorizeで再認証なしにcodeが返る
- MFA必須ユーザーでもinteractionが完了する

### Task 4: client registry と provider client 解決の統合
優先度: P0

目的:
- BFF / API Gateway を複数の confidential OIDC client として管理できるようにする。

対象:
- `apps/idp-server/src/core/oidc-provider.ts`
- `apps/idp-server/src/modules/oauth-clients/*`
- `packages/shared/src/schemas/admin.ts`
- `docs/openapi.yaml`
- `docs/oidc-compatibility.md`

実装内容:
- DB registry の active confidential client を provider client として解決する
- `redirectUris`, `allowedScopes`, `tokenEndpointAuthMethod`, `status` を provider に反映する
- disabled client の authorize/token を拒否する
- `client_secret_basic` は平文secretをDB保存せず、登録済みArgon2 hashに対して検証する
- env fallback は移行用に限定し、撤去条件を明記する

受け入れ条件:
- 2つ以上の confidential client がDB登録だけでSSO利用できる
- redirect URI不一致、scope不許可、disabled client が拒否される
- secret rotation のgrace期間中は旧secret、新secretの両方が検証される

### Task 5: userinfo / claims / scope 契約
優先度: P0

目的:
- BFF / Gateway / microservice がユーザーIDと基本profileを標準契約で取得できるようにする。

対象:
- `apps/idp-server/src/core/oidc-provider.ts`
- `apps/idp-server/src/modules/users/*`
- `docs/oidc-compatibility.md`
- `docs/openapi.yaml`

実装内容:
- `openid`, `profile`, `email` scope のclaims対応を定義する
- `/userinfo` の利用可否を固定する
- ID Token に載せる情報と userinfo で返す情報を整理する
- `permissions` / `entitlements` は独自claimsとして明記する

受け入れ条件:
- BFF が ID Token または userinfo から `sub`, `email`, `email_verified`, profile系claimsを取得できる
- scope不足時に不要なclaimsが返らない

### Task 6: SSO logout 契約
優先度: P0

目的:
- アプリlocal logoutとIdP global logoutの差を明確にし、最低限のIdP session終了を提供する。

対象:
- `apps/idp-server/src/core/oidc-provider.ts`
- `apps/idp-server/src/modules/auth/*`
- `docs/oidc-compatibility.md`

実装内容:
- RP initiated logout / end_session endpoint の対応方針を決める
- BFFがlocal sessionだけを消す場合と、IdP sessionも消す場合を分ける
- 初期では front/back-channel logout は対象外として明記する

受け入れ条件:
- BFF local logout 後、IdP session が残っていれば再SSOできる
- IdP global logout 後、別client authorizeで再ログインが必要になる

### Task 7: server-sdk 実装
優先度: P0

目的:
- BFF / API Gateway が IdP SSO を安全に利用できるSDKを提供する。

対象:
- `packages/server-sdk/src/*`
- `packages/server-sdk/src/__tests__/*`
- `packages/server-sdk/package.json`
- `README.md`

初期API:
```ts
type ServerSdkClient = {
  createAuthorizationUrl(input: {
    redirectUri: string;
    scope?: string[];
    state?: string;
    nonce?: string;
  }): Promise<{ url: string; state: string; nonce: string; codeVerifier: string }>;
  exchangeCode(input: {
    code: string;
    redirectUri: string;
    codeVerifier: string;
  }): Promise<{
    idToken: string;
    accessToken: string;
    refreshToken?: string;
    expiresIn: number;
  }>;
  verifyIdToken(input: { idToken: string; nonce?: string }): Promise<{
    sub: string;
    email?: string;
    emailVerified?: boolean;
    claims: Record<string, unknown>;
  }>;
  getUserInfo(input: { accessToken: string }): Promise<Record<string, unknown>>;
  createLogoutUrl(input?: { postLogoutRedirectUri?: string }): Promise<string>;
};
```

受け入れ条件:
- SDKだけでBFFのlogin redirect / callback / session発行前のユーザー取得まで実装できる
- client secret / token / authorization header をログに出さない
- timeout / retry / error normalize がある

## 4.2 E2Eシナリオ
### Scenario A: 初回ログイン
1. App AのBFFが `server-sdk.createAuthorizationUrl()` でIdPへredirectする
2. IdPでログイン/MFAを完了する
3. IdPがApp A callbackへcodeを返す
4. App AのBFFが `exchangeCode()` する
5. BFFが `verifyIdToken()` または `getUserInfo()` でユーザー情報を取得する
6. BFFがApp Aドメインのlocal session cookieを発行する

### Scenario B: クロスドメインSSO
1. App Aでログイン済み
2. App BのBFFがIdPへredirectする
3. IdP cookieにより再ログインなしでcodeが返る
4. App BのBFFがlocal session cookieを発行する

### Scenario C: local logout
1. App Aが自ドメインのlocal sessionを削除する
2. IdP sessionは残る
3. App Aで再ログイン導線に入ると、IdPで再認証なしにcodeが返る

### Scenario D: global logout
1. App AがIdP logoutへredirectする
2. IdP sessionが削除される
3. App Bでauthorizeしても再ログインが必要になる

## 5. SDK との関係
SDK はこのSSO契約の利用者であり、欠けているIdP機能を補う場所ではない。

- `server-sdk`: BFF / API Gateway 向けの redirect URL生成、code exchange、ID Token検証、userinfo、logout URL生成
- `oidc-client-sdk`: 初期スコープ外。public client が必要になった段階で別計画化する

IdP側のP0ギャップが解消されるまで、server-sdk も本番要件を満たせない。

## 6. Done
最低限のSSO IdPとしての完了条件:
- 2つ以上の client で「一度ログインすれば再認証なし」がE2Eで通る
- IdP再起動後も authorization code / session / grant の挙動が壊れない
- 2つ以上の confidential client が仕様通り動く
- マイクロサービスが token からユーザーIDと基本profileを取得できる
- logout の範囲が仕様として明確で、実装と一致している
- OpenID conformance 相当の検証結果が残っている
