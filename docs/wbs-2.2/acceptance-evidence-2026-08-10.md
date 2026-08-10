# WBS 2.2 联系人敏感边界验收证据

状态：**技术门禁与 Agent 1/2/3 复核 PASS；第三方监理、Agent 0、合并与 main Quality Pending。**

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

## 6. 未完成治理门

- Documentation/evidence tail exact-SHA push Quality: **Pending**。
- Documentation/evidence tail exact-SHA PR Quality: **Pending**。
- Third-party supervisor disposition: **Pending**。
- Agent 0 independent verification: **Pending**。
- User-authorized protected Squash merge: **Pending**。
- Resulting `main` Quality: **Pending**。
- Formal progress change 13/54 → 14/54: **Pending**。

当前新增的验收与 Agent 记录改变了 implementation SHA 之后的文档内容，不能用
implementation 双 CI 自证。必须先形成 documentation-only tail 并取得该 tail 自身的
push/PR Quality，再交第三方监理。
