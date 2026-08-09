# WBS 1.3 质量门与失败证据验收记录模板

> 本项验证质量配置与五道门的拒绝能力：秘密边界、lint、类型、测试、构建。只记录脱敏证据，绝不写入真实密钥。

## 验收信息

- 验收日期：`YYYY-MM-DD`
- 验收人：`姓名/角色`
- 工作区或提交标识：`commit SHA 或本地快照`
- 运行环境：`Windows 版本、Node.js 版本、npm 版本`

## 必验命令

```powershell
node scripts/verify-quality-config.mjs
node scripts/prove-quality-gate-failures.mjs
```

第二条命令仅在已执行依赖安装且工作区干净时运行。它会创建短暂受控 fixture 并在每个用例的 `finally` 中删除；随后执行五道门的正向检查。不要并行修改前端源文件。

## 静态配置证据

- [ ] `package.json` 定义秘密、lint、类型、测试、构建五道门及聚合 `check` 脚本。
- [ ] `.github/workflows/quality.yml` 存在 `quality` job、只读权限、固定 SHA 的 Actions、无 `paths`/`paths-ignore` 过滤。
- [ ] workflow 执行 `npm ci`、`npm audit` 和五道门。
- [ ] `.github/pull_request_template.md`、`.github/CODEOWNERS`、`docs/branch-ci-quality-gates.md` 存在且覆盖评审与质量规则。

## 失败证明证据

- [ ] `artifacts/verification/gate-1/wbs-1.3-quality-gates/manifest.json` 已生成。
- [ ] manifest 对 secret、lint、type、test、build 各有一条预期 `non-zero` 且实际非零的记录。
- [ ] 每道门随后有预期 `zero` 且实际为零的正向记录。
- [ ] manifest 仅包含脱敏输出；未出现 API key、令牌、客户数据或真实密钥。

## 结论

- [ ] 通过：两个命令退出码均为 `0`，并保留 manifest 路径作为证据。
- [ ] 不通过：填写以下缺口，保留一次失败输出并关联问题单；不要重复运行同一失败尝试。

| 缺口 | 证据路径或脱敏摘要 | 责任人 | 处理状态 |
| --- | --- | --- | --- |
|  |  |  |  |

## 边界确认

失败证明只使用临时、无敏感值 fixture。脚本不调用 Git 命令；manifest 中的 Git SHA 仅通过只读 `.git/HEAD` 解析，无法取得时记为 `unavailable`。
