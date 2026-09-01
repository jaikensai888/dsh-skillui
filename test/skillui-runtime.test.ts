import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { SkillUiOpenRegistry } from '../src/host/open-registry.js'
import { SkillUiRegistry } from '../src/host/skill-registry.js'
import { handleSkillUiRequestAsync, type SkillUiHttpRequest } from '../src/host/http.js'
import type { SkillUiIdentity } from '../src/shared/protocol.js'

const temporaryDirectories: string[] = []
const identity: SkillUiIdentity = {
  sessionId: 'session-recruitment',
  skillId: 'recruitment',
  workflowId: 'workflow-1',
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map(path => rm(path, { recursive: true, force: true })))
})

function request(input: Partial<SkillUiHttpRequest>): SkillUiHttpRequest {
  return {
    method: 'GET',
    pathname: '/skillui/api/state',
    query: new URLSearchParams(),
    ...input,
  }
}

describe('generic Skill UI runtime', () => {
  it('rediscovers a Skill installed after the initial startup scan', async () => {
    const skillRoot = await mkdtemp(join(tmpdir(), 'dsh-skillui-late-skill-'))
    const workspaceRoot = await mkdtemp(join(tmpdir(), 'dsh-skillui-late-workspace-'))
    temporaryDirectories.push(skillRoot, workspaceRoot)

    const registry = new SkillUiRegistry([skillRoot])
    await registry.refresh()

    await mkdir(join(skillRoot, 'recruitment', 'skillui'), { recursive: true })
    await mkdir(join(skillRoot, 'recruitment', 'views'), { recursive: true })
    await mkdir(join(workspaceRoot, '.dsh', 'data', 'recruitment'), { recursive: true })
    await writeFile(join(skillRoot, 'recruitment', 'skillui', 'manifest.json'), JSON.stringify({
      schemaVersion: 1,
      skillId: 'recruitment',
      title: '招聘工作台',
      entry: 'views/index.html',
      state: {
        mode: 'workspace-json',
        root: '.dsh/data/recruitment',
        files: { positions: 'positions.json' },
      },
    }))
    await writeFile(join(skillRoot, 'recruitment', 'views', 'index.html'), '<h1>招聘 View</h1>')
    await writeFile(join(workspaceRoot, '.dsh', 'data', 'recruitment', 'positions.json'), '[{"id":"p-1"}]')

    const view = await handleSkillUiRequestAsync(
      request({ pathname: '/skillui/views/recruitment/index.html' }),
      undefined,
      '<!doctype html>',
      { registry },
    )
    expect(view.status).toBe(200)
    expect(view.body).toContain('招聘 View')

    const state = await handleSkillUiRequestAsync(
      request({
        pathname: '/skillui/api/state',
        query: new URLSearchParams(identity),
      }),
      undefined,
      '<!doctype html>',
      { registry, resolveSessionCwd: () => workspaceRoot },
    )
    expect(state.status).toBe(200)
    expect(JSON.parse(state.body)).toMatchObject({ data: { positions: [{ id: 'p-1' }] } })
  })

  it('serves an installed Skill view and its workspace projection', async () => {
    const skillRoot = await mkdtemp(join(tmpdir(), 'dsh-skillui-skill-'))
    const workspaceRoot = await mkdtemp(join(tmpdir(), 'dsh-skillui-workspace-'))
    temporaryDirectories.push(skillRoot, workspaceRoot)
    await mkdir(join(skillRoot, 'recruitment', 'skillui'), { recursive: true })
    await mkdir(join(skillRoot, 'recruitment', 'views'), { recursive: true })
    await mkdir(join(workspaceRoot, '.dsh', 'data', 'recruitment', 'resumes', 'cand-1'), { recursive: true })
    await writeFile(join(skillRoot, 'recruitment', 'skillui', 'manifest.json'), JSON.stringify({
      schemaVersion: 1,
      skillId: 'recruitment',
      title: '招聘工作台',
      entry: 'views/index.html',
      state: {
        mode: 'workspace-json',
        root: '.dsh/data/recruitment',
        files: { positions: 'positions.json', candidates: 'candidates.json' },
      },
      resources: {
        root: '.dsh/data/recruitment',
        allow: ['resumes/**'],
      },
    }))
    await writeFile(join(skillRoot, 'recruitment', 'views', 'index.html'), '<h1>招聘 View</h1>')
    await writeFile(join(workspaceRoot, '.dsh', 'data', 'recruitment', 'positions.json'), '[{"id":"p-1"}]')
    await writeFile(join(workspaceRoot, '.dsh', 'data', 'recruitment', 'candidates.json'), '[]')
    await writeFile(join(workspaceRoot, '.dsh', 'data', 'recruitment', 'resumes', 'cand-1', '1.png'), Buffer.from([1, 2, 3]))

    const registry = new SkillUiRegistry([skillRoot])
    await registry.refresh()
    const response = await handleSkillUiRequestAsync(
      request({
        pathname: '/skillui/api/state',
        query: new URLSearchParams(identity),
      }),
      undefined,
      '<!doctype html>',
      {
        registry,
        resolveSessionCwd: () => workspaceRoot,
      },
    )

    expect(response.status).toBe(200)
    expect(JSON.parse(response.body)).toMatchObject({
      identity,
      data: { positions: [{ id: 'p-1' }], candidates: [] },
    })

    const view = await handleSkillUiRequestAsync(
      request({ pathname: '/skillui/views/recruitment/index.html' }),
      undefined,
      '<!doctype html>',
      { registry },
    )
    expect(view.status).toBe(200)
    expect(view.body).toContain('招聘 View')

    const resource = await handleSkillUiRequestAsync(
      request({
        pathname: '/skillui/api/resource/recruitment/resumes/cand-1/1.png',
        query: new URLSearchParams(identity),
      }),
      undefined,
      '<!doctype html>',
      { registry, resolveSessionCwd: () => workspaceRoot },
    )
    expect(resource.status).toBe(200)
    expect(resource.headers['content-type']).toBe('image/png')
    expect([...new Uint8Array(resource.binary ?? [])]).toEqual([1, 2, 3])

    const deniedResource = await handleSkillUiRequestAsync(
      request({
        pathname: '/skillui/api/resource/recruitment/positions.json',
        query: new URLSearchParams(identity),
      }),
      undefined,
      '<!doctype html>',
      { registry, resolveSessionCwd: () => workspaceRoot },
    )
    expect(deniedResource.status).toBe(404)
  })

  it('returns queued open requests once for the target session', async () => {
    const opens = new SkillUiOpenRegistry()
    opens.enqueue({
      sessionId: identity.sessionId,
      skillId: identity.skillId,
      workflowId: identity.workflowId,
      title: '招聘工作台',
      entryPath: '/skillui/views/recruitment/index.html',
      commands: ['position.pause'],
    })

    const first = await handleSkillUiRequestAsync(
      request({
        pathname: '/skillui/api/open',
        query: new URLSearchParams({ sessionId: identity.sessionId }),
      }),
      undefined,
      '<!doctype html>',
      { openRegistry: opens },
    )
    const second = await handleSkillUiRequestAsync(
      request({
        pathname: '/skillui/api/open',
        query: new URLSearchParams({ sessionId: identity.sessionId }),
      }),
      undefined,
      '<!doctype html>',
      { openRegistry: opens },
    )

    expect(JSON.parse(first.body).requests).toHaveLength(1)
    expect(JSON.parse(second.body).requests).toEqual([])
  })

  it('keeps the latest Skill binding available for a manually opened tab', async () => {
    const opens = new SkillUiOpenRegistry()
    opens.enqueue({
      sessionId: identity.sessionId,
      skillId: identity.skillId,
      workflowId: identity.workflowId,
      title: '招聘工作台',
      entryPath: '/skillui/views/recruitment/index.html',
      commands: ['position.pause'],
    })

    const consumed = await handleSkillUiRequestAsync(
      request({
        pathname: '/skillui/api/open',
        query: new URLSearchParams({ sessionId: identity.sessionId }),
      }),
      undefined,
      '<!doctype html>',
      { openRegistry: opens },
    )
    expect(JSON.parse(consumed.body).requests).toHaveLength(1)

    const current = await handleSkillUiRequestAsync(
      request({
        pathname: '/skillui/api/current',
        query: new URLSearchParams({ sessionId: identity.sessionId }),
      }),
      undefined,
      '<!doctype html>',
      { openRegistry: opens },
    )

    expect(current.status).toBe(200)
    expect(JSON.parse(current.body)).toMatchObject({
      request: {
        sessionId: identity.sessionId,
        skillId: identity.skillId,
        workflowId: identity.workflowId,
        entryPath: '/skillui/views/recruitment/index.html',
      },
    })
  })
})
