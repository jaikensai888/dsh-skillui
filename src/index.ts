import { readFile } from 'node:fs/promises'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Context } from '@deepseek-ai/cordis'
import { createNodeSkillUiHandler } from './host/http.js'
import { DemoStore } from './host/demo-store.js'

export const name = 'dsh-skillui'
export const inject = ['webServer'] as const

type WebRoute = {
  kind: 'prefix'
  path: string
  handler: (request: IncomingMessage, response: ServerResponse) => void | Promise<void>
}

type WebServer = {
  register(route: WebRoute): () => void
}

export type SkillUiHostContext = Context & {
  webServer: WebServer
}

async function loadDemoHtml(): Promise<string> {
  return readFile(new URL('../views/demo-review/index.html', import.meta.url), 'utf8')
}

export function apply(ctx: SkillUiHostContext): void {
  const store = new DemoStore()
  ctx.effect(() => ctx.webServer.register({
    kind: 'prefix',
    path: '/skillui',
    handler: createNodeSkillUiHandler(store, loadDemoHtml),
  }))
}
