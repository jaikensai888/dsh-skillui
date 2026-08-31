import { describe, expect, it } from 'vitest'
import { apply, inject, name, type SkillUiHostContext } from '../src/index.js'

describe('DSH plugin contract', () => {
  it('declares the host web service and registers a disposable prefix route', () => {
    const routes: Array<{ kind: string; path: string; handler: unknown }> = []
    const tools: Array<{ name: string }> = []
    let cleanup: (() => void) | undefined
    const ctx = {
      effect(effect: () => () => void) {
        cleanup = effect()
        return cleanup
      },
      webServer: {
        register(route: { kind: string; path: string; handler: unknown }) {
          routes.push(route)
          return () => routes.splice(routes.indexOf(route), 1)
        },
      },
      sessions: {
        get() {
          return { header: { cwd: process.cwd() } }
        },
      },
      tools: {
        register(tool: { name: string }) {
          tools.push(tool)
          return () => tools.splice(tools.indexOf(tool), 1)
        },
      },
    } as unknown as SkillUiHostContext

    expect(name).toBe('dsh-skillui')
    expect(inject).toEqual(['webServer', 'sessions', 'tools'])

    apply(ctx)
    expect(routes).toHaveLength(1)
    expect(routes[0]).toMatchObject({ kind: 'prefix', path: '/skillui' })
    expect(routes[0]?.handler).toEqual(expect.any(Function))
    expect(tools).toHaveLength(1)
    expect(tools[0]?.name).toBe('skillui_open')

    cleanup?.()
    expect(routes).toHaveLength(0)
    expect(tools).toHaveLength(0)
  })
})
