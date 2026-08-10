# WBS 2.1 第三方监理报告（2026-08-10）

## Supervisor disposition

- Reviewer / organization：WorkBuddy Supervisor（独立第三方监理）
- Reviewed full SHA：`5e6a6e7333dc99c06043103f6aa6494a8e1df948`（evidence-binding amendment tail）
- Implementation SHA：`6e2caedf75140b18022a645bfb13c2582fc00376`
- Implementation tree：`f03c7b562e65dcbffa5cfafe3e9a4eada63a7291`
- Migration SHA-256：`231F2BC4774EAA95124D7F9DEA991A3AB9589E5852358EA3AFD748CA97EA5EDB`（本地与远端 SHA `5e6a6e73` tree 精确一致）
- Review completed at：2026-08-10T21:27:41+08:00（Asia/Shanghai；本文件本地创建时间）
- Decision：**PASS**
- Blocking findings：None
- Non-blocking findings：2（P2，不阻断 PASS）
- Signature or immutable review reference：Pending；本文件入库后填写 supervisor-tail 完整 SHA，并对该 SHA 取得 exact-SHA push/PR Quality

## Exact-SHA Quality（审查目标 `5e6a6e73`）

| Event | Run / job | Head SHA | Result |
|---|---|---|---|
| push | `31385611770 / 93445220185` | `5e6a6e7333dc99c06043103f6aa6494a8e1df948` | completed / success；23/23 steps success |
| pull_request | `31385615804 / 93445233553` | `5e6a6e7333dc99c06043103f6aa6494a8e1df948` | completed / success；23/23 steps success |

CI steps 全量列表（两个 run 一致）：

1. Set up job — success
2. Check out repository — success
3. Set up Node.js — success
4. Install locked dependencies — success
5. Audit high-severity dependencies — success
6. Verify scaffold — success
7. Verify environment contract — success
8. Verify Supabase baseline — success
9. Verify Auth and membership contract — success
10. Verify observability contract — success
11. **Verify shared archive contract** — success
12. **Verify credential-safe CI failure path** — success
13. Start local Supabase — success
14. **Test database policies and Auth contract** — success
15. **Verify real Auth sessions** — success
16. **Verify audit, event, and observability runtime** — success
17. Lint — success
18. Typecheck — success
19. Test — success
20. Build — success
21-23. Post actions — success

## Supervisor checks

### 1. `accounts`、`stores` 是全局共享表且没有 `department_id`

**PASS。** Migration `20260810110505_wbs_2_1_account_store_model.sql` 创建 `public.accounts`（14 列）和 `public.stores`（15 列），均无 `department_id` 列。pgTAP 0030:7 断言 `department_id` 列数为 0。静态 verifier `verify-shared-archive-contract.mjs:37` 使用 1800 字符窗口禁止 `department_id` 出现在 `CREATE TABLE` 体内。契约 `contract-and-scope.md:13` 明确禁止部门嵌入。

### 2. 一个主体允许多个门店，门店 FK 删除策略为 RESTRICT

**PASS。** `stores.account_id bigint not null references public.accounts(id) on delete restrict`（migration:42-43）。无 `account_id` 唯一约束，允许一主体多门店。pgTAP 0030:22 断言 FK `confdeltype='r'`。静态 verifier:36 验证 `on delete restrict` 文本。

### 3. 所有 WBS 2.1 外键列均有索引

**PASS。** 5 个 FK 列：`accounts.created_by_member_id`、`accounts.updated_by_member_id`、`stores.account_id`、`stores.created_by_member_id`、`stores.updated_by_member_id`。9 个索引全部存在（migration:87-112）。pgTAP 0030:24 断言无未索引 FK 列（count=0）。

### 4. 名称没有被普通唯一约束自动当作同一主体

**PASS。** 仅 `public_id` 有 `UNIQUE` 约束（`accounts_public_id_unique`、`stores_public_id_unique`）。`name` 和 `name_normalized` 均无唯一约束。契约:33 明确"名称不设唯一约束，重复候选留给 WBS 2.6 人工治理"。

### 5. `public_id` 在各自表内唯一

**PASS。** Migration:18,59 定义 `unique (public_id)`。pgTAP 0030:13-14 使用 `col_is_unique` 断言。

### 6. 非活动状态显式拒绝 NULL/空白原因

**PASS。** `accounts_status_state_check`（migration:26-35）和 `stores_status_state_check`（migration:74-83）显式要求 `status_reason IS NOT NULL` 且 `char_length(btrim(status_reason)) between 1 and 500`。pgTAP 0030:47-49 验证 disabled/inactive 无原因被拒绝、active 带原因被拒绝。静态 verifier:39-40 锁定非空原因文本。

### 7. 名称、地址、版本约束 fail closed

**PASS。** `accounts_name_check`（1-200 字符，无控制字符）、`stores_name_check`（同上）、`stores_address_check`（NULL 允许，非空则 1-500 字符）、`accounts_version_check`（>0）、`stores_version_check`（>0）。pgTAP 0030:45-46,50 验证空白名称、控制字符名称、空白地址均被拒绝。

### 8. created/updated actor 与 timestamp/version 字段完整

**PASS。** 两表均有 `created_by_member_id`（FK members）、`updated_by_member_id`（FK members）、`created_at`（default now()）、`updated_at`（default now()）、`version`（default 1）。pgTAP 0030:23 断言 4 个 member FK；0030:28-29 断言 timestamp 和 version 默认值。`touch_updated_at` 触发器维护 `updated_at`（0030:30 验证 version 递增）。

### 9. 主键、public_id、创建者、创建时间不可变

**PASS。** `protect_account_identity()`（migration:114-135）检查 `id`、`public_id`、`created_by_member_id`、`created_at` 不可变。`protect_store_identity()`（migration:137-159）同理。pgTAP 0030:52,56 验证 `public_id` 和 `created_by_member_id` 修改被拒绝。触发器函数为 `security invoker` + `set search_path = ''`（0030:32-33 验证）。

### 10. 门店不能直接移动到另一主体，主体/门店不能直接删除

**PASS。** `protect_store_identity()` 额外检查 `account_id` 不可变（migration:150）。两表 DELETE 均抛 `23503`（migration:122,145）。pgTAP 0030:51,53,57 验证删除被阻止、`account_id` 移动被拒绝。

### 11. 两表 ENABLE RLS + FORCE RLS

**PASS。** Migration:177-180。pgTAP 0030:6 断言 `pg_class.relrowsecurity` 和 `relforcerowsecurity` 均为 true（count=2）。

### 12. `public`/`anon` 零表权限

**PASS。** `REVOKE all ON TABLE ... FROM public, anon, authenticated, service_role`（migration:194-195）。pgTAP 0031:16 断言 anon 授权数为 0。

### 13. authenticated 只有 SELECT，没有写 GRANT 或写 policy

**PASS。** `GRANT SELECT ON TABLE ... TO authenticated, service_role`（migration:199-200）。pgTAP 0031:17-18 断言 authenticated 只有 SELECT（count=2），无非 SELECT 权限（count=0）。pgTAP 0031:22-23 断言只有 2 条 SELECT policy，无写 policy。

### 14. service_role 只有 SELECT，无写权限和新 identity sequence 权限

**PASS。** pgTAP 0031:19-20 断言 service_role 只有 SELECT，无非 SELECT 权限。pgTAP 0031:21 断言 anon/authenticated/service_role 对 `accounts_id_seq`/`stores_id_seq` 无 USAGE 权限。pgTAP 0031:63-64 断言 service_role 无 sequence USAGE。`REVOKE all ON SEQUENCE ... FROM public, anon, authenticated, service_role`（migration:196-197）。

### 15. 权威 active member + active primary department 是唯一读取门

**PASS。** RLS policy `accounts_shared_archive_select` 和 `stores_shared_archive_select`（migration:182-192）均 `using ((select app_private.current_member_id()) is not null)`。pgTAP 0031:27-28 验证 active member + active department 可读全部共享行。

### 16. 不同部门读取同一全局行，不复制档案

**PASS。** pgTAP 0031:27-33 验证 department A（sales）和 department B（manager）读取同一 2 条 accounts 和 2 条 stores。表结构无部门字段，物理上无复制可能。

### 17. disabled member 与 inactive department 的旧 JWT 均读取 0 行

**PASS。** pgTAP 0031:42-43 验证 disabled member 旧 JWT 读取 0 accounts/stores。pgTAP 0031:47-48 验证 inactive department 成员旧 JWT 读取 0 accounts/stores。

### 18. forged user metadata 不能改变授权

**PASS。** pgTAP 0031:36-38 验证伪造 `user_metadata` 含 `role: super_admin` 和 `primary_department_id: 2112` 仍读取同一 2 行。pgTAP 0031:69 断言 `public`/`app_private` 中无函数 prosrc 包含 `user_metadata` 或 `raw_user_meta_data`（count=0）。

### 19. authenticated/service_role 写入失败且行数不变

**PASS。** pgTAP 0031:53-56 验证 authenticated INSERT/UPDATE/DELETE 均抛 `42501`。pgTAP 0031:60-62 验证 service_role INSERT/UPDATE/DELETE 均抛 `42501`。pgTAP 0031:67-68 断言被拒写入后行数不变（accounts=2, stores=2）。

### 20. 73 条新增 pgTAP、259 条全量 pgTAP 均执行，而非只做静态扫描

**PASS。** CI step 14 "Test database policies and Auth contract" 对本地 Supabase 执行全量 `supabase test db --local`，9 个文件计划数总计：3+20+14+17+48+41+43+42+31 = 259。WBS 2.1 新增：0030(42) + 0031(31) = 73。CI step 11 "Verify shared archive contract" 是静态门，step 14 是运行时执行门，两者独立。

### 21. Auth 44、observability 87/16、frontend 60、audit 0 均保持回归通过

**PASS。** CI step 15 "Verify real Auth sessions" — success（44 assertions）。CI step 16 "Verify audit, event, and observability runtime" — success（87 assertions / 16 workers）。CI step 19 "Test" — success（Vitest 5 files / 60 tests）。CI step 5 "Audit high-severity dependencies" — success（0 vulnerabilities）。所有步骤在审查目标 SHA 的 push 和 PR 两个 run 中均为 success。

### 22. Linux credential probe 为 0600/posix verified，secret/PII 计数为 0

**PASS。** CI step 12 "Verify credential-safe CI failure path" — success。验收证据记录 `raw_log_mode_0600=true`、`posix-verified`、raw log removed、secret `[0,0,0,0]`、PII `0`。

### 23. PR diff 未引入 contacts、portraits、mutation RPC、UI、duplicate governance 或 opportunities

**PASS。** PR #13 共 15 个变更文件：

| 文件 | 类型 | 范围 |
|---|---|---|
| `.github/workflows/quality.yml` | modified +3 | 新增 verify:shared-archive step |
| `docs/wbs-2.1/*.md` (8 files) | added | WBS 2.1 文档 |
| `package.json` | modified +2/-1 | 新增 verify:shared-archive script，接入 check |
| `scripts/verify-shared-archive-contract.mjs` | added | 静态契约验证器 |
| `supabase/migrations/20260810110505_wbs_2_1_account_store_model.sql` | added +210 | 迁移 |
| `supabase/tests/0030_wbs_2_1_account_store_schema.sql` | added +60 | schema 测试 |
| `supabase/tests/0031_wbs_2_1_shared_archive_rls.sql` | added +73 | RLS 测试 |
| `supabase/tests/README.md` | modified +6 | 测试说明 |

无 contacts/portraits/mutation RPC/UI/duplicate governance/opportunities 相关文件。

### 24. exact evidence-tail 的 push/PR Quality 全绿，且无开放 P0/P1

**PASS。** 审查目标 SHA `5e6a6e7333dc99c06043103f6aa6494a8e1df948` 的 push Quality `31385611770` 和 PR Quality `31385615804` 均 completed/success，23/23 steps success。内部 Agent 1/2/3 均 PASS，P0=0，P1=0。本次监理确认 P0=0，P1=0。

## 证据链完整性

| 阶段 | SHA | push Quality | PR Quality | 状态 |
|---|---|---|---|---|
| Implementation | `6e2caedf75140b18022a645bfb13c2582fc00376` | `31384084754 / 93440502381` | `31384091661 / 93440524033` | 双绿 |
| Content tail | `3a1b2a6e2fe3effa60bbda9704b3b364758ce7e8` | `31385131609 / 93443747930` | `31385134713 / 93443757681` | 双绿 |
| Binding tail (review target) | `5e6a6e7333dc99c06043103f6aa6494a8e1df948` | `31385611770 / 93445220185` | `31385615804 / 93445233553` | 双绿 |

Migration SHA-256 在三个 SHA 中一致：`231F2BC4774EAA95124D7F9DEA991A3AB9589E5852358EA3AFD748CA97EA5EDB`（已在 `5e6a6e73` tree 中独立验证）。

Binding tail 相对 implementation SHA 的 diff 为纯文档新增（5 文件 / 279 行），无代码变更。

## Supervisor findings

| ID | Severity | Description | Owner | Due | Retest SHA/evidence | Status |
|---|---|---|---|---|---|---|
| SUP-001 | P2 | 静态 verifier `verify-shared-archive-contract.mjs` 对 DB test step 的校验仅检查文件名和计划数，未精确锁定 CI workflow 中 "Test database policies" step 的完整文本；当前依赖人工核验列序正确。建议后续让 static gate 精确锁定 DB test step 文本。 | Agent 1（Agent 0 跟踪） | WBS 2.4 验收前 | N/A（非阻断） | Open |
| SUP-002 | P2 | 部分索引检查（如 `stores_account_status_idx`）在 pgTAP 中仅验证索引名称存在，未扩展为完整列序断言。当前 exact migration 的列序已人工核验正确，但未来 migration 变更可能未被自动捕获。建议后续扩展 pgTAP 为 `pg_get_indexdef` 完整比较。 | Agent 1（Agent 0 跟踪） | WBS 2.4 验收前 | N/A（非阻断） | Open |

- Open P0：None
- Open P1：None
- Open P2：2（SUP-001, SUP-002），均不阻断 PASS

## Agent 0 独立验证状态

Pending。本次监理结论作为纯文档尾入库后，需记录 implementation SHA、content-tail SHA、binding-tail SHA（`5e6a6e73`）、supervisor-tail SHA，并对 supervisor tail 重新取得 exact-SHA push/PR Quality。用户 protected merge 授权、Squash merge 和 main Quality 在实际完成前均保持 Pending。

## 结论

**PASS。**

WBS 2.1 共享客户主体与门店数据模型在审查目标 SHA `5e6a6e7333dc99c06043103f6aa6494a8e1df948` 处满足全部 24 项监理检查。无开放 P0/P1。2 个 P2 非阻断建议移交 WBS 2.4 跟进。exact-SHA 双 CI 全绿，证据链三段（implementation → content-tail → binding-tail）均有独立 CI 验证。Migration SHA-256 精确匹配。PR diff 范围与契约一致，未越界。
