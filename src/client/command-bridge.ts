import {
  isSkillUiCommandEnvelope as isProtocolCommandEnvelope,
  type SkillUiCommandEnvelope,
} from '../shared/protocol.js'

export { type SkillUiCommandEnvelope }

export function isSkillUiCommandEnvelope(value: unknown): value is SkillUiCommandEnvelope {
  return isProtocolCommandEnvelope(value)
}

function serializePayload(payload: unknown): string {
  if (payload === undefined) return '{}'
  try {
    const serialized = JSON.stringify(payload)
    return serialized === undefined ? '{}' : serialized
  } catch {
    return '{}'
  }
}

/**
 * Converts a UI event into an ordinary queued session prompt.  The Skill
 * remains the authority that interprets the command and writes its data.
 */
export function formatSkillUiCommandPrompt(value: unknown): string {
  if (!isSkillUiCommandEnvelope(value)) throw new Error('invalid Skill UI command envelope')
  const message = value
  return [
    '[DSH Skill UI command]',
    `skillId: ${message.identity.skillId}`,
    `workflowId: ${message.identity.workflowId}`,
    `command: ${message.command.type}`,
    `payload: ${serializePayload(message.command.payload)}`,
    'Handle this command according to the installed Skill and return the updated state.',
  ].join('\n')
}

export type SkillUiPromptSession = {
  prompt(
    content: readonly [{ type: 'text'; text: string }],
    mode: 'queue' | 'steer',
    signal?: AbortSignal,
    requestId?: string,
  ): Promise<unknown>
}

export type SkillUiSessionBindings = {
  binding?(sessionId: string): { session?: SkillUiPromptSession } | undefined
}

export type SkillUiCommandResult =
  | { ok: true }
  | { ok: false; error: string }

function promptError(value: unknown): string | undefined {
  if (typeof value !== 'object' || value === null) return undefined
  const candidate = value as { ok?: unknown; error?: unknown }
  if (candidate.ok !== false) return undefined
  if (typeof candidate.error === 'string') return candidate.error
  if (typeof candidate.error === 'object' && candidate.error !== null) {
    const message = (candidate.error as { message?: unknown }).message
    if (typeof message === 'string' && message !== '') return message
  }
  return 'session rejected the Skill UI command'
}

/** Submit a validated UI command to the session that owns the current tab. */
export async function submitSkillUiCommand(
  sessions: SkillUiSessionBindings,
  message: SkillUiCommandEnvelope,
): Promise<SkillUiCommandResult> {
  const session = sessions.binding?.(message.identity.sessionId)?.session
  if (session === undefined) return { ok: false, error: 'session_not_found' }

  try {
    const result = await session.prompt(
      [{ type: 'text', text: formatSkillUiCommandPrompt(message) }],
      'queue',
    )
    const error = promptError(result)
    return error === undefined ? { ok: true } : { ok: false, error }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  }
}
