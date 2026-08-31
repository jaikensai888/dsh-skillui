import { DEMO_HTML_PATH, DEMO_SKILL_ID, identityKey, type SkillUiIdentity } from '../shared/protocol.js'

export type SkillUiTabMeta = {
  skillId?: string
  workflowId?: string
  entryPath?: string
  commands?: readonly string[]
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

export function resolveSkillUiIdentity(sessionId: string, meta?: unknown): SkillUiIdentity {
  const candidate = typeof meta === 'object' && meta !== null ? meta as Record<string, unknown> : {}
  const skillId = isNonEmptyString(candidate.skillId) ? candidate.skillId : DEMO_SKILL_ID
  const workflowId = isNonEmptyString(candidate.workflowId) ? candidate.workflowId : `demo:${sessionId}`
  return { sessionId, skillId, workflowId }
}

export function resolveSkillUiEntryPath(meta?: unknown): string {
  const candidate = typeof meta === 'object' && meta !== null ? meta as Record<string, unknown> : {}
  if (
    isNonEmptyString(candidate.entryPath)
    && candidate.entryPath.startsWith('/skillui/views/')
    && !candidate.entryPath.includes('..')
  ) {
    return candidate.entryPath
  }
  return DEMO_HTML_PATH
}

export function resolveSkillUiCommands(meta?: unknown): readonly string[] {
  const candidate = typeof meta === 'object' && meta !== null ? meta as Record<string, unknown> : {}
  if (!Array.isArray(candidate.commands)) return []
  return candidate.commands.filter((command): command is string => (
    typeof command === 'string' && command.trim().length > 0
  ))
}

export function buildSkillUiUrl(identity: SkillUiIdentity, entryPath = DEMO_HTML_PATH): string {
  const query = new URLSearchParams({
    sessionId: identity.sessionId,
    skillId: identity.skillId,
    workflowId: identity.workflowId,
  })
  return `${entryPath}?${query.toString()}`
}

export function skillUiFrameMessage(identity: SkillUiIdentity, visible: boolean): {
  type: 'dsh-skillui:visibility'
  identityKey: string
  visible: boolean
} {
  return {
    type: 'dsh-skillui:visibility',
    identityKey: identityKey(identity),
    visible,
  }
}
