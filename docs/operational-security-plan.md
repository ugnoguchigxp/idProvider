# インフラ抽象化・シークレット管理計画 (Infrastructure Abstraction & Secret Management Plan)

## 1. 目的
100万人規模の運用に耐えうる柔軟性とセキュリティを確保するため、外部サービス（メール、SMS、シークレット管理）への依存を抽象化し、環境に応じた最適なコンポーネントを選択可能にする。

## 2. シークレット管理 (Secret Management)
### 方針
- **実行環境への非依存**: `.env` ファイルに直接秘密情報を書き込む運用を避け、本番環境ではマネージドなシークレット管理サービスを利用する。
- **設定アダプターの導入**: アプリケーションは `ConfigAdapter` インターフェースを通じて設定を取得する。

### 実装イメージ
- **Development**: `.env` ファイルから読み込み。
- **Production**: AWS Secrets Manager, GCP Secret Manager, または HashiCorp Vault から起動時（または動的）に取得。
- **マスキング**: ログ出力時にシークレットが露出しないよう、設定クラス内で自動的にマスキング処理を行う。

## 3. 通知プロバイダーの抽象化 (Provider Abstraction)
### `SecurityNotifier` インターフェース
特定のプロバイダーに依存しない共通インターフェースを定義する。

```typescript
interface SecurityNotifier {
  sendEmail(to: string, template: string, data: Record<string, any>): Promise<void>;
  sendSms(to: string, message: string): Promise<void>;
}
```

### 実装の切り替え
- **Email**: SendGrid, AWS SES, SMTP 等を環境変数で切り替え。
- **SMS**: Twilio, AWS SNS 等を切り替え。
- **Mock**: 開発・テスト環境用（ログ出力のみ、またはメモリ内保持）。

## 4. 高可用性とスケーラビリティ
- **Redis の多目的利用**:
    - **セッションストア**: 分散環境でのステート共有。
    - **分散レート制限**: `hono-rate-limiter` 等と連携し、特定IPやユーザーに対する攻撃をエッジ/アプリケーション層で遮断。
- **データベース接続**:
    - 本番環境では Read Replica を活用し、`UserInfo` や `Authorization Check` などの参照系クエリを分散させる。

## 5. セキュリティ
- **秘密情報の最小化**: 署名鍵 (JWT Private Key) 等の極めて重要な情報は、アプリケーションメモリ内での保持時間を最小限にし、可能な限り KMS (Key Management Service) 等での署名代行も将来的な選択肢に含める。
