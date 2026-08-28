import { describe, expect, it } from 'vitest'
import {
  buildSkillUiUrl,
  resolveSkillUiIdentity,
  type SkillUiTabMeta,
} from '../src/client/contract.js'
import { createSkillUiTabDescriptor, inject } from '../src/client/index.js'

describe('Skill UI client contract', () => {
  it('uses the sidebar session as the default UI identity', () => {
    expect(resolveSkillUiIdentity('session-1')).toEqual({
      sessionId: 'session-1',
      skillId: 'demo-review',
      workflowId: 'demo:session-1',
    })
  })

  it('honors JSON-serializable tab metadata for a specific Skill workflow', () => {
    const meta: SkillUiTabMeta = {
      skillId: 'recruitment',
      workflowId: 'candidate-screening-1',
    }

    expect(resolveSkillUiIdentity('session-2', meta)).toEqual({
      sessionId: 'session-2',
      skillId: 'recruitment',
      workflowId: 'candidate-screening-1',
    })
  })

  it('encodes identity into the iframe entry URL', () => {
    const url = new URL(
      buildSkillUiUrl({
        sessionId: 'session 3',
        skillId: 'demo-review',
        workflowId: 'workflow/3',
      }),
      'http://localhost',
    )

    expect(url.pathname).toBe('/skillui/views/demo-review/index.html')
    expect(Object.fromEntries(url.searchParams)).toEqual({
      sessionId: 'session 3',
      skillId: 'demo-review',
      workflowId: 'workflow/3',
    })
  })

  it('registers one sibling tab through the better-sidebar service contract', () => {
    const descriptor = createSkillUiTabDescriptor()

    expect(inject).toEqual(['betterSidebar'])
    expect(descriptor).toMatchObject({
      id: 'dsh-skillui:skill-ui',
      title: 'Skill UI',
      order: 60,
      single: true,
    })
    expect(descriptor.component).toEqual(expect.any(Function))
  })
})
