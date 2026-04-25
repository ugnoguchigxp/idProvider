# メール送信・通知基盤計画書 (Email & Notification Delivery Plan)

## 1. 目的
本人確認、パスワードリセット、MFA/アカウント保護通知、運用アラートを確実に配信する。送信処理は認証APIの応答時間や可用性に影響させず、配信結果、バウンス、苦情、サプレッションを追跡できる状態にする。

初期実装は SendGrid Web API v3 を配信プロバイダーとして使う。SendGrid の Azure 導入手順は [sendgrid-setup-guide.md](/Users/y.noguchi/Code/gxp-idProvider/docs/sendgrid-setup-guide.md) に分離し、この文書ではアプリケーション側の設計を定義する。

## 2. 現状との差分
現行実装では、`ConfigService` が `system_configs` に `email_templates.<key>` として `subject` / `body` を保存している。`signup_verify` と `password_reset` は seed されているが、SendGrid Dynamic Template ID は保存していない。

`apps/idp-server/src/core/security-notifier.ts` は `security.notification.queued` を logger に出すだけで、メールキューや SendGrid 呼び出しは未実装。

`/v1/email/verify/request` は `getEmailTemplateConfig("signup_verify")` を読み、logger に `email.dispatch.requested` を出すだけでメールを送信していない。

実装前に必要な差分:
- メール送信ジョブの永続化または Redis/BullMQ queue の導入。
- SendGrid API client の追加。
- Dynamic Template ID を保存できる config schema への拡張。
- サプレッションリストと SendGrid Event Webhook 受信テーブルの追加。
- 送信イベントと失敗理由を追跡する監査/運用ログの追加。

## 3. 対象メール
初期対象は transactional email のみ。マーケティングメールは扱わない。

| key | 用途 | 宛先 | 優先度 | PII 方針 |
| :--- | :--- | :--- | :--- | :--- |
| `signup_verify` | メールアドレス確認 | 対象ユーザー | high | token ではなく短命URLを渡す |
| `password_reset` | パスワードリセット | 対象ユーザー | high | token ではなく短命URLを渡す |
| `mfa_recovery_used` | リカバリコード使用通知 | 対象ユーザー | high | コード値は含めない |
| `mfa_recovery_regenerated` | リカバリコード再生成通知 | 対象ユーザー | high | コード値は含めない |
| `account_deletion_requested` | アカウント削除要求通知 | 対象ユーザー | high | 削除予定日時のみ |
| `security_alert` | 重要なセキュリティ通知 | 管理者 | high | payload は最小限 |

メール本文に token hash、パスワード、MFA secret、recovery code、refresh token、access token を含めない。

## 4. 配信アーキテクチャ
同期 API handler から SendGrid を直接呼ばない。API handler はドメイン処理を完了後、メール送信要求をキューに積む。

推奨構成:
1. route/service が `EmailDeliveryService.enqueue()` を呼ぶ。
2. `EmailDeliveryService` がサプレッションとテンプレート設定を確認する。
3. Redis/BullMQ に job を登録し、必要なら `email_deliveries` に追跡レコードを作る。
4. worker が SendGrid Web API v3 を呼ぶ。
5. 成功/失敗を `email_deliveries` に反映し、構造化ログを出す。
6. SendGrid Event Webhook が最終的な delivered/bounce/spam_report などを反映する。

BullMQ を採用する理由:
- 既に Redis client が存在する。
- retry/backoff/delay/concurrency を制御しやすい。
- API process と worker process を分離できる。

SMTP は初期実装では使わない。SendGrid Web API の方が request id、category、template data、sandbox mode、event webhook と整合しやすい。

## 5. DB / Config 設計
### `system_configs` 拡張
既存の `EmailTemplateConfig` は `subject` / `body` のみ。SendGrid Dynamic Template を使う場合は以下の形に拡張する。

```ts
type EmailTemplateConfig = {
  provider: "local" | "sendgrid";
  subject: string;
  body: string;
  sendgridTemplateId?: string;
  defaultLocale: string;
  localeTemplateIds?: Record<string, string>;
};
```

初期移行では `provider = "local"` を fallback として残す。SendGrid 設定がある template だけ `provider = "sendgrid"` として送信する。

### 新規テーブル
`email_deliveries`:

| カラム | 用途 |
| :--- | :--- |
| `id uuid primary key` | 内部追跡 ID |
| `message_key varchar(128)` | `signup_verify` などの用途 |
| `recipient_email varchar(320)` | 宛先。retention で匿名化対象 |
| `recipient_user_id uuid null` | ユーザーに紐づく場合 |
| `provider varchar(32)` | `sendgrid` |
| `provider_message_id varchar(255) null` | SendGrid message id |
| `status varchar(32)` | `queued`, `sent`, `delivered`, `deferred`, `bounced`, `dropped`, `failed`, `suppressed` |
| `attempt_count integer` | worker 試行回数 |
| `last_error text null` | 最後の失敗理由。token や template data は含めない |
| `metadata jsonb` | category, correlation id など。PII は入れない |
| `created_at`, `updated_at`, `sent_at` | 時刻 |

`email_suppressions`:

| カラム | 用途 |
| :--- | :--- |
| `email varchar(320) primary key` | lower-case 正規化済み |
| `reason varchar(64)` | `bounce`, `spam_report`, `unsubscribe`, `manual` |
| `provider varchar(32)` | `sendgrid` |
| `provider_event_id varchar(255) null` | Webhook由来の場合 |
| `created_at` | 登録時刻 |

`sendgrid_webhook_events`:

| カラム | 用途 |
| :--- | :--- |
| `event_id varchar(255) primary key` | SendGrid event id または重複排除用 hash |
| `email varchar(320)` | 宛先 |
| `event_type varchar(64)` | `delivered`, `bounce`, `spam_report` など |
| `payload jsonb` | 検証済み payload。保存前に不要な PII を削る |
| `created_at` | 受信時刻 |

## 6. 環境変数
| 変数 | 必須 | 用途 |
| :--- | :--- | :--- |
| `EMAIL_PROVIDER` | no | `log`, `sendgrid`。既定は `log` |
| `SENDGRID_API_KEY` | production sendgrid で必須 | Mail Send 権限のみ |
| `SENDGRID_FROM_EMAIL` | sendgrid で必須 | 認証済み送信元 |
| `SENDGRID_FROM_NAME` | no | 表示名 |
| `SENDGRID_SANDBOX_MODE` | no | 非productionの誤送信防止 |
| `SENDGRID_WEBHOOK_PUBLIC_KEY` | webhook 使用時必須 | Event Webhook署名検証 |
| `EMAIL_QUEUE_CONCURRENCY` | no | worker並列数 |
| `EMAIL_QUEUE_MAX_ATTEMPTS` | no | retry上限 |
| `APP_PUBLIC_URL` | high priority mail で必須 | verification/reset URL生成 |

production で `EMAIL_PROVIDER=sendgrid` なのに `SENDGRID_API_KEY` / `SENDGRID_FROM_EMAIL` がない場合は起動に失敗させる。

## 7. テンプレートとURL
SendGrid Dynamic Transactional Templates を正本にする。ただし、local/test では `subject` / `body` を使ったローカルレンダリングを fallback として残す。

template data の命名:
- `action_url`: 確認/リセット用URL
- `user_email`: 宛先メール。必要なテンプレートだけに渡す
- `expires_minutes`: 有効期限
- `event_time`: 通知対象イベント時刻
- `support_url`: 問い合わせ先

`{{token}}` を直接テンプレートに渡さない。`APP_PUBLIC_URL` を使って短命URLを生成し、URL query に token を含める。ログには URL 全体を出さず、`deliveryId`, `messageKey`, `recipientUserId` のみを出す。

i18n:
- ユーザーの `locale` がある場合は `localeTemplateIds[locale]` を優先する。
- 完全一致がなければ言語部分だけで fallback する。例: `ja-JP` -> `ja`。
- それもなければ `defaultLocale` の template を使う。

## 8. SendGrid Client 設計
`EmailProvider` interface を定義する。

```ts
type SendEmailInput = {
  to: string;
  from: { email: string; name?: string };
  templateId: string;
  dynamicTemplateData: Record<string, unknown>;
  categories: string[];
  customArgs: Record<string, string>;
  sandboxMode: boolean;
};

interface EmailProvider {
  send(input: SendEmailInput): Promise<{ providerMessageId: string | null }>;
}
```

実装:
- `LogEmailProvider`: local/test 用。送信せず structured log のみ。
- `SendGridEmailProvider`: `@sendgrid/mail` または SendGrid REST API client を使う。

SendGrid `custom_args` には `deliveryId`, `messageKey`, `recipientUserId` を入れる。token、URL、メール本文は入れない。

## 9. Retry / Rate Limit
retry対象:
- 429
- 5xx
- network timeout

retryしない:
- 400 template data invalid
- 401/403 API key/auth error
- 404 template not found
- suppressed recipient

推奨設定:
- attempts: 5
- backoff: exponential, base 30 seconds
- max delay: 30 minutes
- worker concurrency: 初期値 5
- provider rate limit 到達時は queue rate limiter で全体を減速する

同じ用途/宛先のメールを短時間に重複送信しない。例: `signup_verify:{email}` は 60 秒 dedupe する。

## 10. SendGrid Event Webhook
`POST /v1/webhooks/sendgrid` を追加する。

必須:
- SendGrid Event Webhook の署名検証を行う。
- timestamp の許容差を設定し、replay を拒否する。
- event id または payload hash で冪等化する。
- `bounce`, `dropped`, `spam_report`, `unsubscribe` は `email_suppressions` に登録する。
- `delivered`, `deferred`, `bounce`, `dropped`, `spam_report` は `email_deliveries.status` を更新する。

Webhook は公開 endpoint になるため、通常のユーザー認証ではなく SendGrid 署名検証で保護する。署名検証失敗は 401 を返し、payload は保存しない。

## 11. サプレッション方針
送信前に `email_suppressions` を必ず確認する。

送信しない対象:
- hard bounce
- spam report
- unsubscribe
- manual suppression
- 削除済みユーザーへの任意通知

例外:
- 法令・セキュリティ上必要な通知を unsubscribe より優先するかは未決。初期実装では `spam_report` と hard bounce には送らない。

サプレッション登録後もメールアドレスそのものは PII のため、retention 対象にする。削除済みユーザーのメールは account deletion finalize 後に匿名化または削除する。

## 12. SecurityNotifier との関係
`SecurityNotifier` は「誰に何を通知すべきか」を決める薄い層にする。実送信は `EmailDeliveryService` に委譲する。

変更後の責務:
- `ConfigService.getNotificationConfig()` で管理者通知先と alert level を取得する。
- 通知対象イベントなら `EmailDeliveryService.enqueue("security_alert", recipients, data)` を呼ぶ。
- logger には queued の事実だけを出し、payload全体や secret は出さない。

ユーザー向け通知は `SecurityNotifier` ではなく、各ドメインサービスから `EmailDeliveryService` を直接呼ぶ。

## 13. ローカル開発
- 既定は `EMAIL_PROVIDER=log`。実メールは送らない。
- SendGrid integration を検証する場合は `SENDGRID_SANDBOX_MODE=true` を必須にする。
- MSW または local fake provider で SendGrid API の成功/失敗をテストする。
- local でも queue worker を起動できるようにし、API handler と worker の境界をテストする。

## 14. 監視
構造化ログ:
- `email.delivery.queued`
- `email.delivery.sent`
- `email.delivery.failed`
- `email.delivery.suppressed`
- `email.webhook.received`
- `email.webhook.signature_invalid`

メトリクス:
- queued count
- sent count
- failed count by messageKey/provider/status
- retry count
- bounce rate
- spam report rate
- queue latency p50/p95/p99
- provider latency p95

アラート:
- high priority mail の failed rate が 5 分で 1% を超える
- bounce rate が 5% を超える
- queue latency p95 が 5 分を超える
- webhook signature invalid が急増する

## 15. テスト計画
- `EmailDeliveryService.enqueue()` がサプレッション済み宛先を送信しない。
- `EMAIL_PROVIDER=log` で外部APIを呼ばない。
- SendGrid provider が templateId, dynamicTemplateData, categories, customArgs を正しく渡す。
- retry対象エラーだけ retry される。
- `signup_verify` と `password_reset` は token ではなく action URL を渡す。
- 重複送信 dedupe が効く。
- SendGrid webhook の署名検証に失敗した payload は保存されない。
- bounce/spam_report が `email_suppressions` に反映される。
- `SecurityNotifier` が対象 alert level のみ enqueue する。
- ログとDBに token、secret、recovery code が含まれない。

## 16. 実装順序
1. env schema にメール関連設定を追加する。
2. `EmailTemplateConfig` と admin schema を SendGrid template ID 対応に拡張する。
3. `email_deliveries`, `email_suppressions`, `sendgrid_webhook_events` を追加する。
4. `EmailProvider`, `LogEmailProvider`, `SendGridEmailProvider` を実装する。
5. `EmailDeliveryService` と queue worker を追加する。
6. `signup_verify` / `password_reset` を enqueue に切り替える。
7. `SecurityNotifier` から `EmailDeliveryService` を呼ぶ。
8. SendGrid webhook endpoint を追加する。
9. サプレッション、retry、監視ログ、テストを追加する。

## 17. 未決事項
- Queue は BullMQ で確定するか、DB-backed outbox を採用するか。既存 Redis があるため初期案は BullMQ。
- SendGrid Dynamic Template を全環境で正本にするか、local template をいつまで fallback として残すか。
- unsubscribe を security notification に適用する範囲。
- 専用IPとIP warmup の開始タイミング。100万人規模で一斉送信する前に決める。
- Event Webhook payload の保存期間。
