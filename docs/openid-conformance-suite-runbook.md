# OpenID Conformance Suite Runbook

最終更新: 2026-04-26

## 1. 目的
OpenID FoundationのConformance Suiteを使って、本リポジトリの内部テストでは検出しにくい仕様逸脱を定期的に検証する。

このRunbookは次の2段構えで運用する。
- 段階A: リポジトリ内 conformance テスト (`pnpm verify:oidc-conformance`)
- 段階B: OpenID Conformance Suite による外部適合性検証

## 2. 前提条件
- テスト対象環境が公開到達可能 (HTTPS) であること
- discovery / jwks / token / revocation / introspection が外部から到達可能であること
- テスト専用クライアントID/Secretを発行済みであること
- テスト用ユーザーを用意済みであること

必須エンドポイント例:
- `https://<host>/.well-known/openid-configuration`
- `https://<host>/.well-known/jwks.json`
- `https://<host>/oauth/token`
- `https://<host>/oauth/revocation`
- `https://<host>/oauth/introspection`

## 3. 実行手順
### 3.1 段階A: 内部 conformance を先に通す
```bash
pnpm verify:oidc-conformance
```

失敗した場合は外部スイート実行前に修正する。

### 3.2 段階B: OpenID Conformance Suite 実行
1. OpenID Certification Portal (`https://www.certification.openid.net/`) にログインする。
2. OP (OpenID Provider) テストプランを作成する。
3. discovery URL に `/.well-known/openid-configuration` を入力する。
4. テストクライアント情報 (client_id/client_secret/redirect_uri) を設定する。
5. 本実装のサポート範囲に一致するテストモジュールのみ有効化する。
6. 実行し、失敗ケースを収集する。
7. 失敗内容を issue 化し、`docs/oidc-compatibility.md` と実装を同期する。

注記:
- 本実装は現時点で Dynamic Client Registration / PAR/JAR / CIBA / Device Flow を非対応とする。
- 非対応項目は失敗を許容するのではなく、対象外としてテストスコープから除外する。

## 4. CI運用
GitHub Actions `OIDC Conformance` ワークフローで次を実行する。
- `internal-conformance`: リポジトリ内の OIDC/OAuth conformance 検証
- `external-suite-precheck`: 外部suite実行前の疎通確認

`external-suite-precheck` を有効化するには以下の repository secrets を設定する。
- `OIDC_CONFORMANCE_DISCOVERY_URL`
- `OIDC_CONFORMANCE_JWKS_URL`
- `OIDC_CONFORMANCE_TOKEN_URL`
- `OIDC_CONFORMANCE_REVOCATION_URL`
- `OIDC_CONFORMANCE_INTROSPECTION_URL`

## 5. 記録テンプレート
実行ごとに以下を記録する。
- 実施日時 (UTC/JST)
- 対象環境
- 使用したテストプラン名
- 成功/失敗件数
- 失敗ケース一覧
- 対応issue URL
- 判定 (Pass / Conditionally Pass / Fail)

## 6. Exit Criteria
以下を満たしたらその実行を完了扱いにする。
- `pnpm verify:oidc-conformance` が成功
- 外部Suite対象ケースの結果が記録済み
- 新規失敗があれば issue 化済み
- `docs/oidc-compatibility.md` と実装の差分がない
