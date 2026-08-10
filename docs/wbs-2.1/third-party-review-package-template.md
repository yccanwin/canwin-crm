# WBS 2.1 第三方监理包模板

状态：Pending。仅在证据尾 exact-SHA 双 Quality 通过后交付监理。

## Review target

- Repository / branch / PR：Pending
- Implementation SHA：Pending
- Evidence-tail SHA：Pending
- Migration SHA-256：Pending
- Push / PR Quality run+job：Pending

## Required supervisor checks

- [ ] `accounts`、`stores` 是全局共享表且没有 `department_id`。
- [ ] 一主体多门店、FK、删除限制和外键索引正确。
- [ ] 名称不因普通重复而被唯一约束自动合并。
- [ ] 状态、原因、名称、地址、版本约束 fail closed。
- [ ] 创建/更新审计字段存在且身份字段不可变。
- [ ] 两表 ENABLE RLS + FORCE RLS。
- [ ] `public`/`anon` 零权限。
- [ ] authenticated 仅 SELECT 且必须是实时 active 成员和 active 主营部门。
- [ ] service_role 仅 SELECT，无写权限和 identity sequence 权限。
- [ ] active 跨部门角色读取同一共享行。
- [ ] 成员/主营部门停用后旧 JWT 立即失权。
- [ ] authenticated/service_role 直接写失败且零副作用。
- [ ] 授权函数不读取 user_metadata/raw_user_meta_data。
- [ ] 未扩入联系人、画像、服务、移动端、重复合并或商机。
- [ ] exact evidence SHA 的 push/PR Quality 全绿，无开放 P0/P1。

## Findings

Pending。

## Supervisor disposition

- Reviewer / organization：Pending
- Reviewed SHA：Pending
- Date / timezone：Pending
- Decision：Pending（PASS / FAIL / CONDITIONAL）
- Blocking findings：Pending
- Immutable review reference：Pending

## Agent 0 independent verification

Pending。监理尾不可自引用；若监理结论入库，必须对新的 supervisor-tail SHA 再跑 push/PR Quality。
