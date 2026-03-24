import type { StorageAdapter, CreateRelationshipInput, TrackActivityInput, FindRecordsOptions, ListActivitiesOptions, ListRelationshipsOptions, PaginatedResult, UpsertResult, Migration, CreateListInput, ListListsOptions, ListItemsOptions, RelateRecord, RelateList, Relationship, Activity, SchemaInput, ObjectSchema, AggregateRecordsOptions, AggregateRecordsResult } from '@nokto-labs/relate'
import type { D1Database, D1PreparedStatement } from './d1-types'
import { migrate, applyMigrations } from './migrations'
import { createRecord, upsertRecord, getRecord, updateRecord, updateRecordStatement, deleteRecord, deleteRecordStatement } from './records/crud'
import { findRecords, findRecordsPage, countRecords } from './records/queries'
import { aggregateRecords } from './records/aggregate'
import * as relationships from './relationships'
import * as activities from './activities'
import { createList, getList, listLists, updateList, deleteList } from './lists/crud'
import { addToList, removeFromList, listItems, countListItems } from './lists/items'
import { cleanupRecordRefs, cleanupRecordRefStatements } from './cleanup'

type D1RecordMutation =
  | { type: 'update'; objectSlug: string; id: string; attributes: Record<string, unknown>; updatedAtMs: number }
  | { type: 'delete'; objectSlug: string; id: string }
  | { type: 'cleanup'; objectSlug: string; id: string }

export class D1Adapter implements StorageAdapter {
  private schema: SchemaInput = {}

  constructor(private readonly db: D1Database) {}

  setSchema(schema: SchemaInput): void {
    this.schema = schema
  }

  async migrate(schema: SchemaInput): Promise<void> {
    this.schema = schema
    await migrate(this.db, schema)
  }

  async applyMigrations(migrations: Migration[]): Promise<void> {
    await applyMigrations(this.db, migrations)
  }

  private objectSchema(objectSlug: string): ObjectSchema {
    const s = this.schema[objectSlug]
    if (!s || !('attributes' in s)) throw new Error(`Unknown object: "${objectSlug}". Did you call db.migrate()?`)
    return s as ObjectSchema
  }

  createRecord(objectSlug: string, attrs: Record<string, unknown>): Promise<RelateRecord> {
    return createRecord(this.db, objectSlug, this.objectSchema(objectSlug), attrs)
  }

  upsertRecord(objectSlug: string, uniqueBy: string, attrs: Record<string, unknown>): Promise<UpsertResult> {
    return upsertRecord(this.db, objectSlug, this.objectSchema(objectSlug), uniqueBy, attrs)
  }

  getRecord(objectSlug: string, id: string): Promise<RelateRecord | null> {
    return getRecord(this.db, objectSlug, this.objectSchema(objectSlug), id)
  }

  findRecords(objectSlug: string, options?: FindRecordsOptions): Promise<RelateRecord[]> {
    return findRecords(this.db, objectSlug, this.objectSchema(objectSlug), options)
  }

  findRecordsPage(objectSlug: string, options?: FindRecordsOptions): Promise<PaginatedResult> {
    return findRecordsPage(this.db, objectSlug, this.objectSchema(objectSlug), options)
  }

  countRecords(objectSlug: string, filter?: Record<string, unknown>): Promise<number> {
    return countRecords(this.db, objectSlug, this.objectSchema(objectSlug), filter)
  }

  aggregateRecords(objectSlug: string, options: AggregateRecordsOptions): Promise<AggregateRecordsResult> {
    return aggregateRecords(this.db, objectSlug, this.objectSchema(objectSlug), options)
  }

  updateRecord(objectSlug: string, id: string, attrs: Record<string, unknown>): Promise<RelateRecord> {
    return updateRecord(this.db, objectSlug, this.objectSchema(objectSlug), id, attrs)
  }

  deleteRecord(objectSlug: string, id: string): Promise<void> {
    return deleteRecord(this.db, objectSlug, id)
  }

  cleanupRecordRefs(objectSlug: string, id: string): Promise<void> {
    return cleanupRecordRefs(this.db, objectSlug, id)
  }

  async commitRecordMutations(mutations: D1RecordMutation[]): Promise<void> {
    if (mutations.length === 0) return
    await this.db.batch(mutations.flatMap((mutation) => this.mutationStatements(mutation)))
  }

  async transaction<T>(_run: (adapter: StorageAdapter) => Promise<T>): Promise<T> {
    throw new Error(
      'D1Adapter does not support interactive transactions yet. Cloudflare D1 exposes atomic batch() calls, but not read-then-write callback transactions through the Workers binding.',
    )
  }

  private mutationStatements(mutation: D1RecordMutation): D1PreparedStatement[] {
    if (mutation.type === 'update') {
      return [
        updateRecordStatement(
          this.db,
          mutation.objectSlug,
          this.objectSchema(mutation.objectSlug),
          mutation.id,
          mutation.attributes,
          mutation.updatedAtMs,
        ),
      ]
    }

    if (mutation.type === 'cleanup') {
      return cleanupRecordRefStatements(this.db, mutation.objectSlug, mutation.id)
    }

    return [deleteRecordStatement(this.db, mutation.objectSlug, mutation.id)]
  }

  createRelationship(input: CreateRelationshipInput): Promise<Relationship> {
    return relationships.createRelationship(this.db, input)
  }

  listRelationships(ref?: { object: string; id: string }, options?: ListRelationshipsOptions): Promise<Relationship[]> {
    return relationships.listRelationships(this.db, ref, options)
  }

  updateRelationship(id: string, attributes: Record<string, unknown>): Promise<Relationship> {
    return relationships.updateRelationship(this.db, id, attributes)
  }

  deleteRelationship(id: string): Promise<void> {
    return relationships.deleteRelationship(this.db, id)
  }

  trackActivity(input: TrackActivityInput): Promise<Activity> {
    return activities.trackActivity(this.db, input)
  }

  listActivities(ref?: { object: string; id: string }, options?: ListActivitiesOptions): Promise<Activity[]> {
    return activities.listActivities(this.db, ref, options)
  }

  createList(input: CreateListInput): Promise<RelateList> {
    return createList(this.db, input)
  }

  getList(id: string): Promise<RelateList | null> {
    return getList(this.db, id)
  }

  listLists(options?: ListListsOptions): Promise<RelateList[]> {
    return listLists(this.db, options)
  }

  updateList(id: string, attrs: { name?: string; filter?: Record<string, unknown> }): Promise<RelateList> {
    return updateList(this.db, id, attrs)
  }

  deleteList(id: string): Promise<void> {
    return deleteList(this.db, id)
  }

  addToList(listId: string, recordIds: string[]): Promise<void> {
    return addToList(this.db, listId, recordIds)
  }

  removeFromList(listId: string, recordIds: string[]): Promise<void> {
    return removeFromList(this.db, listId, recordIds)
  }

  listItems(listId: string, options?: ListItemsOptions): Promise<PaginatedResult> {
    return listItems(this.db, this.schema, listId, options)
  }

  countListItems(listId: string, filter?: Record<string, unknown>): Promise<number> {
    return countListItems(this.db, this.schema, listId, filter)
  }
}
