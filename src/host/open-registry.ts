import { randomUUID } from 'node:crypto'
import type { SkillUiOpenRequest } from '../shared/protocol.js'

export type SkillUiOpenRequestInput = Omit<SkillUiOpenRequest, 'id'> & { id?: string }

/**
 * Host-side queue used by the `skillui_open` tool and the browser client.
 * Requests are consumed by the polling client exactly once.
 */
export class SkillUiOpenRegistry {
  private readonly pending = new Map<string, SkillUiOpenRequest[]>()

  enqueue(input: SkillUiOpenRequestInput): SkillUiOpenRequest {
    const request: SkillUiOpenRequest = {
      ...input,
      id: input.id ?? randomUUID(),
      commands: [...input.commands],
    }
    const queue = this.pending.get(request.sessionId) ?? []
    const duplicate = queue.findIndex(item => (
      item.skillId === request.skillId && item.workflowId === request.workflowId
    ))
    if (duplicate >= 0) queue.splice(duplicate, 1)
    queue.push(request)
    this.pending.set(request.sessionId, queue)
    return request
  }

  take(sessionId: string): SkillUiOpenRequest[] {
    const requests = this.pending.get(sessionId) ?? []
    this.pending.delete(sessionId)
    return requests
  }

  drainAll(): void {
    this.pending.clear()
  }

  dispose(): void {
    this.pending.clear()
  }
}
