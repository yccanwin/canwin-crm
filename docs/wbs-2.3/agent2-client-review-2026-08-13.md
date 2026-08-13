# WBS 2.3 Agent 2 客户端与移动端独立复核

结论：**PASS**。Open P0：**0**；Open P1：**0**。本结论仅覆盖所绑定 implementation SHA 的客户端 wire、状态与缓存边界、独立移动证据，以及数据库只读 RPC 到客户端 exact parser 的一致性；第三方监理、Agent 0、protected merge、Squash merge、main Quality 与项目进度 **15/54** 均保持 **Pending**。

## 证据绑定

- 日期 / 时区：2026-08-13 / Asia/Shanghai
- Reviewer role：Agent 2（客户端、移动端与跨层 wire 边界）
- Repository / PR：`yccanwin/canwin-crm` / [#15](https://github.com/yccanwin/canwin-crm/pull/15)
- Reviewed implementation SHA：`97581aaf8d9effaf0f764cbf1b16c20cb42b5f80`
- Push Quality：[run 31623499489](https://github.com/yccanwin/canwin-crm/actions/runs/31623499489) / [job 94203909787](https://github.com/yccanwin/canwin-crm/actions/runs/31623499489/job/94203909787) — exact head / completed / success / 27 of 27 steps
- PR Quality 首次 job（历史失败，保留）：[run 31623500862](https://github.com/yccanwin/canwin-crm/actions/runs/31623500862) / [job 94203915610](https://github.com/yccanwin/canwin-crm/actions/runs/31623500862/job/94203915610) — reviewed head 为上述 exact SHA；Auth runtime 创建合成 SA 用户时返回 status 0 transport failure，后续步骤因前置失败跳过
- PR Quality exact-SHA failed-job rerun：[run 31623500862](https://github.com/yccanwin/canwin-crm/actions/runs/31623500862) / [job 94205179524](https://github.com/yccanwin/canwin-crm/actions/runs/31623500862/job/94205179524) — 同一 reviewed head / completed / success / 27 of 27 steps
- CI 前端回归独立计数：13 test files / 255 tests — PASS；不是本记录自行声明的未执行计数
- 真实浏览器移动证据：`docs/wbs-2.3/mobile-geometry-evidence-2026-08-12.json`
- 移动证据 SHA-256：`90ac303e03c8e4b74fe5facb160abf7173e3dd85c8a5a173441983fbe120e648`

首次 PR job 的 transport 失败不被 rerun 结果覆盖或改写。Push 与 PR rerun 均绑定同一 implementation SHA；Agent 2 仅据此确认实现树已取得相应 Quality 证据，不把一次 PR rerun 成功扩张为第三方监理、Agent 0、合并或 main Quality。

## 客户端与 wire 独立核验

- 共享 synthetic golden 与 schema v1 exact parser 对 catalog envelope、derived envelope、字段、选项、约束、capabilities 和嵌套值逐键核验；多余键、畸形值、未知 envelope version 与不允许的联合分支均 fail closed。
- 数据库只读 RPC `read_portrait_catalog` 与 `read_store_derived_portraits` 的实际 JSON 形状和客户端 wire golden / exact parser 一致；runtime 使用实际 RPC 响应逐公开 ID、上下文版本、状态和值进行核验，未建立客户端自造的宽松兼容层。
- 人工画像固定支持 `text`、`single_select`、`multi_select`、`boolean`、`number` 五种判别类型。number 使用 canonical decimal string，不把数据库 numeric 降格为 JavaScript 浮点数。
- mutation 仅接受显式 `{op:'set',value}` 或 `{op:'clear'}`；空字符串、空数组、`false` 与 canonical decimal `"0"` 均不等于 clear。unsupported、inactive 与未知输入保持只读或 fail-closed 边界。
- 固定三项 system-derived 字段只允许其冻结 key；reserved / active 生命周期与 RPC 实际状态一致，capabilities 保持不可人工 set / clear。派生值严格映射为 `is_true`、`is_false`、`is_unknown` 三态；unknown / stale 不回显旧布尔值，并保留稳定 reason 与 context version。
- cache identity 包含 auth user、member、当前主营部门、store、field 的 public UUID 及 context version。auth / member / department / context 切换先清缓存并递增 generation；旧 generation 或上下文不匹配的响应不得回写。
- wire、状态和 evidence 代码未使用 local/session storage、IndexedDB、Cache API、Service Worker、日志、错误监控或 analytics 持久化/发送画像数据。
- 独立 evidence fixture 未接入生产 `main.tsx`；WBS 2.3 没有冒充完成 WBS 2.5 的生产移动画像、搜索、筛选、分页或正式路由。

## 360×800 真实浏览器证据

- 证据由 Chromium CDP / Google Chrome 真实浏览器在 360×800 viewport 执行，不以 jsdom 代替几何验收。
- 七个合成场景为 `types`、`clear`、`unsupported`、`inactive-history`、`derived`、`department-switch`、`error`。
- 每个场景 `document_width=360`、`body_width=360`、`panel_left=20`、`panel_right=340`、`panel_width=320`、`horizontal_overflow=0`。
- 汇总：7 scenarios，all passed，horizontal overflow failures 0，control height failures 0，sensitive fixture count 0。
- 证据只含合成场景名、浏览器/viewport 元数据、几何计数与哈希，不含联系人、证件、真实客户、JWT、密钥、原始 RPC 响应或 provider/database 错误正文。

## Findings 与治理状态

- Agent 2 disposition：**PASS**
- Open P0：**0**
- Open P1：**0**
- 必须客户端整改项：none
- 第三方监理：Pending
- Agent 0 独立核验：Pending
- 用户 protected merge 授权：Pending
- Squash merge：Pending
- main Quality：Pending
- WBS 2.3 正式完成与项目进度 15/54：Pending

本记录是 implementation SHA `97581aaf8d9effaf0f764cbf1b16c20cb42b5f80` 的 Agent 2 独立证据尾。其原始内容已进入五文档 content tail `a95ae51cb6f63e2d944e5fd8a2bd62ebf8b272b7`；push `31624485420 / 94207241719`、PR `31624489749 / 94207256870` 均 completed / success / 27 of 27。当前回写属于其后的 binding amendment，不能由 content-tail CI 自证，须取得新的 exact-SHA 双 CI。本文只包含合成数据、脱敏计数和不可变引用。
