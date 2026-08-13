# WBS 2.3 验收证据模板

> 模板状态：Pending。不得把未执行项目写成 PASS，不得粘贴 JWT、密钥、真实身份、客户数据、
> 画像文本、证件内容、原始响应或原始日志。

## 1. 不可变版本与范围

- generated at UTC：`Pending`
- branch / PR：`Pending`
- reviewed exact SHA / tree：`Pending`
- remote branch tip：`Pending`
- unique CLI migration：`Pending`
- migration SHA-256：`Pending`
- changed-file allowlist / out-of-scope findings：`Pending`

## 2. Static contract

- `npm run verify:portraits`：`Pending`
- unique migration / exact suite count：`Pending`
- 0035 / 0036 / 0037 exact plan：`Pending`
- six-table / reserved-definition findings：`Pending`
- typed-slot / lifecycle / index / FK findings：`Pending`
- RLS / FORCE / ACL / Realtime findings：`Pending`
- private history / helper / search_path findings：`Pending`
- forbidden portrait / document / contact / department-key findings：`Pending`
- package / workflow topology findings：`Pending`

## 3. pgTAP 与全量回归

- `0035_wbs_2_3_portrait_schema.sql`：`Pending`
- `0036_wbs_2_3_portrait_values.sql`：`Pending`
- `0037_wbs_2_3_portrait_rls.sql`：`Pending`
- WBS 2.3 subtotal：`Pending`
- full pgTAP file / assertion count：`Pending`
- earlier WBS regression：`Pending`

## 4. Real-JWT runtime

- `npm run verify:portraits:runtime`：`Pending`
- runtime assertions / real JWT sessions：`Pending`
- anon / allowed / denied cases：`Pending`
- real session revocation + old JWT：`Pending`
- member / department revocation：`Pending`
- derived unknown / fresh / stale cases：`Pending`
- direct table / sequence / Realtime findings：`Pending`
- unauthorized / forbidden-key / audit canary hits：`Pending`（期望 0）
- secret pattern `[0,0,0,0]` / PII / document-storage hits：`Pending`（期望 0）

## 5. Client 与 360×800

- portrait frontend files / tests / assertions：`Pending`
- five value types / canonical decimal / explicit clear：`Pending`
- unsupported / inactive history：`Pending`
- derived three-state / filter buckets：`Pending`
- context-bound cache / stale-response rejection：`Pending`
- persistence / telemetry / log findings：`Pending`（期望 0）
- production `main.tsx` wiring findings：`Pending`（期望 0）
- real-browser 360×800 scenarios / overflow：`Pending`

## 6. Scale benchmark

- environment / seed hash：`Pending`
- stores / fields / minimum values / connections：`Pending`
- query classes / samples per class：`Pending`
- functional errors / correctness：`Pending`
- p50 / p95 / maximum p95：`Pending`
- intended indexes / disk spill：`Pending`
- AC-08 status：`Defined`（本项不得提前写 Passed）

## 7. Quality、缺陷与治理

- push Quality run/job + exact SHA：`Pending`
- PR Quality run/job + reviewed head：`Pending`
- authored / GitHub step counts：`Pending`
- all steps success：`Pending`
- Agent 1 / Agent 2 / Agent 3：`Pending`
- open P0 / P1 / P2 owner+due：`Pending`
- third-party supervisor：`Pending`
- Agent 0：`Pending`
- protected Squash / main Quality / formal progress：`Pending`

新增证据文档不得用前一 SHA 自证；每个 documentation-only tail 必须取得自身 exact-SHA
push/PR Quality 后才能进入下一治理门。
