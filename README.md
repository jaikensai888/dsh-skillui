# dsh-skillui

独立的 DSH 插件：在 `dsh-better-sidebar` 中注册一个与 Files、Tasks、Terminal、Browser、Source Control 同级的 `Skill UI` Tab，用于承载具有交互界面的 Skill HTML。

## 安装

### 前置条件

- 已安装 DSH Desktop 或 DSH CLI；
- 目标 profile 已安装 `dsh-better-sidebar >=0.16.1`；
- DSH 使用哪个 profile，就把 `--profile` 设置为哪个 profile。DSH Desktop 通常使用 `desktop`，`dsh web` 通常使用 `web`。

当前仓库还没有发布版本 tag，因此先使用 GitHub 分支安装：

```powershell
cd ~/.dsh

# DSH Desktop
dsh plugin --profile desktop add "github:jaikensai888/dsh-skillui#codex/bootstrap-skillui"

# 或 dsh web
dsh plugin --profile web add "github:jaikensai888/dsh-skillui#codex/bootstrap-skillui"
```

安装完成后重启 DSH，在 `dsh-better-sidebar` 的 `+` 菜单中应能看到 `Skill UI`。点击后可以打开本插件自带的 Demo 页面；真实 Skill 则通过通用 `skillui_open` 工具按当前会话打开自己的 View。

后续发布版本 tag 后，推荐改用固定版本安装，例如：

```powershell
cd ~/.dsh
dsh plugin --profile web add "github:jaikensai888/dsh-skillui#v0.1.0"
```

将 `web` 替换为 `desktop`，即可安装到 DSH Desktop profile。

卸载插件：

```powershell
cd ~/.dsh
dsh plugin --profile web remove dsh-skillui
```

## 当前 Runtime

- 不 fork、不修改 `DSH-better-sidebar`；
- client 侧通过 `ctx.betterSidebar.registerTab(...)` 注册与 Files、Tasks、Terminal、Browser 同级的 `Skill UI`；
- host 侧扫描 `npx skills add ... --all -g -y` 安装的 Skill 根目录，发现并校验 `skillui/manifest.json`；
- `skillui_open` 绑定调用它的 DSH session，将已声明的 View 请求排队；客户端轮询后调用 `openTab(seed, { sessionId })`；
- Tab 通过 `scope.sessionId` 和持久化的 `tab.meta` 生成 `sessionId / skillId / workflowId`；
- View 只能通过受保护的 workspace JSON 和资源接口读取数据，不能拼接任意本地路径；
- View 命令先校验身份和 manifest 白名单，再转换为当前会话的 queue prompt，由具体 Skill 执行业务逻辑；
- Demo 页面仍保留，用于验证插件安装、Tab、iframe 和内存 reducer；不包含真实招聘业务。

## 目录

```text
dsh-skillui/
├── dsh.plugin.json
├── cordis.patch.yml
├── src/
│   ├── index.ts                 # host 插件入口与 HTTP route
│   ├── host/                    # Skill registry、open queue、HTTP bridge、tool
│   ├── client/                  # Tab、activation polling、command bridge
│   └── shared/                  # manifest 与跨 host/client 协议
├── views/demo-review/index.html # Demo Skill UI
└── docs/                        # 架构、设计规格、实施计划
```

## 本地验证

```powershell
pnpm install
pnpm test --run
pnpm typecheck
pnpm build
```

如果 DSH Desktop 正在使用本仓库的本地 `link:` 包，Windows 可能锁定 `lib` 文件并使 `pnpm build` 清理阶段报 `EPERM`；先完全退出 DSH Desktop，再执行构建。

构建结果包括：

- `lib/index.js`：host bundle；
- `lib/client-registry.js`：DSH plugin registry client bundle；
- `lib/client.js`：profile channel client bundle；
- `views/demo-review/index.html`：打包的 Demo 页面。

当前开发环境如果没有安装 DSH CLI，只能完成包级测试、类型检查和构建；真实 `dsh web` 启动应在 DSH profile 中安装 `dsh-better-sidebar` 和本插件后再验收。

## 接入真实 Skill 的边界

真实招聘 Skill 不应修改本插件或 Sidebar。它只需在自己的包中提供：

```text
skills/recruitment/
├── SKILL.md
├── skillui/manifest.json
└── views/index.html
```

进入招聘工作台时，入口 Skill 调用通用工具：

```json
{
  "skillId": "recruitment",
  "workflowId": "recruitment:当前流程ID"
}
```

招聘领域的 command、storage、数据写入和业务判断仍由招聘 Skill 自己拥有；`dsh-skillui` 只负责发现声明、承载 HTML、绑定会话和转发交互。

View 使用的稳定接口为：

```text
GET /skillui/api/data/:skillId/:declared-file?sessionId=...&skillId=...&workflowId=...
GET /skillui/api/resource/:skillId/:allowed-path?sessionId=...&skillId=...&workflowId=...
POST message to parent: dsh-skillui:command
```

## 设计文档

- [Skill UI 架构与招聘运行时序图](docs/skill-ui-architecture.md)
- [MVP 设计规格](docs/superpowers/specs/2026-08-28-dsh-skillui-mvp-design.md)
- [MVP 实施计划](docs/superpowers/plans/2026-08-28-dsh-skillui-mvp.md)
