# dsh-skillui

独立的 DSH 插件：在 `dsh-better-sidebar` 中注册一个与 Files、Tasks、Terminal、Browser、Source Control 同级的 `Skill UI` Tab，用于承载具有交互界面的 Skill HTML。

## 当前 MVP

- 不 fork、不修改 `DSH-better-sidebar`；
- client 侧通过 `ctx.betterSidebar.registerTab(...)` 注册 `Skill UI`；
- Tab 通过 `scope.sessionId` 和持久化的 `tab.meta` 生成 `sessionId / skillId / workflowId`；
- host 侧通过 DSH 的 `webServer` 服务提供 Demo HTML 和 JSON bridge；
- Demo 页面使用 sandbox iframe，确定性操作使用 `demo.increment` / `demo.reset` typed command；
- Demo 状态以 session/workflow 为 key 的内存事件日志保存，并通过纯 reducer 回放。后续真实 Skill 可将同一 reducer 接到 DSH Session Projection；
- 不包含真实招聘业务，也不调用模型。

## 目录

```text
dsh-skillui/
├── dsh.plugin.json
├── cordis.patch.yml
├── src/
│   ├── index.ts                 # host 插件入口与 HTTP route
│   ├── host/                    # reducer、event log、HTTP bridge
│   ├── client/                  # Skill UI Tab 与 iframe contract
│   └── shared/                  # 跨 host/client 协议
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

构建结果包括：

- `lib/index.js`：host bundle；
- `lib/client-registry.js`：DSH plugin registry client bundle；
- `lib/client.js`：profile channel client bundle；
- `views/demo-review/index.html`：打包的 Demo 页面。

当前开发环境如果没有安装 DSH CLI，只能完成包级测试、类型检查和构建；真实 `dsh web` 启动应在 DSH profile 中安装 `dsh-better-sidebar` 和本插件后再验收。

## 接入真实 Skill 的边界

真实招聘 Skill 不应修改本插件或 Sidebar。它应拥有自己的 host/client 逻辑，并在打开 UI 时使用：

```ts
ctx.betterSidebar.openTab({
  type: 'dsh-skillui:skill-ui',
  title: '招聘流程',
  meta: {
    skillId: 'recruitment',
    workflowId: 'candidate-screening-1',
    entryPath: '/skillui/views/recruitment/index.html',
  },
}, { sessionId })
```

招聘领域的 command、event、storage 和 projection 仍由招聘 Skill 自己拥有；`dsh-skillui` 只负责承载页面和传递 identity。

## 设计文档

- [Skill UI 架构与招聘运行时序图](docs/skill-ui-architecture.md)
- [MVP 设计规格](docs/superpowers/specs/2026-08-28-dsh-skillui-mvp-design.md)
- [MVP 实施计划](docs/superpowers/plans/2026-08-28-dsh-skillui-mvp.md)
