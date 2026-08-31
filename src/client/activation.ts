import type { BetterSidebarService, OpenTabSeed } from 'dsh-better-sidebar/client/service'
import { SKILL_UI_TAB_ID, type SkillUiOpenRequest } from '../shared/protocol.js'

type SkillUiOpenMeta = {
  skillId: string
  workflowId: string
  entryPath: string
  commands: readonly string[]
}

/** Open or focus the shared Skill UI tab in the request's session. */
export function openSkillUiRequest(service: Pick<BetterSidebarService, 'updateTab' | 'openTab'>, request: SkillUiOpenRequest): void {
  const meta: SkillUiOpenMeta = {
    skillId: request.skillId,
    workflowId: request.workflowId,
    entryPath: request.entryPath,
    commands: [...request.commands],
  }
  service.updateTab(SKILL_UI_TAB_ID, {
    title: request.title,
    path: request.entryPath,
    meta,
  })
  const seed: OpenTabSeed = {
    type: SKILL_UI_TAB_ID,
    title: request.title,
    path: request.entryPath,
    meta,
  }
  service.openTab(seed, { sessionId: request.sessionId })
}

function isOpenRequest(value: unknown): value is SkillUiOpenRequest {
  if (typeof value !== 'object' || value === null) return false
  const candidate = value as Partial<SkillUiOpenRequest>
  return (
    typeof candidate.id === 'string'
    && candidate.id !== ''
    && typeof candidate.sessionId === 'string'
    && candidate.sessionId !== ''
    && typeof candidate.skillId === 'string'
    && candidate.skillId !== ''
    && typeof candidate.workflowId === 'string'
    && candidate.workflowId !== ''
    && typeof candidate.title === 'string'
    && candidate.title !== ''
    && typeof candidate.entryPath === 'string'
    && candidate.entryPath.startsWith('/skillui/views/')
    && !candidate.entryPath.includes('..')
    && Array.isArray(candidate.commands)
    && candidate.commands.every(command => typeof command === 'string')
  )
}

type SkillUiOpenResponse = { requests?: unknown }

function activeSessionId(service: BetterSidebarService): string | undefined {
  const snapshot = service.getSnapshot() as { sessionId?: unknown }
  return typeof snapshot.sessionId === 'string' && snapshot.sessionId !== '' ? snapshot.sessionId : undefined
}

export type SkillUiPollingOptions = {
  intervalMs?: number
  fetch?: typeof globalThis.fetch
}

/**
 * Poll the host queue for the active sidebar session.  This deliberately uses
 * the sidebar service snapshot instead of a second session UI dependency, so
 * it follows the same session scope as the tab itself.
 */
export function startSkillUiOpenPolling(
  service: BetterSidebarService,
  options: SkillUiPollingOptions = {},
): () => void {
  const fetcher = options.fetch ?? globalThis.fetch.bind(globalThis)
  const intervalMs = Math.max(250, options.intervalMs ?? 750)
  let stopped = false
  let running = false

  const poll = async (): Promise<void> => {
    if (stopped || running) return
    const sessionId = activeSessionId(service)
    if (sessionId === undefined) return
    running = true
    try {
      const response = await fetcher(`/skillui/api/open?sessionId=${encodeURIComponent(sessionId)}`, {
        headers: { accept: 'application/json' },
      })
      if (!response.ok) return
      const payload = await response.json() as SkillUiOpenResponse
      if (!Array.isArray(payload.requests)) return
      for (const request of payload.requests) {
        if (!stopped && isOpenRequest(request) && request.sessionId === sessionId) {
          openSkillUiRequest(service, request)
        }
      }
    } catch {
      // The host may be restarting or the profile may not expose the route;
      // the next interval retries without disturbing the sidebar.
    } finally {
      running = false
    }
  }

  const timer = globalThis.setInterval(() => void poll(), intervalMs)
  const unsubscribe = service.subscribeState(() => void poll())
  void poll()

  return () => {
    stopped = true
    globalThis.clearInterval(timer)
    unsubscribe()
  }
}
