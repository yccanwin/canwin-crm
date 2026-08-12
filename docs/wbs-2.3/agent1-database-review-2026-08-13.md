# WBS 2.3 Agent 1 数据库与 RLS 独立复核

- 复核日期与时区：`2026-08-13`，Asia/Shanghai（UTC+8）
- 复核角色：Agent 1 — 数据库、RLS、ACL、会话与数据边界
- 仓库：`yccanwin/canwin-crm`
- 分支：`agent/wbs-2-3-dynamic-portraits`
- Pull request：[#15](https://github.com/yccanwin/canwin-crm/pull/15)
- implementation exact SHA：`97581aaf8d9effaf0f764cbf1b16c20cb42b5f80`
- Agent 1 disposition：**PASS**
- Open P0：**0**
- Open P1：**0**

本记录只绑定上述 implementation exact SHA。其原始内容已进入五文档 documentation-content
tail `a95ae51cb6f63e2d944e5fd8a2bd62ebf8b272b7`，并取得自身 push/PR Quality；当前回写该绑定
信息的 amendment 不在 content tail 内，仍须取得新的 exact-head push/PR Quality。

## Exact-SHA Quality 证据

| 触发方式 | Run | Job / attempt | Reviewed head | Steps | 结果 |
| --- | --- | --- | --- | --- | --- |
| Push | [31623499489](https://github.com/yccanwin/canwin-crm/actions/runs/31623499489) | [94203909787](https://github.com/yccanwin/canwin-crm/actions/runs/31623499489/job/94203909787) | `97581aaf8d9effaf0f764cbf1b16c20cb42b5f80` | 27/27 | **completed / success** |
| Pull request，首次 attempt | [31623500862](https://github.com/yccanwin/canwin-crm/actions/runs/31623500862) | [94203915610](https://github.com/yccanwin/canwin-crm/actions/runs/31623500862/job/94203915610) | PR #15 head `97581aaf8d9effaf0f764cbf1b16c20cb42b5f80` | 在 real Auth session 步骤中止 | **failed**：`create sa user failed (0)` transport failure |
| Pull request，failed-job rerun | [31623500862](https://github.com/yccanwin/canwin-crm/actions/runs/31623500862) | [94205179524](https://github.com/yccanwin/canwin-crm/actions/runs/31623500862/job/94205179524) | 同一 PR #15 exact head `97581aaf8d9effaf0f764cbf1b16c20cb42b5f80` | 27/27 | **completed / success** |

首次 PR attempt 的失败事实保留在证据链中，不被成功重跑覆盖。该 attempt 已完成
Supabase start 与全量 pgTAP，随后在创建合成 super-admin Auth 用户时返回 status `0`；
同一 run、同一 reviewed head 的 failed-job rerun 完成 27/27。结合相同 SHA 的 push job
同一步成功，本次复核将首次失败归类为 transport/runner transient，不归类为数据库、RLS
或 Auth 产品契约缺陷。

## 数据库模型与生命周期复核

1. **唯一迁移与六表范围 — PASS。** Exact tree 中只有
   `supabase/migrations/20260811170803_wbs_2_3_dynamic_portraits.sql` 一份 WBS 2.3
   migration。模型固定为五张 `public` 表：字段定义、选项、正式值、多选关联、派生当前态，
   以及一张 `app_private` 派生历史表。
2. **Reserved seed 与零正式派生数据 — PASS。** Migration 只预置
   `has_legal_person_id`、`has_business_license`、`documents_complete` 三个
   system-derived reserved definitions；未预置派生 current value 或 history row。
3. **类型与约束 — PASS。** Manual values 使用 text、single-select、multi-select、boolean、
   number 互斥 typed slots；number 保持精确 numeric。字段来源、隐私等级、上下文、状态、
   inactive actor、revision、freshness、reason code 与 system actor 均有数据库约束。
4. **关系、索引和不可变性 — PASS。** 外键采用 `ON DELETE RESTRICT`，关系列和冻结查询
   路径具备索引；store+field 仅允许一个 active manual value；全局/部门派生当前态分别唯一。
   定义、选项、正式 revision 和派生历史的身份/历史边界由 trigger 与 pgTAP 覆盖，物理
   DELETE/TRUNCATE 被拒绝，正式 revision 不可原地改值或恢复旧值。
5. **范围控制 — PASS。** 本实现没有加入 WBS 2.4 的配置/写入/CAS/clear 服务，没有加入
   WBS 2.5 的生产搜索页面，也没有加入 WBS 5.5 的权威证件计算、回填或派生激活路径。

## RLS、ACL、RPC、Realtime 与会话复核

1. **RLS/FORCE — PASS。** 六张表全部 `ENABLE ROW LEVEL SECURITY` 且
   `FORCE ROW LEVEL SECURITY`。公开结构读取依赖数据库中的实时有效 session、active member
   和 active primary department，不使用可编辑 `user_metadata` 作为授权依据。
2. **ACL 与 service role — PASS。** 表和 sequence 对 `public`、`anon`、`authenticated`、
   `service_role` 先执行 `REVOKE ALL`；客户端不具有 raw `SELECT *` 或写入路径。
   `service_role` 不获得本模块表/sequence 的直接读写权。
3. **只读 wire RPC — PASS。** 对外仅有两个 authenticated-only 只读投影：
   `public.read_portrait_catalog()` 与
   `public.read_store_derived_portraits(uuid)`。两者返回固定 schema v1 safe envelope；
   denied/invalid session fail closed，不提供定义、正式值或派生值 mutation RPC。
4. **Definer 与 helper — PASS。** 必要的 read projection/helper 使用空 `search_path`、全限定
   对象和显式 EXECUTE revoke/grant；窄化 read RPC 在函数体内重新取得 live member/department
   上下文，未接受调用者提供的权限字段。
5. **部门派生可见性 — PASS。** Manual catalog/value 为 live member 共享读取；
   `documents_complete` 仅投影当前主营部门上下文，其他部门值不进入响应。Fresh 才返回布尔；
   unknown/stale 均返回 `null`，stale 不泄露旧布尔值。
6. **Realtime — PASS。** 六张画像表均不在 `supabase_realtime` publication；migration 还对
   既有误加入状态执行防御性移除。

## pgTAP、Auth runtime 与性能证据

- `0035_wbs_2_3_portrait_schema.sql`：**70 PASS**。
- `0036_wbs_2_3_portrait_values.sql`：**90 PASS**。
- `0037_wbs_2_3_portrait_rls.sql`：**96 PASS**。
- WBS 2.3 subtotal：**256 assertions PASS**。
- Full database regression：**15 files / 649 assertions PASS**。
- Portrait real-JWT runtime：**902 assertions PASS / 7 real Auth sessions / 1 stale-session case**。
- Stale-session case 真实删除 `auth.sessions` 后复用旧 JWT，并被拒绝；disabled member、inactive
  department、forged metadata、anon、raw table/sequence 与 Realtime 负向边界均在 runtime/pgTAP
  中覆盖。
- Scale fixture：**10,000 stores / 50 active fields / 每店至少 10 values / 20 independent
  connections**。功能错误 **0**、transport errors **0**、结果正确率 **100%**、目标关键词 GIN
  使用成立、disk spill **0**；分页与关键词索引探针分别取证，未用 OFFSET 或优化器禁用开关
  伪造索引证据。

## 脱敏与零泄漏结论

CI 与 runtime/scale 输出只包含合成计数和安全阶段。复核证据显示 unauthorized canary、
forbidden portrait key、document/storage canary、audit canary、Realtime rows、secret patterns 与
PII findings 均为 **0**。本记录不包含 key、JWT、password、session value、真实邮箱、身份信息、
客户数据、画像文本、证件内容、原始响应、原始 EXPLAIN plan 或原始日志。

## 剩余治理门禁

- 五文档 content tail：`a95ae51cb6f63e2d944e5fd8a2bd62ebf8b272b7`；push `31624485420 / 94207241719`、PR `31624489749 / 94207256870`，均 **completed / success / 27 of 27**。
- 当前 binding amendment 的 exact-SHA push/PR Quality：**Pending**。
- 第三方监理复核与 disposition：**Pending**。
- Agent 0 独立终验：**Pending**。
- 用户授权的 protected Squash merge：**Pending**。
- 合并后的 `main` Quality：**Pending**。
- 正式进度推进至 **15/54**：**Pending**。

## Agent 1 结论

Agent 1 对 implementation exact SHA
`97581aaf8d9effaf0f764cbf1b16c20cb42b5f80` 的 WBS 2.3 数据模型、约束、索引、
RLS/FORCE、ACL、两个只读 RPC、Realtime 排除、live-session 授权、三态派生边界和数据库
回归给出 **PASS**。Agent 1 范围内 P0=0、P1=0。

本结论仅为 Agent 1 独立技术复核，不代表第三方监理 PASS，不代表 Agent 0 终验，不授权
protected merge，也不声明 WBS 2.3 或正式进度 15/54 已完成。
