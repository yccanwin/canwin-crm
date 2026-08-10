# WBS 2.1 第三方监理包（2026-08-10）

状态：内部技术门、Agent 1/2/3、第三方监理与 Agent 0 独立核验均 PASS；待 Agent 0 证据尾 exact-SHA 双 CI、用户 protected merge 授权、Squash merge 与 main Quality。

## Review target

- Repository：`yccanwin/canwin-crm`
- Branch：`agent/wbs-2-1-account-store`
- PR：[#13](https://github.com/yccanwin/canwin-crm/pull/13)
- Implementation SHA：`6e2caedf75140b18022a645bfb13c2582fc00376`
- Implementation tree：`f03c7b562e65dcbffa5cfafe3e9a4eada63a7291`
- Migration SHA-256：`231F2BC4774EAA95124D7F9DEA991A3AB9589E5852358EA3AFD748CA97EA5EDB`
- Push Quality：`31384084754 / 93440502381` — success
- PR Quality：`31384091661 / 93440524033` — success
- Acceptance record：`docs/wbs-2.1/acceptance-evidence-2026-08-10.md`
- Agent 1 review：`docs/wbs-2.1/agent1-final-review-2026-08-10.md` — PASS
- Agent 2 review：`docs/wbs-2.1/agent2-client-review-2026-08-10.md` — PASS
- Agent 3 review：`docs/wbs-2.1/agent3-quality-review-2026-08-10.md` — PASS
- Documentation-content tail SHA：`3a1b2a6e2fe3effa60bbda9704b3b364758ce7e8`
- Content-tail push Quality：`31385131609 / 93443747930` — completed / success
- Content-tail PR Quality：`31385134713 / 93443757681` — completed / success
- Evidence-binding amendment SHA / exact-tail Quality：`5e6a6e7333dc99c06043103f6aa6494a8e1df948` — push `31385611770 / 93445220185` + PR `31385615804 / 93445233553` — completed / success
- Supervisor-tail SHA：`2ae36ca9c93cebcab2e8098c8021e55f4297abf8`
- Supervisor-tail push Quality：`31394276754 / 93473226037` — completed / success；23/23 steps success
- Supervisor-tail PR Quality：`31394282223 / 93473244243` — completed / success；23/23 steps success

## Traceability

| 范围 | 内部结果 | 证据 | 监理结果 |
|---|---|---|---|
| 全局 accounts/stores、无部门复制 | PASS | migration、0030、contract | PASS |
| 一主体多门店、FK/索引 | PASS | migration、0030 | PASS |
| 状态/NULL/名称/地址/版本约束 | PASS | migration、0030 | PASS |
| 审计字段与不可变身份 | PASS | triggers、0030 | PASS |
| RLS/FORCE/最小 GRANT | PASS | migration、0030/0031 | PASS |
| 跨部门共享读取 | PASS | 0031 | PASS |
| stale member/department JWT 失权 | PASS | 0031 | PASS |
| 直接写拒绝和零副作用 | PASS | 0031 | PASS |
| 静态/全量 CI/无泄露 | PASS | exact-SHA双CI与脱敏计数 | PASS |
| WBS 2.1 范围边界 | PASS | contract、PR diff | PASS |

## Required supervisor checks

- [x] `accounts`、`stores` 是全局共享表且没有 `department_id`。
- [x] 一个主体允许多个门店，门店 FK 删除策略为 RESTRICT。
- [x] 所有 WBS 2.1 外键列均有索引。
- [x] 名称没有被普通唯一约束自动当作同一主体。
- [x] `public_id` 在各自表内唯一。
- [x] 非活动状态显式拒绝 NULL/空白原因。
- [x] 名称、地址、版本约束 fail closed。
- [x] created/updated actor 与 timestamp/version 字段完整。
- [x] 主键、public_id、创建者、创建时间不可变。
- [x] 门店不能直接移动到另一主体，主体/门店不能直接删除。
- [x] 两表 ENABLE RLS + FORCE RLS。
- [x] `public`/`anon` 零表权限。
- [x] authenticated 只有 SELECT，没有写 GRANT 或写 policy。
- [x] service_role 只有 SELECT，无写权限和新 identity sequence 权限。
- [x] 权威 active member + active primary department 是唯一读取门。
- [x] 不同部门读取同一全局行，不复制档案。
- [x] disabled member 与 inactive department 的旧 JWT 均读取 0 行。
- [x] forged user metadata 不能改变授权。
- [x] authenticated/service_role 写入失败且行数不变。
- [x] 73 条新增 pgTAP、259 条全量 pgTAP 均执行，而非只做静态扫描。
- [x] Auth 44、observability 87/16、frontend 60、audit 0 均保持回归通过。
- [x] Linux credential probe 为 0600/posix verified，secret/PII 计数为 0。
- [x] PR diff 未引入 contacts、portraits、mutation RPC、UI、duplicate governance 或 opportunities。
- [x] exact evidence-tail 的 push/PR Quality 全绿，且无开放 P0/P1。

## Internal findings

- 首次 CI：命名 CHECK 使用了当前 pgTAP 不支持的四参数 helper；已改为 `pg_constraint` 目录断言并关闭。
- 第二次 CI：CHECK 对 NULL 结果通过；已在非活动分支显式要求 `status_reason IS NOT NULL` 并由静态门锁定。
- 当前开放 P0：None。
- Agent 1 / Agent 2 / Agent 3：PASS。
- 当前开放 P1：None。

## Supervisor findings

完整记录见 `docs/wbs-2.1/supervisor-review-2026-08-10.md`。

| ID | Severity | Description | Owner | Due | Retest SHA/evidence | Status |
|---|---|---|---|---|---|---|
| SUP-001 | P2 | 静态 verifier 未精确锁定 CI DB test step 完整文本 | Agent 1（Agent 0 跟踪） | WBS 2.4 验收前 | N/A（非阻断） | Open |
| SUP-002 | P2 | 部分索引检查仅验证名称，未扩展为完整列序断言 | Agent 1（Agent 0 跟踪） | WBS 2.4 验收前 | N/A（非阻断） | Open |

- Open P0：None
- Open P1：None
- Open P2：2（SUP-001, SUP-002），均不阻断 PASS

## Supervisor disposition

- Reviewer / organization：WorkBuddy Supervisor（独立第三方监理）
- Reviewed full SHA：`5e6a6e7333dc99c06043103f6aa6494a8e1df948`
- Review completed at：2026-08-10T21:27:41+08:00（Asia/Shanghai；监理报告本地创建时间）
- Decision：**PASS**
- Blocking findings：None
- Non-blocking findings：2 P2（SUP-001, SUP-002），移交 WBS 2.4 跟进
- Signature or immutable review reference：supervisor-tail `2ae36ca9c93cebcab2e8098c8021e55f4297abf8`；push `31394276754 / 93473226037` 与 PR `31394282223 / 93473244243` 均 completed / success

## Agent 0 independent verification

**PASS**。Agent 0 于 2026-08-10T21:48:04+08:00 独立核验：

- SHA 链 `6e2caedf` → `3a1b2a6e` → `5e6a6e73` → `2ae36ca9` 完整；supervisor tail 仅包含两份 WBS 2.1 监理文档。
- PR #13 head 与远端 `agent/wbs-2-1-account-store` tip 均为 supervisor-tail SHA。
- supervisor-tail push/PR Quality 均 completed / success，23/23 steps success；脱敏计数为 pgTAP 259、Auth 44、observability 87/16、frontend 60、audit 0、Linux 0600/posix、secret `[0,0,0,0]`、PII 0。
- 监理 24/24 PASS；开放 P0=0、P1=0；SUP-001 与 SUP-002 为非阻断 P2，责任人为 Agent 1、Agent 0 跟踪，WBS 2.4 验收前关闭。
- 无 CHANGES_REQUESTED、无提前合并或 WBS 完成声明。

完整记录见 `docs/wbs-2.1/agent0-final-verification-2026-08-10.md`。当前 Agent 0 证据尾不可自引用；须取得其自身 exact-SHA push/PR Quality 后，才可请求用户 protected merge 授权。Squash merge 与 main Quality 在实际完成前仍为 Pending。
