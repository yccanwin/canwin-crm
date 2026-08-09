# WBS 1.2 环境边界验收记录模板

> 适用范围：CanWin CRM 的前端公开环境变量与 Supabase 函数端环境示例边界。本项不创建、连接或写入任何真实密钥。

## 验收信息

- 验收日期：`YYYY-MM-DD`
- 验收人：`姓名/角色`
- 提交或工作区标识：`commit SHA 或本地快照`
- 执行环境：`Windows 版本 + Node.js 版本`

## 必验命令

在仓库根目录执行：

```powershell
node scripts/verify-env-boundary.mjs
```

记录退出码、关键输出与执行时间。退出码必须为 `0`。

## 证据清单

- [ ] 存在 `apps/web/.env.development.example`、`.env.test.example` 与 `.env.production.example`。
- [ ] 三份前端模板仅包含 `VITE_APP_ENV`、`VITE_SUPABASE_URL`、`VITE_SUPABASE_PUBLISHABLE_KEY`。
- [ ] 三份模板的 `VITE_APP_ENV` 分别为 `development`、`test`、`production`。
- [ ] 不存在可提交的真实 `.env*` 文件；扫描排除 `.git`、`node_modules` 与 `dist`。
- [ ] 不存在名称包含 `SECRET`、`SERVICE_ROLE`、`PASSWORD`、`PRIVATE` 或 `TOKEN` 的 `VITE_*` 变量。
- [ ] 存在 `supabase/functions/.env.example`，其中所有敏感变量使用明显占位符（例如 `__SET_SERVICE_ROLE_KEY__`）。
- [ ] 未发现常见真实 API key、令牌或 JWT 格式。

## 结论

- [ ] 通过：扫描器退出码为 `0`，且所有必验项均满足。
- [ ] 不通过：填写缺口并关联问题单。

| 缺口 | 证据 | 责任人 | 处理状态 |
| --- | --- | --- | --- |
|  |  |  |  |

## 边界确认

前端 `VITE_*` 会被打包进客户端，不得承担服务端密钥。函数端 `.env.example` 仅为变量名和占位符契约；真实环境变量必须通过受控的部署或本地机密管理方式提供，禁止提交到仓库。
