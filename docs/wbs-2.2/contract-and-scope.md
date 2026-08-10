# WBS 2.2 联系人敏感边界与质量契约

状态：Frozen implementation contract；验收状态仍为 Pending。本文从属
`../wbs-2.2-contract-freeze-2026-08-10.md`，冲突时以后者为准。

## 冻结范围

- 只允许一份由 Supabase CLI 生成、后缀为
  `wbs_2_2_contacts_sensitive` 的迁移。
- `public.contacts` 只保存结构字段：`public_id`、`store_id`、
  `role_label`、`is_primary`、`status`、审计字段和 `version`。
- `app_private.contact_secrets` 保存 `full_name`、`mobile`、`phone`、
  `email`、`wechat`、`other` 的完整值；一个联系人只归属一个门店。
- 唯一公开读取入口是
  `public.read_contact_secret(p_contact_public_id uuid, p_reason text,
  p_correlation_id uuid)`。调用方不得提交 actor、member、department、role、
  owner 或授权结论。
- WBS 2.2 只有实时有效的 `super_admin` 可因非空、安全且长度受限的理由
  获得明文。销售和部门经理一律返回 `NOT_CLAIMED`，等待 WBS 4.2
  在现有 capability 扩展点接入真实商机领取关系。

## 权限与隐私底线

- `public.contacts` 与 `app_private.contact_secrets` 均必须启用并强制 RLS。
- `contact_secrets` 对 `PUBLIC`、`anon`、`authenticated`、`service_role`
  没有直表、序列、视图、写入、删除或 Realtime 能力；唯一出口为受控 RPC。
- 所有 `SECURITY DEFINER` 函数位于 `app_private`，设置空
  `search_path`，显式撤销默认执行权，并使用 `auth.uid()`、实时 session、
  member、primary department、account/store/contact 状态完成授权。
- 禁止依赖 `user_metadata`、旧 JWT 的 role/department 声明或客户端传入的
  权限字段。
- 允许和拒绝均写脱敏审计。审计、事件、outbox、日志、缓存和证据不得包含
  姓名、联系方式、掩码、尾号、可恢复散列或测试 canary。
- 拒绝响应只允许 `contact_access.allowed=false` 与稳定 `reason_code`；
  `full_name`、`channels`、`mobile`、`phone`、`email`、`wechat`、mask、tail
  等敏感键必须完全省略。只有授权成功且确无联系方式时才允许
  `channels: []`。
- 任何未授权明文、部分值、掩码、尾号或可恢复值泄漏均为 P0。

## 数据与客户端契约

- `contacts.store_id` 和 `contact_secrets.contact_id` 外键均为
  `ON DELETE RESTRICT`；身份字段不可变，物理删除被拒绝。
- 不得按姓名或联系方式建唯一约束；不得在 `public.contacts` 保存部门、
  owner、claim、opportunity、follow-up 或 note 字段。
- 客户端只白名单解析六个结构字段；敏感响应使用严格判别联合，畸形或未知
  字段一律 fail closed。
- 联系人明文只存在于当前授权内存状态。Auth 变化、权限撤销、应用恢复、
  切换联系人、离线、错误和网络恢复必须先清空。
- 每次敏感读取必须使用唯一请求标识；只有当前 authorizing 状态中仍匹配的
  响应才能写入内存。撤权、登出、离线或后续请求到达后，旧响应必须被丢弃。
- 禁止把联系人敏感值写入 local/session storage、IndexedDB、Cache API、
  Service Worker、分析埋点、错误监控、控制台或截图证据。
- 交付可复用的联系人敏感信息面板，覆盖锁定、理由输入、授权加载、允许空态
  和稳定错误态。独立 `contact-mobile` 夹具只用于 360×800 合成数据验收，
  不接入生产 `main.tsx`；正式联系人路由与档案页仍由 WBS 2.5 负责。

## 固定测试与门禁

- pgTAP 文件必须且只能是：
  `0032_wbs_2_2_contacts_schema.sql`、
  `0033_wbs_2_2_contacts_acl.sql`、
  `0034_wbs_2_2_contact_read_rpc.sql`。
- 计划数必须精确为 0032=53、0033=35、0034=46，WBS 2.2 合计 134；
  不得增加旁路 suite 或替代既有回归。
- static verifier 锁定迁移唯一性、字段边界、RLS/FORCE、ACL、Realtime、
  SECURITY DEFINER、revoke、无影子领取表、前端持久化禁令、360px 五态夹具
  及 CI/package 接线。
- runtime 仅允许本地 `127.0.0.1`/`localhost`，使用真实 Auth JWT 覆盖
  anon、A1、A2、MA、B1、SA、disabled、inactive department、old JWT 与
  forged metadata；至少 70 个运行时断言。
- runtime 只输出脱敏计数，不输出 JWT、密钥、邮箱、UUID、姓名、联系方式、
  原始响应、SQL/堆栈或日志。
- CI 必须存在独立 static 与 runtime 步骤；runtime 继承现有 `set +x`、
  0600 临时状态文件、secret mask、退出清理和原始日志不回显模式。

## 验收状态与范围外

- AC-02 继续保持 `Defined`；WBS 2.2 只登记联系人隐藏与安全出口的部分证据，
  不新增 `Partial` 状态。
- 本项不实现领取/商机授权表、跨门店联系人复用、联系人写入服务、跟进、
  证件上传/OCR/画像计算、AI 草稿、自动摘要、站内通知或企微/钉钉适配器。
- AI 和通知不得读取或缓存 `contact_secrets`，也不得根据模型结果或通知回执
  改变领取、客户、证件或联系人关键状态。
- 第三方监理结论、exact-SHA push/PR CI、主分支合并与生产操作均保持
  Pending，直到对应责任人完成独立核验。
