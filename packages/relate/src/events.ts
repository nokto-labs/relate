import type { RelateRecord, ObjectSchema } from './types'

// ─── Event types ─────────────────────────────────────────────────────────────

export interface CreatedEvent<S extends ObjectSchema = ObjectSchema> {
  record: RelateRecord<S>
  db: unknown
}

export interface UpdatedEvent<S extends ObjectSchema = ObjectSchema> {
  record: RelateRecord<S>
  changes: Partial<Record<string, unknown>>
  db: unknown
}

export interface DeletedEvent {
  id: string
  db: unknown
}

export type EventPayload<S extends ObjectSchema = ObjectSchema> =
  | CreatedEvent<S>
  | UpdatedEvent<S>
  | DeletedEvent

export type EventHandler<E> = (event: E) => void | Promise<void>

// ─── Event bus ───────────────────────────────────────────────────────────────

const MAX_DEPTH = 5

export class EventBus {
  private handlers = new Map<string, EventHandler<any>[]>()
  private activeDepthByEvent = new Map<string, number>()

  on(event: string, handler: EventHandler<any>): void {
    const list = this.handlers.get(event) ?? []
    list.push(handler)
    this.handlers.set(event, list)
  }

  off(event: string, handler: EventHandler<any>): void {
    const list = this.handlers.get(event)
    if (!list) return
    const idx = list.indexOf(handler)
    if (idx !== -1) list.splice(idx, 1)
  }

  async emit(event: string, payload: unknown): Promise<void> {
    const list = this.handlers.get(event)
    if (!list || list.length === 0) return

    const depth = this.activeDepthByEvent.get(event) ?? 0
    if (depth >= MAX_DEPTH) {
      console.warn(`[relate] Hook depth limit (${MAX_DEPTH}) reached for "${event}" — skipping to prevent infinite loop`)
      return
    }

    this.activeDepthByEvent.set(event, depth + 1)
    try {
      for (const handler of list) {
        try {
          await Promise.resolve(handler(payload))
        } catch (err) {
          console.error(`[relate] Hook error on "${event}":`, err)
        }
      }
    } finally {
      const nextDepth = (this.activeDepthByEvent.get(event) ?? 1) - 1
      if (nextDepth <= 0) {
        this.activeDepthByEvent.delete(event)
      } else {
        this.activeDepthByEvent.set(event, nextDepth)
      }
    }
  }
}
