# WBS 2.1 客户主体与门店数据模型契约

状态：冻结，待实现证据与正式验收。

## 目标

建立一份跨部门共享的客户主体与门店档案底座。客户主体和门店均为全局实体，不按部门复制；后续部门业务关系必须引用同一门店。

## 数据契约

- `public.accounts`：全局客户主体，使用内部 `bigint` 主键和稳定 `uuid public_id`。
- `public.stores`：全局门店，通过 `account_id` 归属一个客户主体；同一客户主体可有多个门店。
- 两表都不允许出现 `department_id`、负责人或部门私有跟进字段。
- 名称保留用户确认后的原文，同时生成只读规范化列供索引和候选检索；名称不作为自动合并依据。
- 客户主体状态为 `active / suspected_closed / disabled`；门店状态为 `active / inactive`。非活动状态必须保留安全原因。
- 两表均保存 `created_by_member_id`、`updated_by_member_id`、`created_at`、`updated_at` 和递增 `version`。
- 主键、`public_id`、创建人、创建时间不可变；门店的 `account_id` 在本项中不可直接移动。删除一律拒绝，未来合并治理由 WBS 2.6 另行定义。

## 权限契约

- `public`/`anon` 对两表零权限。
- 实时权威成员和主营部门均为 active 的 `authenticated` 用户可读取全部共享档案。
- `authenticated` 不获得直接 INSERT/UPDATE/DELETE/TRUNCATE 权限，也没有对应 RLS 写策略。
- `service_role` 仅获得 SELECT，不获得表写权限或 identity sequence 权限。
- 两表都必须 ENABLE RLS + FORCE RLS；权限不得读取 `user_metadata`。
- WBS 2.4 才提供经审计、并发验证和稳定错误信封保护的创建/更新服务。

## 索引和约束

- 每个外键列都有索引。
- 名称规范化、状态更新时间、门店所属客户主体均有面向后续检索的索引。
- 名称、地址、状态、状态原因和版本有数据库约束。
- `public_id` 在各自表内唯一，但名称不设唯一约束，重复候选留给 WBS 2.6 人工治理。

## 本项明确不做

- 联系人与敏感联系方式（WBS 2.2）。
- 动态画像与画像值（WBS 2.3）。
- 创建/更新/查询 RPC 和字段级审计事件（WBS 2.4）。
- 移动端线索池和画像筛选（WBS 2.5）。
- 重复候选、人工保留、合并申请或自动合并（WBS 2.6）。
- 部门商机、领取、跟进、成交、倒闭上报和跨部门关系（大项 4）。

## 验收门

1. 迁移可从空库重置并通过全量回归。
2. pgTAP 验证表、列、主外键、约束、索引、RLS/FORCE、最小授权和不可变边界。
3. active 成员跨部门读取的是同一份共享行；成员或主营部门失效后旧 JWT 立即读不到档案。
4. `authenticated` 和 `service_role` 的直接写入均被拒绝且零副作用。
5. exact-SHA push/PR Quality、内部 Agent 1/2/3、第三方监理、Agent 0、Squash merge 与 main Quality 全部通过后，WBS 2.1 才能计入 13/54。
