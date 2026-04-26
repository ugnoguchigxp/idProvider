# Risk Register（IdP Security）

最終更新: 2026-04-26

| Risk ID | Threat | Affected Flow | Likelihood | Impact | Score | Priority | Owner | Due Date | Status | Residual Risk |
|---|---|---|---:|---:|---:|---|---|---|---|---|
| R-001 | Refresh token replay/reuse検知不足 | `/v1/token/refresh`, `/oauth/token` | 4 | 5 | 20 | P1 | Backend Lead | 2026-05-02 | Closed | 検知後の短時間悪用は残る |
| R-002 | Login失敗イベント未整備でstuffing検知が遅い | `/v1/login` | 4 | 4 | 16 | P1 | Security Lead | 2026-05-02 | Closed | 分散低速攻撃の見逃し |
| R-003 | Admin config更新のsecurity event未整備 | `/v1/admin/configs*` | 3 | 5 | 15 | P1 | Backend Lead | 2026-05-03 | Closed | 正当権限悪用は残る |
| R-004 | Google identity mislink監視不足 | `/v1/login/google`, `/v1/identities/google/link` | 3 | 5 | 15 | P1 | Backend B | 2026-05-06 | Closed | 外部IdP侵害時の連鎖 |
| R-005 | Account enumeration（応答差分） | login/reset/verify | 3 | 4 | 12 | P2 | Backend A | 2026-05-08 | Closed | 閾値未満探索 |
| R-006 | WebAuthn challenge replay対策検証不足 | `/v1/mfa/webauthn/*` | 2 | 5 | 10 | P2 | Backend B | 2026-05-08 | Closed | 実装依存の残余 |
| R-007 | RBAC/entitlement更新遅延による権限過剰 | `/v1/authorization/check`, `/v1/entitlements/check` | 2 | 4 | 8 | P2 | Backend Lead | 2026-05-09 | Closed | キャッシュ/整合性遅延 |
| R-008 | 監査ログ改ざん検知未導入 | `audit_logs`, `security_events` | 2 | 5 | 10 | P2 | Security Lead | 2026-05-10 | Mitigated | hash chain検知導入済み。外部不変ストア未導入の残余は継続 |
| R-009 | OIDC/OAuth endpoint DoS耐性不足 | discovery/jwks/token | 3 | 3 | 9 | P2 | SRE | 2026-05-10 | Closed | 大規模分散DoSはインフラ対策依存 |
| R-010 | Incident手順が属人化 | 全体 | 3 | 3 | 9 | P2 | SRE | 2026-05-08 | Closed | 定期訓練を継続要 |
| R-011 | Restore rehearsal未整備でRTO超過 | DB障害 / migration失敗 | 2 | 5 | 10 | P2 | SRE | 2026-05-20 | Mitigated | 定期drill未実施時の運用劣化 |

## ステータス定義
- Open: 未着手
- In Progress: 実装中
- Mitigated: 対策完了（残余リスクのみ）
- Accepted: 残余リスク受容
- Closed: 当計画スコープでの対策完了
