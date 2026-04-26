# Quickstart Overview

最終更新: 2026-04-26

## 1. 想定読者
- clone 直後にローカルで IdP を起動して評価したい開発者
- 1日以内に PoC と運用タスク（監視/鍵ローテーション/DR）まで確認したいチーム

## 2. 導線
- 最短で動かす: [01-local-30min.md](./01-local-30min.md)
- 1日PoCを進める: [02-poc-1day.md](./02-poc-1day.md)
- 監視の最小導入: [03-observability-bootstrap.md](./03-observability-bootstrap.md)

## 3. ゴール
- 30分以内に `user@example.com` でログインし、トークン発行を確認する
- OIDC Discovery / JWKS / login API が正常に応答することを確認する

## 4. 前提環境
- Node.js 24+
- pnpm 10+
- Docker + Docker Compose

## 5. 失敗時の最短確認
1. `docker compose -f infra/docker-compose.yml ps` で `postgres` と `redis` が `running`
2. `.env` の `DATABASE_URL` が `localhost:55432`、`REDIS_URL` が `localhost:56379`
3. `pnpm db:migrate` が成功している
4. `pnpm db:seed` が成功している
