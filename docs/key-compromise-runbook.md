# Key Compromise Runbook

最終更新: 2026-04-26

## 1. Trigger
- 署名鍵素材の漏洩疑い
- 不審な `kid` で署名されたtokenの検知
- インフラ侵害が疑われる場合

## 2. Initial Response (15分以内)
1. 当番がSEV判定を実施（原則SEV1）。
2. 影響範囲（issuer、client群、有効token）を把握する。
3. incident channel を作成し、Security Owner / Backend Owner / SRE を招集する。

## 3. Containment
1. `POST /v1/admin/keys/rotate-emergency` を実行して新active keyへ切替。
2. 旧active key が `revoked` 状態であることを確認。
3. `/.well-known/jwks.json` から旧鍵が除外されたことを確認。
4. 必要に応じて refresh token revoke-all を並行実施。

## 4. Verification
- `GET /v1/admin/keys` で `state=active` が1つであること。
- 新規発行tokenの `kid` が新activeと一致すること。
- 外部クライアントの検証失敗率を監視し、異常増加がないこと。

## 5. Communication
- 影響範囲があるクライアントへ通知（テンプレート配布）。
- 監査向けに次を記録:
  - 発生時刻
  - 実行者
  - 新旧 `kid`
  - 影響範囲
  - 復旧完了時刻

## 6. Recovery Exit Criteria
- 監視指標が平常化
- 監査ログ (`key.rotation.emergency`) を確認
- 再発防止タスクをissue化

## 7. Postmortem
- root cause
- 検知時間/封じ込め時間
- 追加対策（鍵保管、権限、監視ルール）
