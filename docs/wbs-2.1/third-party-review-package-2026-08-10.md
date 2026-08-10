# WBS 2.1 第三方监理包（2026-08-10）

状态：内部技术门与 Agent 1/2/3 独立复核通过；待 evidence-tail 双 CI 后交第三方监理。

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
- Evidence-binding amendment SHA / exact-tail Quality：Pending

## Traceability

| 范围 | 内部结果 | 证据 | 监理结果 |
|---|---|---|---|
| 全局 accounts/stores、无部门复制 | PASS | migration、0030、contract | Pending |
| 一主体多门店、FK/索引 | PASS | migration、0030 | Pending |
| 状态/NULL/名称/地址/版本约束 | PASS | migration、0030 | Pending |
| 审计字段与不可变身份 | PASS | triggers、0030 | Pending |
| RLS/FORCE/最小 GRANT | PASS | migration、0030/0031 | Pending |
| 跨部门共享读取 | PASS | 0031 | Pending |
| stale member/department JWT 失权 | PASS | 0031 | Pending |
| 直接写拒绝和零副作用 | PASS | 0031 | Pending |
| 静态/全量 CI/无泄露 | PASS | exact-SHA双CI与脱敏计数 | Pending |
| WBS 2.1 范围边界 | PASS | contract、PR diff | Pending |

## Required supervisor checks

- [ ] `accounts`、`stores` 是全局共享表且没有 `department_id`。
- [ ] 一个主体允许多个门店，门店 FK 删除策略为 RESTRICT。
- [ ] 所有 WBS 2.1 外键列均有索引。
- [ ] 名称没有被普通唯一约束自动当作同一主体。
- [ ] `public_id` 在各自表内唯一。
- [ ] 非活动状态显式拒绝 NULL/空白原因。
- [ ] 名称、地址、版本约束 fail closed。
- [ ] created/updated actor 与 timestamp/version 字段完整。
- [ ] 主键、public_id、创建者、创建时间不可变。
- [ ] 门店不能直接移动到另一主体，主体/门店不能直接删除。
- [ ] 两表 ENABLE RLS + FORCE RLS。
- [ ] `public`/`anon` 零表权限。
- [ ] authenticated 只有 SELECT，没有写 GRANT 或写 policy。
- [ ] service_role 只有 SELECT，无写权限和新 identity sequence 权限。
- [ ] 权威 active member + active primary department 是唯一读取门。
- [ ] 不同部门读取同一全局行，不复制档案。
- [ ] disabled member 与 inactive department 的旧 JWT 均读取 0 行。
- [ ] forged user metadata 不能改变授权。
- [ ] authenticated/service_role 写入失败且行数不变。
- [ ] 73 条新增 pgTAP、259 条全量 pgTAP 均执行，而非只做静态扫描。
- [ ] Auth 44、observability 87/16、frontend 60、audit 0 均保持回归通过。
- [ ] Linux credential probe 为 0600/posix verified，secret/PII 计数为 0。
- [ ] PR diff 未引入 contacts、portraits、mutation RPC、UI、duplicate governance 或 opportunities。
- [ ] exact evidence-tail 的 push/PR Quality 全绿，且无开放 P0/P1。

## Internal findings

- 首次 CI：命名 CHECK 使用了当前 pgTAP 不支持的四参数 helper；已改为 `pg_constraint` 目录断言并关闭。
- 第二次 CI：CHECK 对 NULL 结果通过；已在非活动分支显式要求 `status_reason IS NOT NULL` 并由静态门锁定。
- 当前开放 P0：None。
- Agent 1 / Agent 2 / Agent 3：PASS。
- 当前开放 P1：None。

## Supervisor findings

Pending。需记录 ID、severity、owner、due、retest SHA/evidence 和 status；任一开放 P0/P1 阻断 PASS。

## Supervisor disposition

- Reviewer / organization：Pending
- Reviewed full SHA：Pending
- Date / timezone：Pending
- Decision：Pending（PASS / FAIL / CONDITIONAL）
- Blocking / non-blocking findings：Pending
- Signature or immutable review reference：Pending

## Agent 0 independent verification

Pending。documentation-content tail 已由 exact-SHA 双绿验证；本次 binding amendment 修改全部五份证据文档，不能自引用 content-tail CI。只有 amendment 新尾取得自己的 push/PR Quality 后才可交监理。若监理结论作为纯文档尾入库，必须记录 implementation SHA、content-tail SHA、binding-tail SHA、supervisor-tail SHA，并对 supervisor tail 重新取得 exact-SHA push/PR Quality。用户授权、Squash merge 和 main Quality 在实际完成前均保持 Pending。
