import type { RelateList } from '@nokto-labs/relate'

export interface ListRow {
  id: string
  name: string
  object_slug: string
  type: string
  filter: string | null
  created_at: number
  updated_at: number
}

export function rowToList(row: ListRow): RelateList {
  return {
    id: row.id,
    name: row.name,
    object: row.object_slug,
    type: row.type as 'static' | 'dynamic',
    filter: row.filter ? JSON.parse(row.filter) as Record<string, unknown> : undefined,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  }
}
