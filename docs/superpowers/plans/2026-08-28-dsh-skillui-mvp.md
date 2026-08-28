# dsh-skillui MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an independent DSH plugin that registers a sibling `Skill UI` tab in `DSH-better-sidebar`, hosts a demo HTML Skill UI, and connects its typed commands to session/workflow-scoped state.

**Architecture:** Keep `DSH-better-sidebar` unchanged. The client half of `dsh-skillui` registers `ctx.betterSidebar.registerTab(...)`; the host half owns a narrow `/skillui` HTTP bridge and a pure event reducer. The demo page is served as a packaged HTML asset and communicates through a typed JSON protocol.

**Tech Stack:** TypeScript, ESM host bundle, DSH plugin manifest, `tsdown`, Vitest, React JSX for the Sidebar tab, plain HTML/CSS/JavaScript for the Demo Skill UI.

**Spec:** `docs/superpowers/specs/2026-08-28-dsh-skillui-mvp-design.md`

## Global Constraints

- Do not modify or fork `DSH-better-sidebar`.
- Do not touch unrelated files in `skill-app-hermes`.
- Keep all domain logic out of the generic Sidebar tab.
- Follow TDD for protocol, reducer, and bridge logic: test first, observe failure, implement, then refactor.
- Use exact-path staging only when publishing Git changes.

---

## Task 1: Create package and DSH build scaffolding

**Files:** `package.json`, `dsh.plugin.json`, `tsconfig.json`, `tsdown.config.ts`, `cordis.patch.yml`, `.gitignore`

- [ ] Define package metadata, build/test/typecheck scripts, DSH peer dependencies, and package exports.
- [ ] Define the DSH manifest with host `lib/index.js` and client `lib/client-registry.js`.
- [ ] Configure host ESM output and browser client-registry output compatible with DSH's module loader.
- [ ] Add a minimal Cordis patch row so the plugin can be composed by a DSH profile.
- [ ] Add ignores for `node_modules`, `lib`, coverage, and local logs.

**Verification:** `pnpm install` succeeds after dependency resolution; `pnpm typecheck` can resolve the configured source entrypoints.

## Task 2: Define protocol and reducer tests first

**Files:** `src/shared/protocol.ts`, `src/host/demo-reducer.ts`, `test/protocol.test.ts`, `test/demo-reducer.test.ts`

- [ ] Write failing tests for identity validation, command validation, initial state, increment, reset, and identity isolation.
- [ ] Run `pnpm test --run` and record the expected failure because source modules do not exist yet.
- [ ] Implement the shared protocol types/guards and pure Demo reducer.
- [ ] Run the focused tests until they pass.

**Verification:** Protocol and reducer tests pass without DSH runtime access.

## Task 3: Implement the host HTTP bridge

**Files:** `src/host/demo-store.ts`, `src/host/http.ts`, `src/index.ts`, `test/http-bridge.test.ts`

- [ ] Write tests against a small request/response adapter for static HTML, state GET, malformed command, valid increment, and reset.
- [ ] Run the focused bridge tests and confirm failure first.
- [ ] Implement a session/workflow-keyed store using the reducer.
- [ ] Implement exact/prefix route handling for `/skillui/views/demo-review/index.html`, `/skillui/api/state`, and `/skillui/api/command`.
- [ ] Keep route validation independent from disk paths and only serve the bundled demo asset.
- [ ] Register the route through `ctx.webServer.register` from the host plugin.
- [ ] Register optional DSH command adapters when the commands service is present, sharing the same reducer/store path.

**Verification:** HTTP bridge tests pass; `pnpm typecheck` passes for host code.

## Task 4: Implement the client Skill UI tab

**Files:** `src/client/index.tsx`, `src/client/SkillUiTab.tsx`, `test/client-contract.test.ts`

- [ ] Write a contract test for the tab id, title, order, single-tab behavior, and identity URL construction.
- [ ] Run the focused test and observe the initial failure.
- [ ] Implement `inject = ['betterSidebar']` and `ctx.effect(() => ctx.betterSidebar.registerTab(...))`.
- [ ] Render an iframe with the demo Skill URL using `scope.sessionId` and `tab.meta` defaults.
- [ ] Send visibility messages to the iframe and keep the tab component free of domain-specific recruitment code.
- [ ] Build the client registry bundle with DSH's expected module-loader wrapper.

**Verification:** Client contract tests and `pnpm build` pass; generated registry exists at `lib/client-registry.js`.

## Task 5: Add the packaged Demo Skill HTML

**Files:** `views/demo-review/index.html`, `src/shared/protocol.ts`, `README.md`

- [ ] Add a small Chinese demo page showing identity, count, status, and Increment/Reset controls.
- [ ] Implement browser-side fetch calls using only the shared JSON protocol shape.
- [ ] Implement visibility handling so hidden tabs pause polling.
- [ ] Document how a future recruitment Skill registers its own HTML entry and command set.

**Verification:** Build output/package file list contains the demo HTML; a browser-independent HTML contract test checks the required route and command names.

## Task 6: Install dependencies and run the full local verification

**Files:** lockfile and generated build output only

- [ ] Install pinned development dependencies and inspect the resolved DSH/better-sidebar types.
- [ ] Run `pnpm test --run`.
- [ ] Run `pnpm typecheck`.
- [ ] Run `pnpm build`.
- [ ] Inspect `lib`, package manifest, and git diff; fix only issues caused by this project.
- [ ] If the DSH CLI is unavailable, report that real `dsh web` boot verification remains pending instead of claiming it passed.

## Task 7: Publish the project to GitHub

**Files:** Git metadata only plus the project files above

- [ ] Initialize Git only if the target directory has no repository.
- [ ] Add `https://github.com/jaikensai888/dsh-skillui.git` as `origin`, preserving any existing remote if present.
- [ ] Create branch `codex/bootstrap-skillui` before the first commit.
- [ ] Stage exact project paths; never use `git add -A` or `git add .`.
- [ ] Commit the MVP with a focused message.
- [ ] Push the branch to `origin` using escalated network access if required.
- [ ] Report branch, commit, and any remote/DSH-runtime limitation.
