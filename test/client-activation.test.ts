import { describe, expect, it } from 'vitest'
import { openSkillUiRequest } from '../src/client/activation.js'
import { formatSkillUiCommandPrompt, isSkillUiCommandEnvelope } from '../src/client/command-bridge.js'
import type { SkillUiIdentity } from '../src/shared/protocol.js'

const identity: SkillUiIdentity = {
  sessionId: 'session-1',
  skillId: 'recruitment',
  workflowId: 'workflow-1',
}

describe('Skill UI activation and command bridge', () => {
  it('opens the sibling Skill UI tab for the calling session', () => {
    const calls: unknown[] = []
    const service = {
      updateTab: (...args: unknown[]) => calls.push(['update', ...args]),
      openTab: (...args: unknown[]) => calls.push(['open', ...args]),
    }

    openSkillUiRequest(service, {
      id: 'request-1',
      ...identity,
      title: '招聘工作台',
      entryPath: '/skillui/views/recruitment/index.html',
      commands: ['position.pause'],
    })

    expect(calls).toEqual([
      ['update', 'dsh-skillui:skill-ui', expect.objectContaining({ title: '招聘工作台' })],
      ['open', expect.objectContaining({
        type: 'dsh-skillui:skill-ui',
        path: '/skillui/views/recruitment/index.html',
        meta: expect.objectContaining({ skillId: 'recruitment', workflowId: 'workflow-1' }),
      }), { sessionId: 'session-1' }],
    ])
  })

  it('accepts a command envelope and turns it into a session-scoped prompt', () => {
    const message = {
      type: 'dsh-skillui:command',
      identity,
      command: { type: 'position.pause', requestId: 'request-2', payload: { positionId: 'p-1' } },
    }

    expect(isSkillUiCommandEnvelope(message)).toBe(true)
    expect(formatSkillUiCommandPrompt(message)).toContain('position.pause')
    expect(formatSkillUiCommandPrompt(message)).toContain('p-1')
    expect(isSkillUiCommandEnvelope({ ...message, identity: { ...identity, sessionId: '' } })).toBe(false)
  })
})
