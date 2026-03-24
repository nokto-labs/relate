import type { StorageAdapter, CreateRelationshipInput, ListRelationshipsOptions } from '../adapter'
import type { Relationship, SchemaInput, ObjectRef, SchemaDefinition } from '../types'
import { RefNotFoundError, ValidationError } from '../errors'

export class RelationshipsClient<S extends SchemaInput = SchemaInput> {
  constructor(
    private readonly adapter: StorageAdapter,
    private readonly schema?: SchemaDefinition,
  ) {}

  async create(input: CreateRelationshipInput<S>): Promise<Relationship<S>> {
    this.validateShape(input as CreateRelationshipInput)
    await this.assertRecordExists(input.from.object, input.from.id, 'from')
    await this.assertRecordExists(input.to.object, input.to.id, 'to')
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

  private validateShape(input: CreateRelationshipInput): void {
    const objects = this.schema?.objects
    if (objects) {
      if (!objects[input.from.object]) {
        throw new ValidationError({
          message: `Unknown relationship source object "${input.from.object}"`,
          field: 'from',
          object: input.from.object,
        })
      }

      if (!objects[input.to.object]) {
        throw new ValidationError({
          message: `Unknown relationship target object "${input.to.object}"`,
          field: 'to',
          object: input.to.object,
        })
      }
    }

    const declared = this.schema?.relationships?.[input.type]
    const hasDeclaredTypes = this.schema?.relationships && Object.keys(this.schema.relationships).length > 0
    if (!hasDeclaredTypes) return

    if (!declared) {
      throw new ValidationError({
        message: `Unknown relationship type "${input.type}"`,
        field: 'type',
        type: input.type,
      })
    }

    if (declared.from !== input.from.object || declared.to !== input.to.object) {
      throw new ValidationError({
        message: `Relationship "${input.type}" must connect "${declared.from}" to "${declared.to}"`,
        field: 'type',
        type: input.type,
        expectedFrom: declared.from,
        expectedTo: declared.to,
      })
    }
  }

  private async assertRecordExists(objectSlug: string, id: string, field: 'from' | 'to'): Promise<void> {
    const record = await this.adapter.getRecord(objectSlug, id)
    if (!record) {
      throw new RefNotFoundError({ object: objectSlug, field, id })
    }
  }
}
