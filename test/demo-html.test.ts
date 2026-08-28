import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const htmlPath = fileURLToPath(new URL('../views/demo-review/index.html', import.meta.url))
const html = readFileSync(htmlPath, 'utf8')

describe('packaged Demo Skill UI', () => {
  it('contains the identity fields and typed command bridge controls', () => {
    expect(html).toContain('id="session-id"')
    expect(html).toContain('id="skill-id"')
    expect(html).toContain('id="workflow-id"')
    expect(html).toContain("dispatch('demo.increment')")
    expect(html).toContain("dispatch('demo.reset')")
    expect(html).toContain("'/skillui/api/command'")
    expect(html).toContain("'dsh-skillui:visibility'")
  })
})
