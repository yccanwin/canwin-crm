# WBS 2.1 Agent 1 数据库与安全复核

结论：**PASS**。本结论仅覆盖 WBS 2.1 数据库、RLS、权限与回归边界；第三方监理、Agent 0、protected merge 与 main Quality 仍须独立完成。

## 证据绑定

- 日期 / 时区：2026-08-10 / Asia/Shanghai
- Reviewer role：Agent 1（数据库、RLS、安全）
- Repository / PR：`yccanwin/canwin-crm` / [#13](https://github.com/yccanwin/canwin-crm/pull/13)
- Branch：`agent/wbs-2-1-account-store`
- Reviewed implementation SHA：`6e2caedf75140b18022a645bfb13c2582fc00376`
- Reviewed tree：`f03c7b562e65dcbffa5cfafe3e9a4eada63a7291`
- Migration SHA-256：`231F2BC4774EAA95124D7F9DEA991A3AB9589E5852358EA3AFD748CA97EA5EDB`
- Push Quality：`31384084754 / 93440502381` — completed / success
- PR Quality：`31384091661 / 93440524033` — completed / success
- Documentation-content tail：`3a1b2a6e2fe3effa60bbda9704b3b364758ce7e8`
- Content-tail push Quality：`31385131609 / 93443747930` — completed / success
- Content-tail PR Quality：`31385134713 / 93443757681` — completed / success

## 独立核验

- `accounts`、`stores` 为全局共享实体，不含 `department_id`；`stores.account_id` 为 RESTRICT FK，允许一个主体拥有多个门店。
- 5 个 FK 列均有索引，9 个冻结索引齐全；只有稳定 `public_id` 唯一，名称不会因普通重复而自动合并。
- 非活动 account/store 分支显式要求非空 `status_reason`；审计 actor、时间戳、版本和不可变身份边界完整。
- 两表均 ENABLE + FORCE RLS；`public`/`anon` 零权限，authenticated 与 service_role 均只有 SELECT，无新 sequence 或写权限。
- authenticated 读取依赖实时权威 active member + active primary department；旧 JWT、停用成员/部门、跨部门共享、伪造 `user_metadata` 和直接写拒绝均有 pgTAP 覆盖。
- 新增 pgTAP 为 `42 + 31 = 73`；全量回归为 9 files / 259 tests；未扩入 WBS 2.2 及后续范围。

## Findings

- Open P0：none
- Open P1：none
- 非阻塞交接：WBS 2.4 的状态转换服务应原子维护 `status_changed_at`、`updated_by_member_id`、`version` 和审计事件。

本记录的首个版本已进入 documentation-content tail `3a1b2a6e2fe3effa60bbda9704b3b364758ce7e8`，并取得 exact-SHA 双绿。本次 binding amendment 修改该记录，不能自引用上述 CI；必须进入新的 tail 并对新 SHA 重新取得 push/PR Quality。
