import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { SkillUiRegistry } from '../src/host/skill-registry.js'

const temporaryDirectories: string[] = []

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map(path => rm(path, { recursive: true, force: true })))
})

async function makeSkillRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'dsh-skillui-'))
  temporaryDirectories.push(root)
  return root
}

describe('Skill UI registry', () => {
  it('discovers a standard installed Skill and resolves its public entry', async () => {
    const root = await makeSkillRoot()
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

    const definition = registry.get('recruitment')
    expect(definition?.manifest.title).toBe('招聘工作台')
    expect(definition?.entryPath).toBe('/skillui/views/recruitment/index.html')

    const asset = await registry.readView('recruitment', 'index.html')
    expect(asset?.body).toContain('<h1>招聘</h1>')
  })

  it('skips a manifest whose entry escapes the Skill directory', async () => {
    const root = await makeSkillRoot()
    await mkdir(join(root, 'unsafe', 'skillui'), { recursive: true })
    await writeFile(join(root, 'unsafe', 'skillui', 'manifest.json'), JSON.stringify({
      schemaVersion: 1,
      skillId: 'unsafe',
      title: 'Unsafe',
      entry: 'views/../outside.html',
    }))

    const registry = new SkillUiRegistry([root])
    await registry.refresh()

    expect(registry.get('unsafe')).toBeUndefined()
  })
})
