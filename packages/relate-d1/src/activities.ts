import { type Activity, type TrackActivityInput, type ListActivitiesOptions, ValidationError } from '@nokto-labs/relate'
import type { D1Database } from './d1-types'
import { normalizeNonNegativeInteger } from './pagination'

interface ActivityRow {
  id: string
  record_id: string
  object_slug: string
  type: string
  data: string
  occurred_at: number
  created_at: number
}

function rowToActivity(row: ActivityRow): Activity {
  return {
    id: row.id,
    record: { object: row.object_slug, id: row.record_id },
    type: row.type,
    metadata: JSON.parse(row.data) as Record<string, unknown>,
    occurredAt: new Date(row.occurred_at),
    createdAt: new Date(row.created_at),
  }
}

export async function trackActivity(
  db: D1Database,
  input: TrackActivityInput,
): Promise<Activity> {
  const id = crypto.randomUUID()
  const now = Date.now()
  if (input.occurredAt && Number.isNaN(input.occurredAt.getTime())) {
    throw new ValidationError({ message: 'Invalid occurredAt: expected a valid Date', field: 'occurredAt' })
  }
  const occurredAt = input.occurredAt?.getTime() ?? now

  await db
    .prepare(
      `INSERT INTO relate_activities
        (id, record_id, object_slug, type, data, occurred_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      id,
      input.record.id,
      input.record.object,
      input.type,
      JSON.stringify(input.metadata ?? {}),
      occurredAt,
      now,
    )
    .run()

  return {
    id,
    record: input.record,
    type: input.type,
    metadata: input.metadata ?? {},
    occurredAt: new Date(occurredAt),
    createdAt: new Date(now),
  }
}

export async function listActivities(
  db: D1Database,
  ref?: { object: string; id: string },
  options?: ListActivitiesOptions,
): Promise<Activity[]> {
  const clauses: string[] = []
  const bindings: unknown[] = []

  if (ref) {
    clauses.push('record_id = ?', 'object_slug = ?')
    bindings.push(ref.id, ref.object)
  }

  if (options?.type) {
    clauses.push('type = ?')
    bindings.push(options.type)
  }

  if (options?.before) {
    clauses.push('occurred_at < ?')
    bindings.push(options.before.getTime())
  }

  const where = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : ''
  let sql = `SELECT * FROM relate_activities ${where} ORDER BY occurred_at DESC`
  const limit = normalizeNonNegativeInteger(options?.limit, 'limit')
  const offset = normalizeNonNegativeInteger(options?.offset, 'offset')

  if (limit !== undefined) {
    sql += ' LIMIT ?'
    bindings.push(limit)
  }

  if (offset !== undefined) {
    sql += ' OFFSET ?'
    bindings.push(offset)
  }

  const result = await db.prepare(sql).bind(...bindings).all<ActivityRow>()
  return result.results.map(rowToActivity)
}
