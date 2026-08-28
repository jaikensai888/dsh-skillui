import { describe, expect, it } from 'vitest'
import { DemoStore } from '../src/host/demo-store.js'
import { handleSkillUiRequest, type SkillUiHttpRequest } from '../src/host/http.js'
import type { SkillUiIdentity } from '../src/shared/protocol.js'

const identity: SkillUiIdentity = {
  sessionId: 'session-1',
  skillId: 'demo-review',
  workflowId: 'workflow-1',
}

function request(input: Partial<SkillUiHttpRequest>): SkillUiHttpRequest {
  return {
    method: 'GET',
    pathname: '/skillui/api/state',
    query: new URLSearchParams(),
    ...input,
  }
}

describe('Skill UI HTTP bridge', () => {
  it('serves only the registered demo HTML entry', () => {
    const response = handleSkillUiRequest(
      request({ pathname: '/skillui/views/demo-review/index.html' }),
      new DemoStore(),
      '<!doctype html><title>Demo</title>',
    )

    expect(response.status).toBe(200)
    expect(response.headers['content-type']).toContain('text/html')
    expect(response.body).toContain('<title>Demo</title>')

    expect(
      handleSkillUiRequest(
        request({ pathname: '/skillui/views/../../secrets.html' }),
        new DemoStore(),
        '<!doctype html>',
      ).status,
    ).toBe(404)
  })

  it('returns state and applies a typed command within one session/workflow', () => {
    const store = new DemoStore()
    const query = new URLSearchParams(identity)

    const initial = handleSkillUiRequest(
      request({ query }),
      store,
      '<!doctype html>',
    )
    expect(initial.status).toBe(200)
    expect(JSON.parse(initial.body)).toMatchObject({ count: 0, identity })

    const changed = handleSkillUiRequest(
      request({
        method: 'POST',
        pathname: '/skillui/api/command',
        body: {
          identity,
          command: { type: 'demo.increment', requestId: 'req-1' },
        },
      }),
      store,
      '<!doctype html>',
    )
    expect(changed.status).toBe(200)
    expect(JSON.parse(changed.body)).toMatchObject({ count: 1, lastCommand: 'demo.increment' })

    const refreshed = handleSkillUiRequest(request({ query }), store, '<!doctype html>')
    expect(JSON.parse(refreshed.body)).toMatchObject({ count: 1 })
  })

  it('rejects malformed or unsupported commands', () => {
    const store = new DemoStore()

    expect(
      handleSkillUiRequest(
        request({
          method: 'POST',
          pathname: '/skillui/api/command',
          body: { identity, command: { type: 'demo.delete', requestId: 'req-2' } },
        }),
        store,
        '<!doctype html>',
      ).status,
    ).toBe(400)

    expect(
      handleSkillUiRequest(
        request({
          method: 'POST',
          pathname: '/skillui/api/command',
          body: { identity: { ...identity, sessionId: '' }, command: { type: 'demo.reset', requestId: 'req-3' } },
        }),
        store,
        '<!doctype html>',
      ).status,
    ).toBe(400)
  })

  it('is idempotent for a repeated request id', () => {
    const store = new DemoStore()
    const commandRequest = request({
      method: 'POST',
      pathname: '/skillui/api/command',
      body: { identity, command: { type: 'demo.increment', requestId: 'same-request' } },
    })

    handleSkillUiRequest(commandRequest, store, '<!doctype html>')
    const repeated = handleSkillUiRequest(commandRequest, store, '<!doctype html>')

    expect(JSON.parse(repeated.body)).toMatchObject({ count: 1 })
    expect(store.eventsFor(identity)).toHaveLength(1)
  })
})
