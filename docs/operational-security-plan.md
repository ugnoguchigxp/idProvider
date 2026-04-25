# Operational Security補助計画

## 位置づけ
この文書は、本番運用向けロードマップの正本ではなく、インフラ抽象化、シークレット取得、通知プロバイダー切り替えに焦点を絞った補助計画とする。

以下の領域は個別計画を正本とする。

- OpenAPI契約テスト: `docs/01-openapi-contract-test-plan.md`
- Threat Model / Security Runbook: `docs/02-threat-model-security-runbook-plan.md`
- OAuth/OIDC conformance: `docs/03-oidc-conformance-plan.md`
- Client Registry: `docs/04-client-registry-plan.md`
- Key Management / Rotation: `docs/05-key-management-rotation-plan.md`
- Audit Log完全性: `docs/06-audit-log-integrity-plan.md`
- Policy Engine: `docs/07-policy-engine-plan.md`
- Tenant / Organization境界: `docs/08-tenant-organization-boundary-plan.md`
- Observability / Security Monitoring: `docs/09-observability-security-monitoring-plan.md`
- Backup / DR / Migration: `docs/10-backup-dr-migration-plan.md`

## 目的
外部サービスと実行環境への依存を抽象化し、development/staging/productionで安全に設定・通知・シークレット取得方式を切り替えられるようにする。

## 対象範囲
- シークレット取得アダプター
- 設定ロード方式
- 通知プロバイダー抽象化
- provider failoverの基本方針
- ログ上のsecret masking

## 対象外
以下は重複を避けるため、この文書では詳細設計しない。

- 署名鍵のrotationとJWKS管理
- security monitoringとalert rule
- backup/restore/DR
- threat modelとincident runbook
- audit logの改ざん検知

## シークレット管理
### 方針
- 本番では`.env`に秘密情報を直接置かない。
- アプリケーションは`SecretProvider`または`ConfigAdapter`経由で秘密情報を取得する。
- 取得したsecretはログに出さない。
- secretの有効期限・rotationはprovider側とアプリ側の両方で扱えるようにする。

### Provider候補
- AWS Secrets Manager
- GCP Secret Manager
- HashiCorp Vault
- Kubernetes Secrets
- Local `.env` for development only

## 通知プロバイダー抽象化
### 目的
メール/SMS/将来の通知経路をprovider非依存にし、SendGrid、SES、SMTP、Twilioなどを切り替え可能にする。

### Interface案
```typescript
interface SecurityNotifier {
  sendEmail(to: string, template: string, data: Record<string, unknown>): Promise<void>;
  sendSms(to: string, message: string): Promise<void>;
}
```

### 方針
- productionでは送信失敗をstructured logとmetricに出す。
- password resetやemail verificationは再送制御とrate limitを組み合わせる。
- provider障害時のfallback可否をtemplateごとに定義する。

## 設定ロード
- development: `.env`
- staging: managed secret + explicit config
- production: managed secret + immutable deployment config

## 受け入れ条件
- 本番secretが`.env`不要で起動できる。
- secret値がログに露出しない。
- 通知providerを設定で切り替えられる。
- provider障害時の挙動が定義されている。
- この文書がTop10個別計画と重複しない。
