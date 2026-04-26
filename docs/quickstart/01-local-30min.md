# Local 30min Quickstart

最終更新: 2026-04-26

## 1. 開始条件
- Node.js 24+ / pnpm 10+ / Docker が利用可能
- 3000, 3001, 5173, 55432, 56379 ポートが使用中でない

## 2. 最短セットアップ（推奨）

```bash
git clone <REPOSITORY_URL>
cd gxp-idProvider
pnpm bootstrap:local
```

期待結果:
- `bootstrap completed` が表示される
- `http://localhost:3000/healthz` が `200`
- `http://localhost:3001/.well-known/openid-configuration` が `200`

## 3. サーバー起動

```bash
pnpm dev
```

期待結果:
- API: `http://localhost:3000`
- OIDC issuer: `http://localhost:3001`

## 4. 動作確認

```bash
curl -i http://localhost:3000/healthz
curl -i http://localhost:3000/readyz
curl -s http://localhost:3001/.well-known/openid-configuration
```

ログイン確認:

```bash
curl -i -X POST http://localhost:3000/v1/login \
  -H 'content-type: application/json' \
  -d '{"email":"user@example.com","password":"Gxp#Idp!2026$Secure"}'
```

期待結果:
- HTTP `200`
- `accessToken` / `refreshToken` を含む JSON

## 5. 初期データ（seed）
- ユーザー
  - `admin@example.com` / `Gxp#Idp!2026$Secure`
  - `sysadmin@example.com` / `Gxp#Idp!2026$Secure`
  - `support@example.com` / `Gxp#Idp!2026$Secure`
  - `auditor@example.com` / `Gxp#Idp!2026$Secure`
  - `user@example.com` / `Gxp#Idp!2026$Secure`
- OAuthクライアント（`.env`既定値）
  - `client_id`: `local-client`
  - `client_secret`: `local-client-secret`
  - `redirect_uri`: `http://localhost:5173/callback`

## 6. よくある失敗と復旧
1. `DATABASE_URL is required` が出る
- `.env` がないか読み込まれていない。`cp .env.example .env` 後に再実行

2. `connection refused` で migrate/seed が失敗
- `pnpm stack:up` を再実行し、`docker compose -f infra/docker-compose.yml ps` を確認

3. `readyz` が 500 になる
- migrate/seed 未実行の可能性。`pnpm db:migrate && pnpm db:seed` を再実行

## 7. 終了手順

```bash
pnpm stack:down
```
