# SendGrid (on Azure) 導入・セットアップ手順書

## 1. Azure Portal でのセットアップ
Azure サブスクリプション内で SendGrid リソースを作成する手順です。

1. **リソースの作成**:
   - Azure Portal で「SendGrid」を検索し、作成を選択。
   - 価格プラン（Free/Essential/Pro等）を選択。100万人規模を想定する場合、将来的に Pro プランへのアップグレード（固定IP、サブユーザー管理）を検討。
2. **アカウントの構成**:
   - 名前、パスワード、連絡先情報を入力。
   - 「Review + create」をクリック。
3. **SendGrid ダッシュボードへのアクセス**:
   - 作成したリソースの「Manage」ボタンをクリックして、SendGrid の管理コンソールに移動。

## 2. 送信ドメイン認証 (Sender Authentication)
到達率を確保するための最重要ステップです。

1. **Domain Authentication**:
   - SendGrid 側で「Settings > Sender Authentication」に移動。
   - 「Authenticate Your Domain」を選択し、使用するドメインを指定。
   - 発行された **CNAME レコード** を DNS (Azure DNS等) に追加。
   - SendGrid 側で「Verify」が通ることを確認。

## 3. API キーの発行
アプリケーションから送信するための認証情報を取得します。

1. **API Key 作成**:
   - 「Settings > API Keys」で「Create API Key」をクリック。
   - **Restricted Access** を選択し、`Mail Send` 権限のみを付与したキーを作成（最小権限の原則）。
2. **環境変数への設定**:
   - 生成されたキー（`SG.xxx...`）を以下の環境変数名で保存。
   - `SENDGRID_API_KEY`

## 4. Dynamic Templates の作成
1. **テンプレート作成**:
   - 「Email API > Dynamic Templates」でテンプレートを新規作成。
   - 各通知（サインアップ確認、パスワードリセット等）の `Template ID` (例: `d-xxxx...`) を控えておく。
2. **Handlebars 変数の定義**:
   - 本文中で `{{user_name}}` や `{{link_url}}` などの変数を配置。

## 5. Webhook の設定 (推奨)
バウンスやスパム報告を処理するために設定します。

1. **Event Webhook**:
   - 「Settings > Mail Settings > Event Webhook」を有効化。
   - `HTTP Post URL` に、アプリケーション側の Webhook 受信エンドポイント（例: `https://idp.example.com/v1/webhooks/sendgrid`）を入力。
   - `Dropped`, `Bounced`, `Spam Reports` 等を選択して保存。

## 6. 実装時の注意点
- **IP ウォームアップ**: 100万人規模で一気に送信を開始する場合、専用IP (Fixed IP) を取得し、段階的に送信量を増やすウォームアップが必要です。
- **カテゴリ設定**: `X-SMTPAPI` ヘッダーまたは API パラメータの `categories` を使い、通知の種類ごとに統計を分けられるようにします。
