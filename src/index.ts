import { readFile } from 'node:fs/promises'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Context } from '@deepseek-ai/cordis'
import { createNodeSkillUiHandler } from './host/http.js'
import { DemoStore } from './host/demo-store.js'
import { SkillUiOpenRegistry } from './host/open-registry.js'
import { defaultSkillUiRoots, SkillUiRegistry } from './host/skill-registry.js'
import { registerSkillUiOpenTool } from './host/tool.js'

export const name = 'dsh-skillui'
export const inject = ['webServer', 'sessions', 'tools'] as const

type WebRoute = {
  kind: 'prefix'
  path: string
  handler: (request: IncomingMessage, response: ServerResponse) => void | Promise<void>
}

type WebServer = {
  register(route: WebRoute): () => void
}

type Sessions = {
  get(sessionId: string): { header: { cwd?: string } } | undefined
}

export type SkillUiHostContext = Context & {
  webServer: WebServer
  sessions: Sessions
  tools: Parameters<typeof registerSkillUiOpenTool>[0]['tools']
}

async function loadDemoHtml(): Promise<string> {
  return readFile(new URL('../views/demo-review/index.html', import.meta.url), 'utf8')
}

export function apply(ctx: SkillUiHostContext): void {
  const store = new DemoStore()
  const registry = new SkillUiRegistry(defaultSkillUiRoots())
  const opens = new SkillUiOpenRegistry()
  void registry.refresh()

  ctx.effect(() => {
    const disposeTool = registerSkillUiOpenTool(ctx, registry, opens)
    const disposeRoute = ctx.webServer.register({
      kind: 'prefix',
      path: '/skillui',
      handler: createNodeSkillUiHandler(store, loadDemoHtml, {
        registry,
        openRegistry: opens,
        resolveSessionCwd: (sessionId) => ctx.sessions.get(sessionId)?.header.cwd ?? process.cwd(),
      }),
    })
    return () => {
      disposeRoute()
      disposeTool()
      opens.dispose()
    }
  })
}
