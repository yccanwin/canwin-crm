# WBS 2.3 第三方监理包

状态：`Pending review`。本包已装配 implementation 直接证据；当前五文档 documentation-content tail 及 binding amendment 尚未取得自身双 CI，第三方不得提前填写 Supervisor PASS。

## A. 不可变引用

- Repository / branch / PR：`yccanwin/canwin-crm` / `agent/wbs-2-3-dynamic-portraits` / [#15](https://github.com/yccanwin/canwin-crm/pull/15)
- Implementation exact SHA / tree / remote tip：`97581aaf8d9effaf0f764cbf1b16c20cb42b5f80` / `e76fc47b73a809c5cb2299d7e1779d40d014aceb` / `97581aaf8d9effaf0f764cbf1b16c20cb42b5f80`
- Push Quality：[31623499489](https://github.com/yccanwin/canwin-crm/actions/runs/31623499489) / [94203909787](https://github.com/yccanwin/canwin-crm/actions/runs/31623499489/job/94203909787)，completed / success / 27 of 27。
- PR Quality：[31623500862](https://github.com/yccanwin/canwin-crm/actions/runs/31623500862)；首次 job `94203915610` 的 Auth transport status-0 失败保留；同 exact SHA 一次 failed-job rerun [94205179524](https://github.com/yccanwin/canwin-crm/actions/runs/31623500862/job/94205179524) completed / success / 27 of 27。
- Migration：`supabase/migrations/20260811170803_wbs_2_3_dynamic_portraits.sql` / SHA-256 `a89c95192c2f0aa84584c70958718e5cb37a50606a552d0a700f150b744cd04b`。
- 0035 / 0036 / 0037 SHA-256：`fca25b9cd2d3c63ae16f9be287dc6b3999a119c559a1c5b398af46647182ca0c` / `2831c132b2ea8cd8614c18b23345af9f81d571687f850908070abfe94bceee12` / `bb6fb8fe955bd0c2f04c6dc265a249066f6875e14da4cdfe4526ee49d9f186d2`。
- Static / runtime / scale verifier SHA-256：`163fa9500bce6400fdc4aa8d5cfe54e0eb7c93e5537aa4b3f1fc4cd112897760` / `b2d5bd587abb5a07ec59274b50e557131a2b95899748b5fc14c27108a9d5d512` / `e87ad3ec502b6e63043e5c7edb3b361d13603a4db43a882365bbf3b6bfb69b93`。
- Frontend contract / state / golden SHA-256：`e39d80b66730db4e9c79c28c47da77c9b0935269a8681bf668b166be64506ef7` / `443748708a6f0685a74cab2b63cc765687a6aceafb23af88bce79e5162f85e2f` / `03dc8e34317153b0e46a9de7bd355b13fe25654842b79fe88de551c00a3699d0`。
- Mobile geometry evidence SHA-256：`90ac303e03c8e4b74fe5facb160abf7173e3dd85c8a5a173441983fbe120e648`。
- Acceptance / Agent 1 / Agent 2 / Agent 3 records：本目录五文档 content tail 内；tail SHA 与自身双 CI `Pending`。

## B. Required supervisor checks

- [ ] 1. 唯一 CLI WBS 2.3 migration，且只新增 0035/0036/0037。
- [ ] 2. 六表、schema、FK、RESTRICT、索引与 audit/version 字段符合冻结契约。
- [ ] 3. 五类型 typed slots 互斥，number 精度、false/0/clear 语义正确。
- [ ] 4. definition/option/manual value 生命周期、不变字段与物理删除保护正确。
- [ ] 5. option 归属、多选去重、inactive 历史保留且新值拒绝正确。
- [ ] 6. 三个 reserved definition 的 UUID、类型、来源、隐私、scope 与只读属性固定。
- [ ] 7. migration 未插入任何 derived current/history boolean。
- [ ] 8. fresh/unknown/stale 的 boolean/null/reason/version/time 组合被约束并直接测试。
- [ ] 9. allow_keyword_search 仅限安全 active manual text，GIN 与查询实时 catalog 校验可实现。
- [ ] 10. 所有公开画像表及 private history 均 ENABLE/FORCE RLS。
- [ ] 11. anon 零权限；authenticated 仅 exact RPC；service_role 对表/sequence REVOKE ALL。
- [ ] 12. 实时 session/member/department 授权不读取 user_metadata，旧 JWT 与停用主体失权。
- [ ] 13. manual 数据跨部门共享；derived department 数据只投影当前主营部门。
- [ ] 14. private history append-only，UPDATE/DELETE/TRUNCATE 均拒绝且零副作用。
- [ ] 15. 模块未加入 Realtime publication，也未开放通用写/配置/计算 RPC。
- [ ] 16. 客户端 exact parser、unknown fail-safe、explicit clear、inactive history 与稳定排序正确。
- [ ] 17. 缓存绑定 auth/member/department/store/field/context version，旧响应不会跨上下文写入。
- [ ] 18. 360×800 七场景真实浏览器无横向溢出，fixture 未接生产 main。
- [ ] 19. Runtime 达到冻结断言数/真实 session，真实撤销 auth.sessions 后旧 token 拒绝。
- [ ] 20. 10k/50/10/20、每类 200、功能错误 0、正确率 100%、p95<=800、目标索引且无 spill。
- [ ] 21. contact/document/storage/department-private/secret/PII/audit canary 全链路命中 0。
- [ ] 22. Quality 拓扑精确；状态临时文件 0600、mask、cleanup、原始日志不回显。
- [ ] 23. Agent 1/2/3 均绑定 implementation SHA，P0/P1 与 findings 一致。
- [ ] 24. Implementation 与每个证据尾均取得自身 exact-SHA push/PR Quality，review thread 无阻断。

## C. 脱敏计数索引

- WBS 2.3 / full pgTAP：`256 / 649`；计划 `70 / 90 / 96`。
- Portrait runtime：`902 assertions / 7 JWT / 1 stale-session / 1 derived-stale / 3 derived-unknown`。
- Frontend：`13 files / 255 tests`。
- 360×800：`7 scenarios / 0 overflow / 0 control-height failures / 0 sensitive fixtures`。
- Scale：`10k / 50 / >=10 / 20`；7 类各 200；功能/transport `0/0`；正确率 100%；最大实测 p95 `88.414ms`；目标 GIN true；spill 0。
- Secret patterns `[0,0,0,0]`；PII、document/storage、forbidden-key、audit canary 均 `0`。
- Auth `44`；contact runtime `249 / 9 / 1`；observability `87 / 16`；audit/lint/typecheck/test/build 均 PASS。

## D. Traceability 与 findings

| Requirement group | Direct tests | Static/runtime/frontend/scale | Supervisor |
| --- | --- | --- | --- |
| Schema / lifecycle / indexes | 0035=70, 0036=90 | static=PASS, scale target index=true | Pending |
| RLS / ACL / real session | 0037=96 | runtime 902/7/1 | Pending |
| Reserved / derived three-state | 0036/0037 | golden + runtime fresh/unknown/stale | Pending |
| Client / 360 / zero persistence | frontend 255 | 7 real-browser scenarios / leak 0 | Pending |
| Scale / query plans | exact 25 eligibility | 7x200, p95<=800, spill 0 | Pending |
| Scope / AC status / leaks | static allowlist | AC-08 Defined; canaries 0 | Pending |

- P0：`Pending supervisor disposition`
- P1：`Pending supervisor disposition`
- P2 owner / due：`Pending supervisor disposition`

## E. Disposition 与后续治理

- Supervisor identity / reviewed at UTC：`Pending`
- Supervisor conclusion / checks 1–24：`Pending`
- Five-document content-tail SHA and its push/PR Quality：`Pending`
- Binding-amendment SHA and its push/PR Quality：`Pending`
- Agent 0 independent verification：`Pending`
- User protected merge authorization：`Pending`
- Squash merge / main Quality / formal `15/54`：`Pending`

只有独立第三方监理可以勾选 B 节、填写 Supervisor traceability 与 disposition。任何 documentation tail、监理尾或 Agent 0 尾都不得使用前一 SHA 的 CI 自证。
