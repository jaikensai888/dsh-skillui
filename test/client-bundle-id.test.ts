import { readFileSync } from 'node:fs'
import { describe, expect, test } from 'vitest'

function readLoaderId(fileName: string): string {
  const source = readFileSync(new URL(`../lib/${fileName}`, import.meta.url), 'utf8')
  const match = source.match(/window\.\__ModuleLoader__\.load\(\{\s*id:\s*["']([^"']+)/)
  const id = match?.[1]
  if (!id) throw new Error(`${fileName} does not contain a ModuleLoader registration`)
  return id
}

function readBundle(fileName: string): string {
  return readFileSync(new URL(`../lib/${fileName}`, import.meta.url), 'utf8')
}

describe('client bundle registrations', () => {
  test('client.js registers under the package name used by dsh.client', () => {
    expect(readLoaderId('client.js')).toBe('dsh-skillui')
  })

  test('client-registry.js keeps the legacy external plugin id', () => {
    expect(readLoaderId('client-registry.js')).toBe('dsh-external/dsh-skillui')
  })

  test('client bundles include the session-scoped Skill UI activation polling', () => {
    for (const fileName of ['client.js', 'client-registry.js']) {
      const source = readBundle(fileName)
      expect(source).toContain('/skillui/api/open?sessionId=')
      expect(source).toContain('subscribeState')
    }
  })
})
