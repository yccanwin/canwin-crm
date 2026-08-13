# WBS 2.3 第三方监理包模板

状态：Pending review。实施代理、内部复核代理和 Agent 0 不得预填 Supervisor PASS。

## A. 不可变引用

- repository / branch / PR：`Pending`
- implementation exact SHA / tree / remote tip：`Pending`
- push Quality run/job：`Pending`
- PR Quality run/job：`Pending`
- migration path / SHA-256：`Pending`
- 0035 / 0036 / 0037 SHA-256：`Pending`
- static / runtime / scale verifier SHA-256：`Pending`
- frontend contract / state / fixture SHA-256：`Pending`
- acceptance / Agent 1 / Agent 2 / Agent 3 records：`Pending`

所有引用必须绑定同一不可变树；mutable branch、最新一次 run 或本地未提交文件不能代替 exact SHA。

## B. Required supervisor checks

- [ ] 1. 唯一 CLI WBS 2.3 migration，且只新增 0035/0036/0037。
- [ ] 2. 六表、schema、FK、RESTRICT、索引与审计/version 字段精确符合冻结契约。
- [ ] 3. 五类型 typed slots 互斥，number 精度、false/0/clear 语义正确。
- [ ] 4. definition/option/manual value 生命周期、不变字段与物删保护正确。
- [ ] 5. option 归属、多选去重、inactive 历史保留且新值拒绝正确。
- [ ] 6. 三个 reserved definition 的 UUID、类型、来源、隐私、scope 与只读属性固定。
- [ ] 7. migration 未插入任何 derived current/history boolean。
- [ ] 8. fresh/unknown/stale 的 boolean/null/reason/version/time 组合被约束并直接测试。
- [ ] 9. allow_keyword_search 仅限安全 active manual text，GIN 与查询实时 catalog 校验可实现。
- [ ] 10. 所有公开表 ENABLE/FORCE RLS；私有 history 也 ENABLE/FORCE。
- [ ] 11. anon 零权限；authenticated 只读；service_role 对表和 sequence REVOKE ALL。
- [ ] 12. 实时 session/member/department 授权不读取 user_metadata，旧 JWT 与停用主体失权。
- [ ] 13. manual 数据跨部门共享；derived department 数据只投影当前主营部门。
- [ ] 14. private history append-only 且 UPDATE/DELETE/TRUNCATE 全部拒绝。
- [ ] 15. 模块未加入 Realtime publication，也未开放通用写/配置/计算 RPC。
- [ ] 16. 客户端 exact parser、unknown fail-safe、explicit clear、inactive history 与稳定排序正确。
- [ ] 17. 缓存绑定 auth/member/department/store/field/context version，旧响应不会跨上下文写入。
- [ ] 18. 360×800 七场景真实浏览器无横向溢出，fixture 未接生产 main。
- [ ] 19. runtime 达到冻结断言数/真实 session，真实撤销 auth.sessions 后旧 token 拒绝。
- [ ] 20. 10k/50/10/20、每类≥200、功能错误0、正确率100%、p95≤800、目标索引且无 spill。
- [ ] 21. contact/document/storage/department-private/secret/PII/audit canary 全链路命中 0。
- [ ] 22. Quality 拓扑精确，状态临时文件 0600、mask、cleanup、原始日志不回显。
- [ ] 23. Agent 1/2/3 均绑定 implementation SHA，P0/P1 与 findings 一致。
- [ ] 24. implementation 与每个证据尾均取得自身 exact-SHA push/PR Quality，review thread 无阻断。

## C. 脱敏计数

- WBS 2.3 / full pgTAP：`Pending`
- runtime assertions / real JWT sessions / stale-session cases：`Pending`
- frontend tests / assertions：`Pending`
- 360×800 scenarios / overflow findings：`Pending`
- scale dataset / samples / p95 / functional errors：`Pending`
- secret pattern counts：`Pending`
- PII / document-storage / forbidden-key / audit canary：`Pending`
- npm audit / lint / typecheck / test / build：`Pending`

## D. Traceability 与 findings

| Requirement group | Direct tests | Static/runtime/frontend/scale | Supervisor |
| --- | --- | --- | --- |
| Schema / lifecycle / indexes | `Pending` | `Pending` | `Pending` |
| RLS / ACL / real session | `Pending` | `Pending` | `Pending` |
| Reserved / derived three-state | `Pending` | `Pending` | `Pending` |
| Client / 360 / zero persistence | `Pending` | `Pending` | `Pending` |
| Scale / query plans | `Pending` | `Pending` | `Pending` |
| Scope / AC status / leaks | `Pending` | `Pending` | `Pending` |

- P0：`Pending`
- P1：`Pending`
- P2 owner / due：`Pending`

## E. Disposition 与后续治理

- supervisor identity / reviewed at UTC：`Pending`
- supervisor conclusion：`Pending`
- conditions / findings：`Pending`
- Agent 0 independent verification：`Pending`
- user protected merge authorization：`Pending`
- Squash merge / main Quality / 15-of-54：`Pending`

只有独立监理可以勾选 B 节、填写 Supervisor traceability 和 disposition。监理尾、Agent 0 尾
及其后任何状态修订都不得使用前一 SHA 的 CI 自证。
