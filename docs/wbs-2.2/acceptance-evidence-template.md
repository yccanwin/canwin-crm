# WBS 2.2 验收证据模板

> 模板状态：Pending。填写者不得把未执行项目写成 PASS，也不得粘贴原始日志、
> JWT、密钥、真实邮箱、客户数据、姓名或联系方式。

## 1. 版本与范围

- evidence generated at (UTC): `Pending`
- branch: `Pending`
- exact commit SHA: `Pending`
- migration: `Pending`（应唯一匹配 `*_wbs_2_2_contacts_sensitive.sql`）
- changed-file allowlist result: `Pending`
- out-of-scope changes: `Pending`

## 2. 静态契约

- `npm run verify:contacts`: `Pending`
- unique migration count: `Pending`（期望 1）
- exact pgTAP suite count: `Pending`（期望 3）
- planned assertions: `Pending`（必须精确为 0032=53、0033=35、0034=46，总数 134）
- public/private field-boundary findings: `Pending`（期望 0）
- RLS/FORCE/ACL/Realtime findings: `Pending`（期望 0）
- SECURITY DEFINER/search_path/revoke findings: `Pending`（期望 0）
- shadow claim/owner/opportunity findings: `Pending`（期望 0）
- frontend persistence/telemetry findings: `Pending`（期望 0）
- package/CI wiring findings: `Pending`（期望 0）

## 3. pgTAP 与回归

- full pgTAP result: `Pending`
- WBS 2.2 subtotal: `Pending`
- `0032_wbs_2_2_contacts_schema.sql`: `Pending`
- `0033_wbs_2_2_contacts_acl.sql`: `Pending`
- `0034_wbs_2_2_contact_read_rpc.sql`: `Pending`
- earlier WBS regression result: `Pending`

## 4. local-only Real-JWT runtime

- `npm run verify:contacts:runtime`: `Pending`
- runtime assertions: `Pending`（底线 70）
- real JWT sessions: `Pending`
- anon cases: `Pending`
- authorized cases: `Pending`
- denied cases: `Pending`
- member/department revocation cases: `Pending`
- real session revocation with old JWT (`SESSION_INVALID`): `Pending`
- disabled/inactive/forged cases: `Pending`
- unauthorized canary hits: `Pending`（期望 0，非零即 P0）
- unauthorized sensitive-key hits: `Pending`（期望 0，非零即 P0）
- direct private-table/Realtime hits: `Pending`（期望 0，非零即 P0）
- audit canary hits: `Pending`（期望 0，非零即 P0）
- secret pattern counts: `Pending`（期望 `[0,0,0,0]`）
- PII pattern count: `Pending`（期望 0）

## 5. 前端与 CI

- contact frontend tests: `Pending`
- malformed/unknown response fail-closed: `Pending`
- memory clearing transitions: `Pending`
- stale/superseded access response rejection: `Pending`
- sensitive persistence/analytics/log scan: `Pending`
- 360×800 locked/reason/loading/empty/error viewport evidence: `Pending`
- 360px body/document horizontal overflow: `Pending`（期望 0）
- push Quality run/job URL + exact SHA: `Pending`
- PR Quality run/job URL + exact SHA: `Pending`
- all required steps success: `Pending`
- sanitized log/evidence scan: `Pending`

## 6. 缺陷与结论边界

- open P0: `Pending`
- open P1: `Pending`
- P2 items with owner/due date: `Pending`
- Agent 0 final acceptance: `Pending`
- third-party supervisor conclusion: `Pending`
- merge/main Quality: `Pending`
- AC-02 status: `Defined`（本项只附部分证据）

证据包只能记录可复查的计数、exact SHA、run/job URL 和脱敏失败代码；任何
原始响应或敏感值必须留在短生命周期本地内存并在进程退出时销毁。
