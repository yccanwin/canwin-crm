# WBS 2.3 动态画像模型与安全边界契约

状态：Frozen implementation contract；验收状态仍为 Pending。本文从属父项目
`docs/wbs-2.3-contract-freeze-2026-08-10.md` 与
`docs/wbs-2.3-implementation-plan-2026-08-11.md`，冲突时以上述冻结文件为准。

## 冻结范围

- 只允许一份由锁定 Supabase CLI 生成、后缀为
  `wbs_2_3_dynamic_portraits` 的迁移。
- 数据模型固定为六表：公开字段定义、选项、正式值、多选关联、派生当前态，以及
  `app_private` 派生历史。
- 正式值固定支持 `text`、`single_select`、`multi_select`、`boolean`、`number`；
  使用互斥 typed slots，number 在数据库保持精确 numeric，客户端使用 canonical decimal string。
- 迁移只预置 `has_legal_person_id`、`has_business_license`、`documents_complete`
  三个固定 system-derived reserved 定义，不插入任何 current/history 布尔值。
- 人工画像只挂门店并跨部门共享；只有 `documents_complete` 派生结果允许携带当前部门计算上下文。

## 数据与生命周期

- 定义发布后 `public_id`、`field_key`、类型、来源、隐私和上下文不可改变。
- manual definition/option 结构允许 WBS 2.4 通过受控 CAS 命令执行 active↔inactive；
  system-derived reserved 不允许人工激活、停用或恢复。
- 正式值是不可变修订：修改为停用旧修订并新增修订；旧修订不可恢复；每个
  store+field 最多一个 active 值。
- 单选、多选 option 必须属于同一 field；停用 option 仅保留历史显示，不可用于新值；
  多选关联按 value+option 去重。
- 所有外键均 ON DELETE RESTRICT 并有覆盖索引；字段、选项、值和历史禁止物理删除。
- `allow_keyword_search` 只允许 active manual text shared-non-sensitive 字段；查询仍须实时
  join definition 校验，不把跨表标志写进 partial-index predicate。

## RLS、ACL 与隐私

- 所有公开画像表 ENABLE + FORCE RLS；私有历史同样 ENABLE + FORCE RLS。
- `anon` 零权限；`authenticated` 仅 SELECT，且必须来自实时有效 session、active member
  与 active primary department；不信任 `user_metadata`。
- `service_role` 对本模块全部表和 sequence REVOKE ALL，尤其不得直接读取或写入派生当前态/历史。
- 人工定义、选项和值对 live member 跨部门共享；部门派生值仅允许当前主营部门读取。
- 本模块不加入 Realtime publication；不得开放通用配置、正式值写入或派生计算 RPC。
- 私有 helper 固定空 `search_path`、全限定对象和最小 EXECUTE；不得撤销既有 RLS 所需的
  `current_session_is_valid`、`current_member_id` 等最小权威 helper。

## 派生三态与敏感禁区

- `fresh + boolean` 才可进入 is_true/is_false。
- `unknown + null` 与 `stale + null` 均进入 is_unknown；stale 不显示旧 boolean。
- 三态携带安全 calculation/source version、时间和稳定 reason code，不携带证件或联系人标识。
- 姓名、联系方式、证件原件/号码/OCR/path/Storage/hash/signed URL、部门业务字段、真实客户数据
  不得进入画像、事件、审计、响应、日志、fixture 或证据。
- system-derived 当前态与历史只有 WBS 5.5 未来的窄化私有计算器可写；2.3 不提供写路径。

## 客户端与移动证据

- schema v1 使用 exact-key 判别联合；未知 envelope version 整体 fail closed；未知字段类型只读保留。
- mutation 仅允许 `{op:'set',value}` 或 `{op:'clear'}`；null、空字符串、空数组、false、0 不等于 clear。
- 缓存键必须包含 auth user、member、当前主营部门、store、field 和 context version，全部使用公开 UUID。
- auth/member/department/context 变化先清 cache、递增 generation 并丢弃旧响应。
- 禁止 local/session storage、IndexedDB、Cache API、Service Worker、日志、analytics 或错误监控持久化。
- 独立 360×800 合成夹具覆盖 types、clear、unsupported、inactive-history、derived、
  department-switch、error；不得接入生产 `main.tsx`。

## 固定测试与门禁

- pgTAP 只能新增 `0035_wbs_2_3_portrait_schema.sql`、
  `0036_wbs_2_3_portrait_values.sql`、`0037_wbs_2_3_portrait_rls.sql`。
- 首个 implementation commit 前计划数可只增不减，最低 60/72/72；提交后由 static verifier
  锁定最终 exact plan，不得因失败下调。
- runtime 至少 150 assertions / 7 real JWT sessions，并真实删除 `auth.sessions` 后复用旧 token。
- 前端至少新增 48 tests；360×800 几何必须由真实浏览器验证，不能用 jsdom 冒充。
- 性能基准固定 10,000 stores / 50 active fields / 每店至少 10 values / 20 independent connections；
  每查询类预热后至少 200 samples，功能错误 0、结果与总数 100% 正确、参考 SQL p95≤800ms、
  使用目标索引且无磁盘 spill。
- CI 精确保持一个 Supabase start、三个 protected status、一个 functions serve；失败只输出安全阶段和计数。

## 状态与范围外

- AC-08、AC-09 继续 Defined；2.3 只形成模型、安全协议与性能必要条件的部分证据。
- 字段/选项配置、正式值写服务、clear、幂等、CAS、字段审计归 WBS 2.4。
- 生产移动画像、搜索、筛选、分页与真实 API 性能归 WBS 2.5。
- 证件原件、Storage、权威计算、回填与派生激活归 WBS 5.3/5.5。
- implementation、Agent 1/2/3、监理、Agent 0、protected merge 与 main Quality 在实际完成前均为 Pending。
