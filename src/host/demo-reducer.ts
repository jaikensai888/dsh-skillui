import type { SkillUiCommandType, SkillUiIdentity, SkillUiState } from '../shared/protocol.js'
import { identityKey } from '../shared/protocol.js'

export type DemoEvent = {
  type: SkillUiCommandType
  identity: SkillUiIdentity
  requestId: string
}

export function createInitialDemoState(identity: SkillUiIdentity): SkillUiState {
  return {
    version: 1,
    identity,
    count: 0,
  }
}

export function reduceDemoState(state: SkillUiState, event: DemoEvent): SkillUiState {
  if (identityKey(state.identity) !== identityKey(event.identity)) return state

  if (event.type === 'demo.reset') {
    return {
      ...state,
      count: 0,
      lastCommand: event.type,
    }
  }

  return {
    ...state,
    count: state.count + 1,
    lastCommand: event.type,
  }
}
