# 1day PoC Guide

最終更新: 2026-04-26

## 1. 目的
1日で「認証導入の成立性」と「運用可能性」を判断するための最小タスクをまとめる。

## 2. Day 1 チェックリスト
1. Local 30minを完了する
- 参照: [01-local-30min.md](./01-local-30min.md)

2. OIDC連携を確認する
- `/.well-known/openid-configuration`
- `/.well-known/jwks.json`
- `/oauth/token`（client credentials または auth code）

3. BFF/SDK 連携サンプルを動かす
- Node/BFF: [../samples/sdk-node-example.md](../samples/sdk-node-example.md)
- Kotlin: [../samples/sdk-kotlin-example.md](../samples/sdk-kotlin-example.md)
- Swift: [../samples/sdk-swift-example.md](../samples/sdk-swift-example.md)

4. 品質ゲートを実行する

```bash
pnpm verify
pnpm verify:oidc-conformance
pnpm verify:sso-e2e
```

5. 運用手順への接続を確認する
- Go/No-Go: [../runbooks/production-go-no-go-checklist.md](../runbooks/production-go-no-go-checklist.md)
- Restore rehearsal: [../runbooks/restore-rehearsal.md](../runbooks/restore-rehearsal.md)
- Key compromise: [../key-compromise-runbook.md](../key-compromise-runbook.md)

## 3. 判定基準
- 認証成功: `v1/login` で token 発行が成功
- OIDC互換: discovery/jwks/token が成功
- 運用導線: runbook で障害時の初動が追える

## 4. 失敗時の切り分け
1. API起動はするがOIDCが失敗する
- `OIDC_ISSUER` と `OIDC_PORT` の整合性を確認

2. サンプル連携で `invalid_client`
- seed済み client id/secret と redirect uri が一致しているか確認

3. e2eで flaky が出る
- `pnpm stack:down && pnpm stack:up` で依存サービス再起動
