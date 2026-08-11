# WBS 2.2 联系人敏感边界验收证据

状态：**技术门禁、Agent 1/2/3 复核、第三方监理与 Agent 0 对 supervisor tail 的独立核验 PASS；当前 Agent 0 文档尾自身双 CI、用户 protected merge、Squash merge 与 main Quality Pending。**

## 1. 审查目标

- Repository: `yccanwin/canwin-crm`
- Branch: `agent/wbs-2-2-contact-secrets`
- Pull request: [#14](https://github.com/yccanwin/canwin-crm/pull/14)
- Implementation SHA: `6a3f4d1105ccb8345d2ce751f593ffaafafd4b89`
- Implementation parent/base: `8d7401beaf82aaf725d30b6d30726d8b36a52a48`
- Changed files: **25**，均在 WBS 2.2 migration、pgTAP、联系人客户端、合成移动端夹具、verifier、CI 与文档范围内
- Migration: `supabase/migrations/20260810140605_wbs_2_2_contacts_sensitive.sql`
- Migration SHA-256: `B7E649B3438A5630A0CDA1974C94C80CD6F78F6527C8D147481A8E6241AAA93B`
- Supabase CLI: package、lock root、locked package 均为 `2.112.0`

本文件只记录不可变引用与脱敏计数，不包含 JWT、密钥、session 值、真实邮箱、
联系人姓名、联系方式、客户数据、原始响应或原始日志。

## 2. Exact-SHA Quality

| Trigger | Run | Job | Head | Steps | Result |
| --- | --- | --- | --- | --- | --- |
| push | [31405862026](https://github.com/yccanwin/canwin-crm/actions/runs/31405862026) | [93511915238](https://github.com/yccanwin/canwin-crm/actions/runs/31405862026/job/93511915238) | `6a3f4d1105ccb8345d2ce751f593ffaafafd4b89` | 25/25 | **PASS** |
| pull_request | [31405915945](https://github.com/yccanwin/canwin-crm/actions/runs/31405915945) | [93512096256](https://github.com/yccanwin/canwin-crm/actions/runs/31405915945/job/93512096256) | reviewed head `6a3f4d1105ccb8345d2ce751f593ffaafafd4b89` | 25/25 | **PASS** |

PR job 使用 GitHub merge-ref 运行，但日志明确绑定 reviewed head 与 base；本文不把
merge-ref 冒充 implementation SHA。

### Documentation-content tail Quality

- Documentation-content tail SHA: `c82a463d5219a1c90731095eb5d5d3f0175000bc`

| Trigger | Run | Job | Reviewed head | Steps | Result |
| --- | --- | --- | --- | --- | --- |
| push | [31407223281](https://github.com/yccanwin/canwin-crm/actions/runs/31407223281) | [93516386450](https://github.com/yccanwin/canwin-crm/actions/runs/31407223281/job/93516386450) | `c82a463d5219a1c90731095eb5d5d3f0175000bc` | 25/25 | **completed / success** |
| pull_request | [31407227201](https://github.com/yccanwin/canwin-crm/actions/runs/31407227201) | [93516398294](https://github.com/yccanwin/canwin-crm/actions/runs/31407227201/job/93516398294) | reviewed head `c82a463d5219a1c90731095eb5d5d3f0175000bc` | 25/25 | **completed / success** |

两份 documentation-content tail Quality 的脱敏结果与 implementation 证据一致：
full pgTAP **12/393**、WBS 2.2 **134**、contact runtime **249 assertions / 9
sessions / 1 stale-session case**、frontend **9/124**，私表、Realtime、未授权
canary、敏感键、审计 canary、secret pattern 与 PII 命中均为 **0**。

### Binding and supervisor tail Quality

| Stage | Exact SHA | Push run / job | PR run / job | Steps | Result |
| --- | --- | --- | --- | --- | --- |
| Binding tail | `3f25aed465b3aebf233caed9ef89917eaa48243b` | `31408141762 / 93519397021` | `31408146113 / 93519412069` | 25/25 | **completed / success** |
| Supervisor tail | `b54fb6e916b75c7def3988f86c86c70f960311e9` | `31449206958 / 93649855907` | `31449208829 / 93649860898` | 25/25 | **completed / success** |

PR #14 reviewed head 与远端 `agent/wbs-2-2-contact-secrets` tip 在 Agent 0 核验时均为
`b54fb6e916b75c7def3988f86c86c70f960311e9`。Supervisor tail 相对 binding tail
仅新增监理报告并更新监理包，属于 docs-only tail。监理完成 24/24 检查并给出
**PASS**，P0=0、P1=0；SUP-201 与 SUP-202 为不阻断的 P2。

## 3. 脱敏自动证据

- WBS 2.2 static verifier: **PASS**，唯一 migration、3 个 pgTAP suite、计划数 **134**。
- Full pgTAP: **12 files / 393 assertions PASS**。
- Contact real-JWT runtime: **249 assertions PASS**。
- Real JWT sessions: **9**；真实 session 撤销后旧 JWT `SESSION_INVALID`: **1**。
- Member/department revocation cases: **2**。
- Direct private rows / Realtime rows: **0 / 0**。
- Unauthorized canary / sensitive-key / audit-canary hits: **0 / 0 / 0**。
- Secret pattern counts: **[0,0,0,0]**；PII pattern count: **0**。
- Linux credential suppression: `raw_log_mode_0600=true`、`posix-verified`、原始日志已删除。
- Frontend: **9 files / 124 tests PASS**；lint、typecheck、build PASS。
- npm audit: **0 vulnerabilities**。
- Existing Auth runtime: **44 PASS**；observability runtime: **87 assertions / 16 workers PASS**。

## 4. 需求追踪

| 冻结要求 | 结果 | 直接证据 |
| --- | --- | --- |
| 结构与明文分表 | PASS | migration、0032、Agent 1 record |
| `contacts` 无部门/owner/claim/商机字段 | PASS | static verifier、migration catalog assertions |
| private secret 无直表/Realtime/Data API | PASS | 0033、runtime、Agent 1 record |
| 实时 session/member/department 授权 | PASS | 0034、249-assertion runtime |
| 真实 session 撤销后旧 JWT 失权 | PASS | runtime `stale_session_cases=1`、精确 `SESSION_INVALID` |
| 销售/经理默认 `NOT_CLAIMED` | PASS | 0034、真实 JWT runtime |
| super_admin 理由 1–500 Unicode 字符 | PASS | migration、adapter、pgTAP、Vitest |
| 拒绝信封完全省略敏感键 | PASS | 0034、strict frontend parser、runtime zero hits |
| 允许空数据与拒绝可区分 | PASS | pgTAP、panel empty state、Vitest |
| stale/superseded response 不写入内存 | PASS | contact state machine 与测试 |
| 无持久化、日志、analytics、错误监控泄漏 | PASS | static scan、Agent 2/3 records |
| 360×800 五态可用且无横向溢出 | PASS | 浏览器几何：body/document=360、panel=320、left=20、right=340 |
| 不接生产联系人路由 | PASS | `main.tsx` / `App.tsx` 无接线；路由归 WBS 2.5 |
| 不扩入写入/领取/商机/证件/OCR/AI/通知 | PASS | changed-file manifest、contract、Agent 1/2/3 records |

## 5. 内部复核

- [Agent 1 database/RLS review](agent1-final-review-2026-08-10.md): **PASS**, P0=0, P1=0。
- [Agent 2 client/mobile review](agent2-client-review-2026-08-10.md): **PASS**, P0=0, P1=0。
- [Agent 3 quality review](agent3-quality-review-2026-08-10.md): **PASS**, P0=0, P1=0。

## 6. 治理门状态

- Documentation-content tail `c82a463d5219a1c90731095eb5d5d3f0175000bc` push/PR Quality: **completed / success，25/25**。
- Binding tail `3f25aed465b3aebf233caed9ef89917eaa48243b` push/PR Quality: **completed / success，25/25**。
- Third-party supervisor disposition: **PASS，24/24，P0=0 / P1=0**。
- Supervisor tail `b54fb6e916b75c7def3988f86c86c70f960311e9` push/PR Quality: **completed / success，25/25**。
- Agent 0 independent verification against supervisor tail `b54fb6e916b75c7def3988f86c86c70f960311e9`: **PASS**。
- 当前 Agent 0 documentation-only tail 的 exact-SHA push/PR Quality: **Pending；本次新增文档与状态修订不能由 `b54fb6e9` 双 CI 自证**。
- User-authorized protected Squash merge: **Pending**。
- Resulting `main` Quality: **Pending**。
- Formal progress change 13/54 → 14/54: **Pending**。

当前 amendment 新增 Agent 0 记录，并同步更新 acceptance、supervisor report 与
third-party package。
它不属于已验证 supervisor tail `b54fb6e9`，不能由该尾双 CI 自证；必须形成新的
documentation-only exact SHA 并取得自身 push/PR Quality 后，才可请求用户授权
protected Squash merge。合并、main Quality 与正式进度在实际完成前继续保持 Pending。
