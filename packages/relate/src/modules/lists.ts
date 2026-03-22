import type { StorageAdapter, CreateListInput, ListListsOptions, ListItemsOptions, PaginatedResult } from '../adapter'
import type { RelateList, RelateRecord, SchemaInput } from '../types'
import { ValidationError } from '../errors'

export class ListsClient<S extends SchemaInput = SchemaInput> {
  constructor(
    private readonly adapter: StorageAdapter,
    private readonly objects?: SchemaInput,
  ) {}

  async create(input: CreateListInput<S>): Promise<RelateList<S>> {
    if (input.type === 'dynamic' && !input.filter) {
      throw new ValidationError({ code: 'INVALID_OPERATION', message: 'Dynamic lists require a filter' })
    }
    if (input.type === 'static' && input.filter) {
      throw new ValidationError({ code: 'INVALID_OPERATION', message: 'Static lists cannot have a filter — use addTo() to manage items' })
    }

    // Validate filter keys match the object's attributes
    if (input.filter && this.objects) {
      this.validateFilterKeys(input.object as string, input.filter)
    }

    return this.adapter.createList(input as CreateListInput) as Promise<RelateList<S>>
  }

  async get(id: string): Promise<RelateList<S> | null> {
    return this.adapter.getList(id) as Promise<RelateList<S> | null>
  }

  async list(options?: ListListsOptions): Promise<RelateList<S>[]> {
    return this.adapter.listLists(options) as Promise<RelateList<S>[]>
  }

  async update(id: string, attrs: { name?: string; filter?: Record<string, unknown> }): Promise<RelateList<S>> {
    if (attrs.filter && this.objects) {
      const existing = await this.adapter.getList(id)
      if (existing?.type === 'dynamic') {
        this.validateFilterKeys(existing.object, attrs.filter)
      }
    }

    return this.adapter.updateList(id, attrs) as Promise<RelateList<S>>
  }

  async delete(id: string): Promise<void> {
    return this.adapter.deleteList(id)
  }

  async addTo(listId: string, recordIds: string[]): Promise<void> {
    return this.adapter.addToList(listId, recordIds)
  }

  async removeFrom(listId: string, recordIds: string[]): Promise<void> {
    return this.adapter.removeFromList(listId, recordIds)
  }

  async items(listId: string, options?: ListItemsOptions): Promise<PaginatedResult<RelateRecord>> {
    return this.adapter.listItems(listId, options)
  }

  async count(listId: string, filter?: Record<string, unknown>): Promise<number> {
    return this.adapter.countListItems(listId, filter)
  }

  private validateFilterKeys(objectSlug: string, filter: Record<string, unknown>): void {
    const schema = this.objects?.[objectSlug]
    if (!schema) {
      throw new ValidationError({ message: `Unknown object "${objectSlug}"`, object: objectSlug })
    }

    const validKeys = new Set(Object.keys(schema.attributes))
    const invalidKeys = Object.keys(filter).filter((k) => !validKeys.has(k))

    if (invalidKeys.length > 0) {
      throw new ValidationError({
        message: `Invalid filter keys for "${objectSlug}": ${invalidKeys.join(', ')}`,
        object: objectSlug,
        fields: invalidKeys,
      })
    }
  }
}
