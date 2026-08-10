# WBS 2.2 第三方监理包模板

状态：Pending review。本文不是监理 PASS，不得由实施代理代写监理结论。

## A. 不可变引用

- reviewed exact commit SHA: `Pending`
- branch/PR: `Pending`
- push Quality run/job: `Pending`
- PR Quality run/job: `Pending`
- tree/changed-file manifest: `Pending`
- migration filename and SHA-256: `Pending`
- pgTAP 0032/0033/0034 SHA-256: `Pending`
- static/runtime verifier SHA-256: `Pending`

所有引用必须指向同一 exact SHA。mutable branch、最新一次 run 或本地未提交文件
不能替代不可变引用。

## B. 独立复核清单

1. 仅一份 Supabase CLI WBS 2.2 迁移，且无影子领取/商机/owner 表。
2. `public.contacts` 只有冻结结构字段；姓名和五类联系方式仅位于
   `app_private.contact_secrets`。
3. 两表 ENABLE/FORCE RLS；private 表对 PUBLIC/anon/authenticated/
   service_role 无直读直写、视图、序列和 Realtime。
4. SECURITY DEFINER 位于 private schema、空 search_path、默认 EXECUTE
   已撤销；权限取自实时 session/member/department，不信任 JWT metadata。
5. 普通销售和经理默认 `NOT_CLAIMED`；super_admin 必须提交安全理由；允许与
   拒绝均有脱敏审计。
6. 无权响应完全省略敏感键；授权空联系方式与拒绝状态可区分。
7. 0032/0033/0034 连续、唯一，每项不少于 24 个断言且全回归通过。
8. local-only 真实 JWT 覆盖 anon/A1/A2/MA/B1/SA/disabled/inactive/forged，
   并实际撤销一条已登录 session 后复用旧 JWT 得到 `SESSION_INVALID`；未授权
   canary、private table、Realtime、audit 泄漏均为零。
9. 前端严格白名单解析、畸形 fail closed、权限状态变化先清内存，且无持久化、
   分析、错误监控、日志和截图泄漏；360×800 的锁定、理由、加载、允许空态、
   稳定错误态无横向溢出。
10. push 与 PR 的 Quality 均绑定 exact SHA，static/runtime 为独立成功步骤，
    原始 Supabase 状态和凭据日志未回显。

## C. 脱敏计数

- pgTAP WBS 2.2 / full: `Pending`
- runtime assertions: `Pending`
- unauthorized canary hits: `Pending`
- sensitive-key hits: `Pending`
- direct private-table/Realtime hits: `Pending`
- audit canary hits: `Pending`
- secret pattern counts: `Pending`
- PII pattern count: `Pending`
- frontend tests / full tests: `Pending`
- real stale-session cases: `Pending`
- 360×800 viewport scenarios / overflow findings: `Pending`

## D. 风险与问题

- P0: `Pending`
- P1: `Pending`
- P2（必须含 owner 与 due date）: `Pending`
- AC-02: `Defined`；本包不改变其状态。
- 后续 WBS 4.2 capability 接入风险: `Pending`

## E. 独立结论

- supervisor reviewer identity/reference: `Pending`
- reviewed at (UTC): `Pending`
- conclusion: `Pending`
- conditions/findings: `Pending`
- Agent 0 final acceptance: `Pending`
- merge/main Quality: `Pending`

只有独立监理可填写本节结论；实施代理、质量代理和 Agent 0 均不得预填监理
PASS。
