import { describe, expect, it } from 'vitest'
import {
  createInitialDemoState,
  reduceDemoState,
  type DemoEvent,
} from '../src/host/demo-reducer.js'
import type { SkillUiIdentity } from '../src/shared/protocol.js'

const identity: SkillUiIdentity = {
  sessionId: 'session-1',
  skillId: 'demo-review',
  workflowId: 'workflow-1',
}

describe('Demo Skill projection reducer', () => {
  it('creates a zero-count state for an identity', () => {
    expect(createInitialDemoState(identity)).toEqual({
      version: 1,
      identity,
      count: 0,
    })
  })

  it('folds increment events without mutating the previous state', () => {
    const initial = createInitialDemoState(identity)
    const event: DemoEvent = {
      type: 'demo.increment',
      identity,
      requestId: 'req-1',
    }

    expect(reduceDemoState(initial, event)).toEqual({
      ...initial,
      count: 1,
      lastCommand: 'demo.increment',
    })
    expect(initial.count).toBe(0)
  })

  it('folds reset events', () => {
    const state = {
      ...createInitialDemoState(identity),
      count: 4,
      lastCommand: 'demo.increment' as const,
    }

    expect(
      reduceDemoState(state, {
        type: 'demo.reset',
        identity,
        requestId: 'req-2',
      }),
    ).toEqual({
      ...state,
      count: 0,
      lastCommand: 'demo.reset',
    })
  })

  it('ignores events from another session/workflow identity', () => {
    const state = createInitialDemoState(identity)

    expect(
      reduceDemoState(state, {
        type: 'demo.increment',
        identity: { ...identity, workflowId: 'other-workflow' },
        requestId: 'req-3',
      }),
    ).toBe(state)
  })
})
