import { describe, expect, it } from 'vitest'
import { apply, inject, name, type SkillUiHostContext } from '../src/index.js'

describe('DSH plugin contract', () => {
  it('declares the host web service and registers a disposable prefix route', () => {
    const routes: Array<{ kind: string; path: string; handler: unknown }> = []
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
    } as unknown as SkillUiHostContext

    expect(name).toBe('dsh-skillui')
    expect(inject).toEqual(['webServer'])

    apply(ctx)
    expect(routes).toHaveLength(1)
    expect(routes[0]).toMatchObject({ kind: 'prefix', path: '/skillui' })
    expect(routes[0]?.handler).toEqual(expect.any(Function))

    cleanup?.()
    expect(routes).toHaveLength(0)
  })
})
