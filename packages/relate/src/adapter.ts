import type { RelateRecord, RelateList, Relationship, Activity, SchemaInput, ObjectRef } from './types'

// ─── Find options ────────────────────────────────────────────────────────────

export interface FindRecordsOptions {
  filter?: Record<string, unknown>
  limit?: number
  offset?: number
  orderBy?: string
  order?: 'asc' | 'desc'
  cursor?: string
}

export interface SumAggregateInput {
  field: string
}

export interface AggregateRecordsOptions {
  filter?: Record<string, unknown>
  count?: boolean
  groupBy?: string
  sum?: SumAggregateInput
}

export interface AggregateRecordsResult {
  count?: number
  sum?: number
  groups?: Record<string, number>
}

export interface PaginatedResult<T = RelateRecord> {
  records: T[]
  nextCursor?: string
}

export interface UpsertResult<T = RelateRecord> {
  record: T
  isNew: boolean
}

export interface UpdateRecordMutation {
  type: 'update'
  objectSlug: string
  id: string
  attributes: Record<string, unknown>
  updatedAtMs: number
}

export interface DeleteRecordMutation {
  type: 'delete'
  objectSlug: string
  id: string
}

export interface CleanupRecordRefsMutation {
  type: 'cleanup'
  objectSlug: string
  id: string
}

export type RecordMutation =
  | UpdateRecordMutation
  | DeleteRecordMutation
  | CleanupRecordRefsMutation

// ─── Relationship inputs ─────────────────────────────────────────────────────

export interface CreateRelationshipInput<S extends SchemaInput = SchemaInput> {
  from: ObjectRef<S>
  to: ObjectRef<S>
  type: string
  attributes?: Record<string, unknown>
}

export interface ListRelationshipsOptions {
  type?: string
  limit?: number
}

// ─── Activity inputs ─────────────────────────────────────────────────────────

export interface TrackActivityInput<S extends SchemaInput = SchemaInput> {
  record: ObjectRef<S>
  type: string
  metadata?: Record<string, unknown>
  occurredAt?: Date
}

export interface ListActivitiesOptions {
  type?: string
  limit?: number
  offset?: number
  /** Return only activities that occurred before this date (for cursor pagination) */
  before?: Date
}

// ─── List inputs ─────────────────────────────────────────────────────────────

export interface CreateListInput<S extends SchemaInput = SchemaInput> {
  name: string
  object: Extract<keyof S, string>
  type: 'static' | 'dynamic'
  filter?: Record<string, unknown>
}

export interface ListListsOptions {
  object?: string
  type?: 'static' | 'dynamic'
  limit?: number
  offset?: number
}

export interface ListItemsOptions {
  filter?: Record<string, unknown>
  limit?: number
  offset?: number
  cursor?: string
}

// ─── Migrations ──────────────────────────────────────────────────────────────

export interface Migration {
  /** Unique identifier, e.g. "001_rename_tier_to_level" */
  id: string
  /** Apply the migration */
  up(db: unknown): Promise<void>
}

// ─── Storage adapter ─────────────────────────────────────────────────────────

/**
 * The storage adapter interface. Implement this to support a new database backend.
 * The D1 adapter (`relate/d1`) implements this for Cloudflare D1.
 */
export interface StorageAdapter {
  /** Called by relate() immediately — seeds the schema so record operations work before migrate() */
  setSchema?(schema: SchemaInput): void
  /** Create tables and sync the object schema registry */
  migrate(schema: SchemaInput): Promise<void>
  /** Apply user-defined migrations with tracking */
  applyMigrations?(migrations: Migration[]): Promise<void>

  // Records
  createRecord(objectSlug: string, attributes: Record<string, unknown>): Promise<RelateRecord>
  upsertRecord(objectSlug: string, uniqueBy: string, attributes: Record<string, unknown>): Promise<UpsertResult>
  getRecord(objectSlug: string, id: string): Promise<RelateRecord | null>
  findRecords(objectSlug: string, options?: FindRecordsOptions): Promise<RelateRecord[]>
  findRecordsPage?(objectSlug: string, options?: FindRecordsOptions): Promise<PaginatedResult>
  countRecords(objectSlug: string, filter?: Record<string, unknown>): Promise<number>
  aggregateRecords?(objectSlug: string, options: AggregateRecordsOptions): Promise<AggregateRecordsResult>
  updateRecord(objectSlug: string, id: string, attributes: Record<string, unknown>): Promise<RelateRecord>
  deleteRecord(objectSlug: string, id: string): Promise<void>
  /** Clean up relationships and list memberships for a deleted record */
  cleanupRecordRefs?(objectSlug: string, id: string): Promise<void>
  /** Apply multiple record mutations atomically when the adapter supports it */
  commitRecordMutations?(mutations: RecordMutation[]): Promise<void>
  /** Execute record operations inside a transaction when the adapter supports it */
  transaction?<T>(run: (adapter: StorageAdapter) => Promise<T>): Promise<T>

  // Relationships
  createRelationship(input: CreateRelationshipInput): Promise<Relationship>
  listRelationships(ref?: { object: string; id: string }, options?: ListRelationshipsOptions): Promise<Relationship[]>
  deleteRelationship(id: string): Promise<void>
  updateRelationship(id: string, attributes: Record<string, unknown>): Promise<Relationship>

  // Activities
  trackActivity(input: TrackActivityInput): Promise<Activity>
  listActivities(ref?: { object: string; id: string }, options?: ListActivitiesOptions): Promise<Activity[]>

  // Lists
  createList(input: CreateListInput): Promise<RelateList>
  getList(id: string): Promise<RelateList | null>
  listLists(options?: ListListsOptions): Promise<RelateList[]>
  updateList(id: string, attrs: { name?: string; filter?: Record<string, unknown> }): Promise<RelateList>
  deleteList(id: string): Promise<void>
  addToList(listId: string, recordIds: string[]): Promise<void>
  removeFromList(listId: string, recordIds: string[]): Promise<void>
  listItems(listId: string, options?: ListItemsOptions): Promise<PaginatedResult>
  countListItems(listId: string, filter?: Record<string, unknown>): Promise<number>
}
