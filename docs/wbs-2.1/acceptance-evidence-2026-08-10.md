# WBS 2.1 验收证据（2026-08-10）

状态：技术门与 Agent 1/2/3 内部独立复核通过；第三方监理、Agent 0、合并和 main Quality 待完成。

## 目标绑定

- Repository：`yccanwin/canwin-crm`
- Branch：`agent/wbs-2-1-account-store`
- PR：[#13](https://github.com/yccanwin/canwin-crm/pull/13)（Draft）
- Remote implementation SHA：`6e2caedf75140b18022a645bfb13c2582fc00376`
- Implementation tree：`f03c7b562e65dcbffa5cfafe3e9a4eada63a7291`
- Local HEAD：`e64c125506411fe91619a3f86a0aa5885dd9991c`；tree 与远端 implementation tree 完全一致
- Migration：`supabase/migrations/20260810110505_wbs_2_1_account_store_model.sql`
- Migration SHA-256：`231F2BC4774EAA95124D7F9DEA991A3AB9589E5852358EA3AFD748CA97EA5EDB`
- Evidence date / timezone：2026-08-10 / Asia/Shanghai
- Environment：GitHub-hosted Ubuntu 24.04、PostgreSQL 17、本地 Supabase CLI `2.112.0`

## 需求追踪

| 要求 | 内部结果 | 直接证据 |
|---|---|---|
| 全局 `accounts`/`stores`，不含 `department_id` | PASS | migration；0030；static verifier |
| 一个客户主体可有多个门店 | PASS | `stores.account_id` FK + 非唯一索引；0030 |
| 名称不因普通重复而自动唯一合并 | PASS | 仅 `public_id` 唯一；contract-and-scope |
| 名称、地址、状态和版本约束 | PASS | migration checks；0030 负向用例 |
| 非活动状态必须有非空安全原因 | PASS | 显式 `status_reason is not null`；0030 tests 33/35 |
| 创建/更新审计字段与不可变身份 | PASS | member FKs、touch/protect triggers；0030 |
| RLS ENABLE + FORCE | PASS | migration；0030/0031 catalogs |
| `public`/`anon` 零权限 | PASS | explicit REVOKE；0031 |
| authenticated 仅 active 实时成员共享读取 | PASS | select policies 调用 `current_member_id()`；0031 跨部门正向 |
| 成员或主营部门停用后旧 JWT 失权 | PASS | 0031 disabled/inactive fixtures |
| authenticated/service_role 直接写拒绝 | PASS | least grants、无写 policy；0031 零副作用 |
| 授权不读取 user metadata | PASS | 0031 catalog assertion；既有 Auth gate |
| 不扩入 2.2–2.6 或大项 4 | PASS | contract scope；PR changed-files review |

## 自动化证据

| 证据 | 结果 |
|---|---|
| `npm run verify:shared-archive` | PASS；73 planned assertions |
| 全量 pgTAP | PASS；9 files / 259 tests |
| Real Auth runtime | PASS；44 assertions |
| Observability runtime | PASS；87 assertions / 16 workers；secret pattern `[0,0,0,0]`；PII `0` |
| Frontend Vitest | PASS；5 files / 60 tests |
| lint / typecheck / build | PASS |
| npm audit | PASS；0 vulnerabilities |
| Linux credential suppression | PASS；`raw_log_mode_0600=true`、`posix-verified`、raw log removed |

## Exact-SHA Quality

| Event | Run / job | Head SHA | Result |
|---|---|---|---|
| push | `31384084754 / 93440502381` | `6e2caedf75140b18022a645bfb13c2582fc00376` | completed / success；所有 steps success |
| pull_request | `31384091661 / 93440524033` | `6e2caedf75140b18022a645bfb13c2582fc00376` | completed / success；所有 steps success |

首次两轮失败证据保留为整改链：run `31383556241` 暴露 pgTAP API 兼容问题；run `31383818779` 暴露 PostgreSQL CHECK 的 NULL 语义。两项均在后续提交中修复并由以上 exact-SHA 双绿关闭。

## 内部独立复核

- Agent 1 数据库/RLS：PASS；P0=0，P1=0；`agent1-final-review-2026-08-10.md`
- Agent 2 产品/客户端边界：PASS；P0=0，P1=0；`agent2-client-review-2026-08-10.md`
- Agent 3 质量证据：PASS；P0=0，P1=0；`agent3-quality-review-2026-08-10.md`

## 当前治理门

- 第三方监理：Pending
- Agent 0：Pending
- 用户 protected merge 授权：Pending
- Squash merge / main Quality：Pending

本文件若进入后续 documentation/evidence tail，不能自引用证明该 tail；必须对 then-current tail SHA 再取得 push/PR Quality。
