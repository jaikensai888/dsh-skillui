import type { Context } from '@deepseek-ai/cordis'
import { SkillUiOpenRegistry } from './open-registry.js'
import { SkillUiRegistry } from './skill-registry.js'

type SkillUiToolExec = {
  signal: { throwIfAborted(): void }
  agent?: { session: { id: string } }
}

type SkillUiTool = {
  name: string
  description: string
  parameters: Record<string, unknown>
  output: {
    schema: Record<string, unknown>
    render: (_args: unknown, value: unknown) => Array<{ type: 'text'; text: string }>
  }
  execute: (args: unknown, exec: SkillUiToolExec) => Promise<unknown>
}

type SkillUiToolService = {
  register(tool: SkillUiTool): () => void
}

export type SkillUiToolContext = Context & {
  tools: SkillUiToolService
}

function recordValue(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

function requiredString(args: unknown, key: string): string {
  const value = recordValue(args)[key]
  if (typeof value !== 'string' || value.trim() === '') throw new Error(`${key} is required`)
  return value.trim()
}

function optionalString(args: unknown, key: string): string | undefined {
  const value = recordValue(args)[key]
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined
}

function sessionIdOf(exec: SkillUiToolExec): string {
  const sessionId = exec.agent?.session.id
  if (typeof sessionId !== 'string' || sessionId.trim() === '') {
    throw new Error('skillui_open requires an initiating agent session')
  }
  return sessionId
}

function textRender(_args: unknown, value: unknown): Array<{ type: 'text'; text: string }> {
  const result = recordValue(value)
  const title = typeof result.title === 'string' ? result.title : 'Skill UI'
  const skillId = typeof result.skillId === 'string' ? result.skillId : 'unknown'
  const delivered = result.delivered === true
  return [{
    type: 'text',
    text: delivered
      ? `Opened ${title} (${skillId}) in the Skill UI tab.`
      : `Queued ${title} (${skillId}) for the calling session's Skill UI tab.`,
  }]
}

/** Register the one generic model-facing activation tool. */
export function registerSkillUiOpenTool(
  ctx: SkillUiToolContext,
  registry: SkillUiRegistry,
  opens: SkillUiOpenRegistry,
): () => void {
  return ctx.tools.register({
    name: 'skillui_open',
    description:
      'Open the installed Skill UI view in the Skill UI sidebar tab for the calling session. '
      + 'Call this once when a Skill UI-capable workflow starts or when the user asks to view the workbench. '
      + 'The Skill ID must be the installed Skill directory id (for example, recruitment). '
      + 'The Skill owns the business workflow and data; this tool only activates its declared HTML view.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        skillId: {
          type: 'string',
          description: 'Installed Skill id, for example recruitment.',
        },
        workflowId: {
          type: 'string',
          description: 'Stable id for the current Skill workflow.',
        },
        title: {
          type: 'string',
          description: 'Optional tab title. Defaults to the manifest title.',
        },
      },
      required: ['skillId'],
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          skillId: { type: 'string' },
          workflowId: { type: 'string' },
          title: { type: 'string' },
          delivered: { type: 'boolean' },
        },
        required: ['skillId', 'workflowId', 'title', 'delivered'],
      },
      render: textRender,
    },
    execute: async (args, exec) => {
      exec.signal.throwIfAborted()
      const sessionId = sessionIdOf(exec)
      const skillId = requiredString(args, 'skillId')
      await registry.waitForReady()
      let definition = registry.get(skillId)
      if (definition === undefined) {
        // Skills can be installed while DSH is running. Refresh only on a
        // miss so the normal path remains a cheap in-memory lookup.
        await registry.refresh()
        definition = registry.get(skillId)
      }
      if (definition === undefined) throw new Error(`Skill UI manifest not found for "${skillId}"`)

      const workflowId = optionalString(args, 'workflowId') ?? `${skillId}:${sessionId}`
      const title = optionalString(args, 'title') ?? definition.manifest.title
      opens.enqueue({
        sessionId,
        skillId,
        workflowId,
        title,
        entryPath: definition.entryPath,
        commands: definition.manifest.commands ?? [],
      })
      return {
        skillId,
        workflowId,
        title,
        delivered: false,
      }
    },
  })
}
