# WBS 2.1 验收证据模板

状态：Pending。此模板不代表测试已执行或验收已通过。

## 目标绑定

- Repository / branch / PR：Pending
- Implementation SHA：Pending
- Migration：`supabase/migrations/20260810110505_wbs_2_1_account_store_model.sql`
- Migration SHA-256：Pending
- Review time / timezone：Pending / Asia/Shanghai

## 需求追踪

| 要求 | 结果 | 直接证据 |
|---|---|---|
| 全局 accounts/stores，不含 department_id | Pending | Pending |
| 一主体多门店及 FK/索引 | Pending | Pending |
| 状态、名称、地址、版本约束 | Pending | Pending |
| 创建/更新审计字段与不可变身份 | Pending | Pending |
| RLS ENABLE+FORCE 与最小 GRANT | Pending | Pending |
| active 成员跨部门共享读取 | Pending | Pending |
| 成员/主营部门停用后旧 JWT 失权 | Pending | Pending |
| authenticated/service_role 直接写拒绝 | Pending | Pending |
| 无 user_metadata 授权 | Pending | Pending |
| 不扩入 2.2–2.6/大项4 | Pending | Pending |

## 自动化证据

- `npm run verify:shared-archive`：Pending
- `npx supabase db reset --local --yes`：Pending
- `npx supabase test db --local`：Pending
- `npm run check`：Pending
- exact-SHA push Quality：Pending
- exact-SHA PR Quality：Pending
- secret/PII 脱敏计数：Pending

## 人工与治理门

- Agent 1：Pending
- Agent 2：Pending
- Agent 3：Pending
- 第三方监理：Pending
- Agent 0：Pending
- 用户 protected merge 授权：Pending
- Squash merge / main Quality：Pending
