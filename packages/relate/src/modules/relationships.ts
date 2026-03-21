import type { StorageAdapter, CreateRelationshipInput, ListRelationshipsOptions } from '../adapter'
import type { Relationship, SchemaInput, ObjectRef } from '../types'

export class RelationshipsClient<S extends SchemaInput = SchemaInput> {
  constructor(private readonly adapter: StorageAdapter) {}

  async create(input: CreateRelationshipInput<S>): Promise<Relationship<S>> {
    return this.adapter.createRelationship(input as CreateRelationshipInput) as Promise<Relationship<S>>
  }

  async list(ref?: ObjectRef<S>, options?: ListRelationshipsOptions): Promise<Relationship<S>[]> {
    return this.adapter.listRelationships(ref as { object: string; id: string } | undefined, options) as Promise<Relationship<S>[]>
  }

  async update(id: string, attributes: Record<string, unknown>): Promise<Relationship<S>> {
    return this.adapter.updateRelationship(id, attributes) as Promise<Relationship<S>>
  }

  async delete(id: string): Promise<void> {
    return this.adapter.deleteRelationship(id)
  }
}
