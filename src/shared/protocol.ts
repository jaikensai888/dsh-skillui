export const SKILL_UI_TAB_ID = 'dsh-skillui:skill-ui'
export const DEMO_SKILL_ID = 'demo-review'
export const DEMO_SKILL_TITLE = 'Demo Skill UI'
export const DEMO_HTML_PATH = `/skillui/views/${DEMO_SKILL_ID}/index.html`

export type SkillUiIdentity = {
  sessionId: string
  skillId: string
  workflowId: string
}

export type SkillUiCommandType = 'demo.increment' | 'demo.reset'

export type SkillUiCommand = {
  type: SkillUiCommandType
  requestId: string
}

export type SkillUiCommandRequest = {
  identity: SkillUiIdentity
  command: SkillUiCommand
}

/** A command emitted by any installed Skill UI view. */
export type SkillUiCommandEnvelope = {
  type: 'dsh-skillui:command'
  identity: SkillUiIdentity
  command: {
    type: string
    requestId: string
    payload?: unknown
  }
}

/** A host→client request to open the generic Skill UI tab. */
export type SkillUiOpenRequest = {
  id: string
  sessionId: string
  skillId: string
  workflowId: string
  title: string
  entryPath: string
  commands: readonly string[]
}

export type SkillUiState = {
  version: 1
  identity: SkillUiIdentity
  count: number
  lastCommand?: SkillUiCommandType
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

export function isSkillUiIdentity(value: unknown): value is SkillUiIdentity {
  return (
    isRecord(value)
    && isNonEmptyString(value.sessionId)
    && isNonEmptyString(value.skillId)
    && isNonEmptyString(value.workflowId)
  )
}

export function isSkillUiCommand(value: unknown): value is SkillUiCommand {
  return (
    isRecord(value)
    && (value.type === 'demo.increment' || value.type === 'demo.reset')
    && isNonEmptyString(value.requestId)
  )
}

export function isSkillUiCommandRequest(value: unknown): value is SkillUiCommandRequest {
  return isRecord(value) && isSkillUiIdentity(value.identity) && isSkillUiCommand(value.command)
}

export function isSkillUiCommandEnvelope(value: unknown): value is SkillUiCommandEnvelope {
  if (!isRecord(value) || value.type !== 'dsh-skillui:command' || !isSkillUiIdentity(value.identity)) return false
  if (!isRecord(value.command)) return false
  return isNonEmptyString(value.command.type) && isNonEmptyString(value.command.requestId)
}

export function identityKey(identity: SkillUiIdentity): string {
  return `${identity.sessionId}/${identity.skillId}/${identity.workflowId}`
}
