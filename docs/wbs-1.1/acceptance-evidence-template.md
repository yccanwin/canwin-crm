# WBS 1.1 脚手架验收记录模板

> 适用范围：CanWin CRM 的独立仓库与应用脚手架。此记录不替代后续 Supabase、认证或业务功能验收。

## 验收信息

- 验收日期：`YYYY-MM-DD`
- 验收人：`姓名/角色`
- 提交或工作区标识：`commit SHA 或本地快照`
- 执行环境：`Windows 版本 + Node.js 版本`

## 必验命令

在仓库根目录使用 Windows 的 `npm.cmd`（避免受 PowerShell `npm.ps1` 执行策略影响）：

```powershell
node scripts/verify-scaffold.mjs
npm.cmd install
npm.cmd run dev
```

记录每条命令的退出码、关键输出和执行时间。开发服务启动后应由验收人手动停止；本模板不要求持续运行服务。

## 证据清单

- [ ] 根目录存在 `package.json`、`README.md` 和 `.gitignore`。
- [ ] 存在前端应用目录 `apps/web/`。
- [ ] 存在 `supabase/`。
- [ ] `README.md` 声明仅限内部/专有许可使用，并给出 Windows `npm.cmd` 启动方式。
- [ ] `node scripts/verify-scaffold.mjs` 退出码为 `0`。
- [ ] 未提交真实 `.env*` 文件、服务角色密钥、个人访问令牌或 API 密钥；`.gitignore` 忽略 `.env*`，并允许未来的 `*.example` 模板。

## 结论

- [ ] 通过：所有必验项均满足。
- [ ] 不通过：填写下列缺口并关联问题单。

| 缺口 | 证据 | 责任人 | 处理状态 |
| --- | --- | --- | --- |
|  |  |  |  |

## 边界确认

WBS 1.1 仅确认可启动的工程骨架与本地安全基线；本项不要求提供 `.env.example`，也不代表 Supabase 项目已连接、迁移已执行、RLS 已验证，亦不代表任何业务功能已验收。
