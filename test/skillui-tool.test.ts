import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { SkillUiOpenRegistry } from '../src/host/open-registry.js'
import { SkillUiRegistry } from '../src/host/skill-registry.js'
import { registerSkillUiOpenTool } from '../src/host/tool.js'

const temporaryDirectories: string[] = []

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map(path => rm(path, { recursive: true, force: true })))
})

describe('skillui_open tool', () => {
  it('binds activation to the initiating session and exposes JSON-schema parameters', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-skillui-tool-'))
    temporaryDirectories.push(root)
    await mkdir(join(root, 'recruitment', 'skillui'), { recursive: true })
    await mkdir(join(root, 'recruitment', 'views'), { recursive: true })
    await writeFile(join(root, 'recruitment', 'skillui', 'manifest.json'), JSON.stringify({
      schemaVersion: 1,
      skillId: 'recruitment',
      title: '招聘工作台',
      entry: 'views/index.html',
    }))
    await writeFile(join(root, 'recruitment', 'views', 'index.html'), '<h1>招聘</h1>')

    const registry = new SkillUiRegistry([root])
    await registry.refresh()
    const opens = new SkillUiOpenRegistry()
    let tool: { parameters: Record<string, unknown>; output: { schema: Record<string, unknown> }; execute: (args: unknown, exec: unknown) => Promise<unknown> } | undefined
    const ctx = {
      tools: {
        register(value: typeof tool extends infer T ? T : never) {
          tool = value as typeof tool
          return () => undefined
        },
      },
    }

    registerSkillUiOpenTool(ctx as never, registry, opens)

    expect(tool?.parameters).toMatchObject({ type: 'object', required: ['skillId'] })
    expect(tool?.output.schema).toMatchObject({ type: 'object', required: ['skillId', 'workflowId', 'title', 'delivered'] })

    const result = await tool?.execute(
      { skillId: 'recruitment', workflowId: 'workflow-1' },
      { signal: { throwIfAborted() {} }, agent: { session: { id: 'session-1' } } },
    )
    expect(result).toMatchObject({ skillId: 'recruitment', workflowId: 'workflow-1', delivered: false })
    expect(opens.take('session-1')).toHaveLength(1)
  })
})
