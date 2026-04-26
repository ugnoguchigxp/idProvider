# Session Termination Runbook

最終更新: 2026-04-26  
対象: B2C Web/BFF/Mobile のlogout、端末紛失、乗っ取り疑い、退会

## 1. 目的
ログアウト後にlocal session、IdP session、refresh tokenのいずれかが残り、ユーザーが意図せず再ログインできる状態を防ぐ。

## 2. 用語
- local logout: BFF cookie、モバイルKeychain/Keystore等、アプリ側のログイン状態を削除する
- global logout: local logout後、IdPの `end_session_endpoint` へ遷移してIdP sessionを終了する
- all sessions revoke: サーバー側の `user_sessions` を全失効し、既存refresh tokenで復帰できないようにする

## 3. 標準手順
### 3.1 通常ログアウト
1. SDK `logout({ mode: "local" })` を呼ぶ
2. refresh/access tokenのrevokeを試行
3. revoke失敗時もlocal session/tokenを削除
4. ユーザーをログアウト後画面へ戻す

### 3.2 共有端末・完全ログアウト
1. SDK `logout({ mode: "global" })` を呼ぶ
2. local session/tokenを削除
3. 返却されたIdP logout URLへredirectまたは外部ブラウザで開く
4. 完了後、post logout redirect URIへ戻す

### 3.3 端末紛失・乗っ取り疑い
1. ユーザー本人確認を行う
2. `POST /v1/sessions/revoke-all` で全セッションを失効
3. パスワード変更またはMFA再設定を促す
4. `security_events` で異常ログイン、refresh token reuse、bot risk blockを確認

### 3.4 パスワード変更
1. 現在パスワードを検証
2. パスワード更新
3. 既存セッションを全失効
4. 呼び出し元はlocal cookie/tokenを削除して再ログインさせる

### 3.5 MFA再設定・recovery code再生成
1. パスワードまたはMFAで再認証
2. 旧recovery codeを失効
3. 新recovery codeを発行
4. 高リスク操作として全セッション失効を実行
5. 呼び出し元はlocal cookie/tokenを削除して再ログインさせる

### 3.6 退会
1. `DELETE /v1/account` で削除要求
2. サーバー側でユーザーを `deleted` にし、既存セッションを失効
3. BFF/Mobileはlocal session/tokenを削除
4. legal holdがある場合は物理削除せず保持する

## 4. 調査観点
- BFF cookieが削除されているか
- pending OIDC state cookieが削除されているか
- refresh tokenがrevocationまたはrevoke-allで無効化されているか
- IdP logout URLへ遷移したか
- `security_events` に `refresh_token.reuse_detected` が出ていないか

## 5. 禁止事項
- token本体をログに出さない
- revoke再試行のためにrefresh tokenを永続queueへ保存しない
- local logoutだけでIdP sessionも消えたと扱わない
- SCIMや管理画面運用と混ぜて原因調査しない
