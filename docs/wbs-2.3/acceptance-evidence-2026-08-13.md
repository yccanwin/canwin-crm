# WBS 2.3 验收证据

> 状态：implementation evidence 与五文档 documentation-content tail 已取得各自双 CI；正式验收仍 Pending。当前为回写 content-tail 绑定信息的 binding amendment，不能用 content-tail CI 自证本次 amendment。

## 1. 不可变版本与范围

- 生成日期 / 时区：`2026-08-13` / Asia/Shanghai
- Repository / branch / PR：`yccanwin/canwin-crm` / `agent/wbs-2-3-dynamic-portraits` / [#15](https://github.com/yccanwin/canwin-crm/pull/15)
- Implementation exact SHA / tree：`97581aaf8d9effaf0f764cbf1b16c20cb42b5f80` / `e76fc47b73a809c5cb2299d7e1779d40d014aceb`
- Remote branch tip：`97581aaf8d9effaf0f764cbf1b16c20cb42b5f80`
- Base：`main` at `3b698d939e313aa4fcc04ad42227c07be12a3dc6`
- Unique CLI migration：`supabase/migrations/20260811170803_wbs_2_3_dynamic_portraits.sql`
- Migration SHA-256：`a89c95192c2f0aa84584c70958718e5cb37a50606a552d0a700f150b744cd04b`
- PR changed files：28；均属于 WBS 2.3 migration/tests、portrait client/evidence、quality workflow/verifiers 与本项模板/合同范围；越界发现 0。

## 2. Implementation 双 Quality

| Trigger | Run / job | Exact head | Result |
| --- | --- | --- | --- |
| Push | [31623499489](https://github.com/yccanwin/canwin-crm/actions/runs/31623499489) / [94203909787](https://github.com/yccanwin/canwin-crm/actions/runs/31623499489/job/94203909787) | `97581aaf8d9effaf0f764cbf1b16c20cb42b5f80` | completed / success / 27 of 27 |
| Pull request | [31623500862](https://github.com/yccanwin/canwin-crm/actions/runs/31623500862) / rerun [94205179524](https://github.com/yccanwin/canwin-crm/actions/runs/31623500862/job/94205179524) | reviewed head `97581aaf8d9effaf0f764cbf1b16c20cb42b5f80` in PR merge-ref semantics | completed / success / 27 of 27 |

PR run `31623500862` 的首次 job `94203915610` 在第一条 Auth Admin 请求发生无 HTTP 状态的 transport 失败（安全摘要：`create sa user failed (0)`），后续步骤被跳过。该失败被保留；同 SHA、同 workflow 仅重跑 failed job 一次后 27/27 成功。同 SHA push job 的 Auth 44、全部 runtime、scale 和前端门也全部成功，因此没有把可复现功能失败用重跑掩盖。

## 3. Static、pgTAP 与数据库边界

- `npm run verify:portraits`：PASS；唯一 migration；0035/0036/0037 exact plan `70 / 90 / 96`，小计 `256`。
- Full pgTAP：`15 files / 649 tests`，全部成功；既有 Auth、observability、WBS 2.1、WBS 2.2 回归均通过。
- 六张画像表、三项固定 reserved system-derived definitions、typed slots、revision/history、FK/RESTRICT、生命周期和目标索引均由结构测试直接覆盖。
- 公开六表与 private history 均 `ENABLE + FORCE RLS`；客户端无 raw table SELECT；authenticated 仅可执行两个 exact 只读 RPC：`read_portrait_catalog()` 与 `read_store_derived_portraits(uuid)`。
- anon / service_role / PUBLIC 对画像表、sequence 与 RPC 的未授权路径均拒绝；画像表未加入 Realtime publication。
- Runtime：`902 assertions / 7 real JWT sessions / 1 stale-session case`；真实删除 `auth.sessions` 后旧 token 返回 `SESSION_INVALID`。
- Runtime 安全计数：Realtime `0`、unauthorized `0`、document/storage `0`、forbidden portrait keys `0`、audit canary `0`、secret patterns `[0,0,0,0]`、PII `0`。

## 4. Wire、客户端与 360×800

- Shared wire golden SHA-256：`03dc8e34317153b0e46a9de7bd355b13fe25654842b79fe88de551c00a3699d0`。
- Catalog/derived envelope 使用 public UUID、exact keys、类型化 constraints、稳定 options、server capability 与 context version；raw internal IDs 不进入 wire。
- 五类型、canonical decimal string、`set`/`clear` 判别联合、false/0 不等于 clear、unknown fail closed、inactive history、fresh/unknown/stale 三态与 `is_unknown` 均有前端直接测试。
- 内存缓存键绑定 auth user/member/primary department/store/field/context version；generation 不匹配的旧响应丢弃；无 local/session storage、IndexedDB、Cache API、Service Worker、analytics、error monitoring 或 console sink。
- Vitest：`13 files / 255 tests`；lint、typecheck、test、build 均为独立成功步骤。
- 真实 Chromium 360×800：7 场景，document/body `360`、panel `320`（left 20 / right 340），横向溢出失败 `0`，44px 控件失败 `0`，敏感 fixture `0`；证据 SHA-256 `90ac303e03c8e4b74fe5facb160abf7173e3dd85c8a5a173441983fbe120e648`。
- Evidence fixture 未接入生产 `main.tsx`；WBS 2.3 不冒充正式画像 UI。

## 5. Scale benchmark

- PostgreSQL `17.6`；fixture 绑定实际 public tables/indexes（`LIKE ... INCLUDING ALL`）与 migration/source-index hashes。
- `10,000 stores / 50 enabled fields / each store >=10 values / 20 concurrent connections`。
- 7 query classes，每类 `200` 样本且先预热；功能错误 `0`、transport 错误 `0`、正确率 `100%`。
- p95（ms）：single `26.010`、multi `12.215`、boolean `44.995`、number `56.571`、combined AND `88.414`、stable page `0.877`、derived three-state `29.352`；全部 `<=800ms`。
- Safe keyword eligibility exact result `25`；目标 GIN 命中 `true`；disk spill `0`；泄漏扫描和 scanner self-test 均通过。
- 本项只证明 WBS 2.3 模型的必要性能条件；AC-08 仍为 `Defined`，不得提前标记 Passed。

## 6. 回归与治理状态

- Auth runtime：`44 assertions`；contact runtime：`249 / 9 sessions / 1 stale`；observability runtime：`87 / 16 workers`。
- Dependency audit：0 high vulnerabilities；credential failure path：secret 未暴露、状态日志 `0600`、cleanup 完成。
- Agent 1 / Agent 2 / Agent 3：各自独立记录已进入同一五文档 content tail，结论均为 PASS，P0/P1 均为 0。
- 五文档 documentation-content tail SHA：`a95ae51cb6f63e2d944e5fd8a2bd62ebf8b272b7`。
- Content-tail Push Quality：[31624485420](https://github.com/yccanwin/canwin-crm/actions/runs/31624485420) / [94207241719](https://github.com/yccanwin/canwin-crm/actions/runs/31624485420/job/94207241719)，completed / success / 27 of 27。
- Content-tail PR Quality：[31624489749](https://github.com/yccanwin/canwin-crm/actions/runs/31624489749) / [94207256870](https://github.com/yccanwin/canwin-crm/actions/runs/31624489749/job/94207256870)，reviewed head `a95ae51cb6f63e2d944e5fd8a2bd62ebf8b272b7` / completed / success / 27 of 27。
- Binding amendment SHA / 双 CI：`Pending`。
- 第三方监理：`Pending`。
- Agent 0：`Pending`。
- 用户 protected Squash 授权 / Squash merge / main Quality / 正式 `15/54`：`Pending`。

新增证据文档不得使用前一 SHA 自证。原五文档内容已由 content tail `a95ae51cb6f63e2d944e5fd8a2bd62ebf8b272b7` 的双 CI 证明；本次回写不在该 tree 内，须形成新的 binding-amendment SHA 并取得自身双 CI。监理尾与 Agent 0 尾之后仍须分别取得自身 exact-SHA push/PR Quality。
