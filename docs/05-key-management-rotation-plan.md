# Key Management・Rotation計画

## 目的
JWT/JWKS署名鍵の生成、保管、公開、ローテーション、失効、復旧を本番運用可能な水準にする。

## 背景
IdPの署名鍵は最重要資産。鍵管理が曖昧だと、漏洩時の影響範囲、復旧手順、連携先の検証可否が不安定になる。

## 対象
- Signing key generation
- Key storage
- `kid`管理
- Active/previous/revoked key states
- JWKS publication
- Scheduled rotation
- Emergency rotation
- Key compromise runbook
- Token lifetimeとの整合

## 実装方針
- 鍵はDBまたはKMS参照で状態管理する。
- JWKSには検証に必要なprevious keyを保持する。
- 新規署名はactive keyのみで行う。
- emergency revoke時の既存token扱いを明文化する。
- KMS署名代行は将来拡張としてインターフェース化する。

## フェーズ
1. 現行KeyStoreの状態遷移を文書化する。
2. key table/state modelを確定する。
3. rotation schedulerと手動rotation API/CLIを実装する。
4. JWKSのprevious key公開期間をtoken TTLと連動させる。
5. emergency rotation runbookを作る。
6. conformance/contract testを追加する。

## 受け入れ条件
- `kid`付きtokenを検証できる。
- rotation後も旧tokenがTTL内で検証できる。
- emergency revoke手順がある。
- JWKS公開内容がテストされている。
- 鍵漏洩時の影響範囲を説明できる。

## 優先度
高。本番IdPの信頼性に直結する。
