import { describe, expect, it } from 'vitest'
import {
  DEMO_SKILL_ID,
  SKILL_UI_TAB_ID,
  identityKey,
  isSkillUiCommand,
  isSkillUiIdentity,
} from '../src/shared/protocol.js'

describe('Skill UI protocol', () => {
  it('keeps stable plugin and demo identifiers', () => {
    expect(SKILL_UI_TAB_ID).toBe('dsh-skillui:skill-ui')
    expect(DEMO_SKILL_ID).toBe('demo-review')
  })

  it('validates a complete session-scoped identity', () => {
    const identity = {
      sessionId: 'session-1',
      skillId: 'recruitment',
      workflowId: 'workflow-1',
    }

    expect(isSkillUiIdentity(identity)).toBe(true)
    expect(identityKey(identity)).toBe('session-1/recruitment/workflow-1')
    expect(isSkillUiIdentity({ ...identity, workflowId: 1 })).toBe(false)
    expect(isSkillUiIdentity({ ...identity, sessionId: '' })).toBe(false)
  })

  it('accepts only typed demo commands', () => {
    expect(isSkillUiCommand({ type: 'demo.increment', requestId: 'req-1' })).toBe(true)
    expect(isSkillUiCommand({ type: 'demo.reset', requestId: 'req-2' })).toBe(true)
    expect(isSkillUiCommand({ type: 'demo.delete', requestId: 'req-3' })).toBe(false)
    expect(isSkillUiCommand({ type: 'demo.increment', requestId: '' })).toBe(false)
  })
})
