import {
  identityKey,
  type SkillUiCommand,
  type SkillUiIdentity,
  type SkillUiState,
} from '../shared/protocol.js'
import { createInitialDemoState, reduceDemoState, type DemoEvent } from './demo-reducer.js'

/**
 * A small event-log adapter for the MVP.
 *
 * The reducer is deliberately independent from this store. A production Skill
 * can replace this adapter with a DSH Session Projection backed by
 * `Session.append` without changing the browser protocol or the Sidebar tab.
 */
export class DemoStore {
  private readonly eventLog = new Map<string, DemoEvent[]>()
  private readonly requestIds = new Map<string, Set<string>>()

  getState(identity: SkillUiIdentity): SkillUiState {
    const events = this.eventsFor(identity)
    let state = createInitialDemoState(identity)

    for (const event of events) state = reduceDemoState(state, event)
    return state
  }

  dispatch(identity: SkillUiIdentity, command: SkillUiCommand): SkillUiState {
    const key = identityKey(identity)
    const seen = this.requestIds.get(key) ?? new Set<string>()
    if (seen.has(command.requestId)) return this.getState(identity)

    const event: DemoEvent = {
      type: command.type,
      identity,
      requestId: command.requestId,
    }
    const events = this.eventLog.get(key) ?? []
    events.push(event)
    this.eventLog.set(key, events)
    seen.add(command.requestId)
    this.requestIds.set(key, seen)
    return this.getState(identity)
  }

  eventsFor(identity: SkillUiIdentity): readonly DemoEvent[] {
    return [...(this.eventLog.get(identityKey(identity)) ?? [])]
  }
}
