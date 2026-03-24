import type { StorageAdapter, Migration } from './adapter'
import type { SchemaDefinition, SchemaInput, ObjectSchema } from './types'
import type { EventHandler, CreatedEvent, UpdatedEvent, DeletedEvent } from './events'
import { ObjectClient } from './modules/object-client'
import { RelationshipsClient } from './modules/relationships'
import { ActivitiesClient } from './modules/activities'
import { ListsClient } from './modules/lists'
import { EventBus } from './events'
import { validateSchema } from './schema-validation'

type ReservedKeys = 'migrate' | 'applyMigrations' | 'relationships' | 'activities' | 'lists' | 'on' | 'off'
type ObjectKeys<T extends SchemaInput> = Exclude<keyof T, ReservedKeys>
type ObjectClients<T extends SchemaInput> = { [K in ObjectKeys<T>]: ObjectClient<Extract<T[K], ObjectSchema>, T> }

type EventName<T extends SchemaInput> = `${Extract<keyof T, string>}.${'created' | 'updated' | 'deleted'}`

type EventPayloadFor<_T extends SchemaInput, E extends string> =
  E extends `${infer _Obj}.created` ? CreatedEvent
  : E extends `${infer _Obj}.updated` ? UpdatedEvent
  : E extends `${infer _Obj}.deleted` ? DeletedEvent
  : never

export type Relate<T extends SchemaInput> = {
  migrate(): Promise<void>
  applyMigrations(migrations: Migration[]): Promise<void>
  relationships: RelationshipsClient<T>
  activities: ActivitiesClient<T>
  lists: ListsClient<T>
  on<E extends EventName<T>>(event: E, handler: EventHandler<EventPayloadFor<T, E>>): void
  off<E extends EventName<T>>(event: E, handler: EventHandler<EventPayloadFor<T, E>>): void
} & ObjectClients<T>

function createObjectClients<T extends SchemaInput>(
  adapter: StorageAdapter,
  objects: T,
  events: EventBus,
  dbRef: () => unknown,
): ObjectClients<T> {
  return Object.fromEntries(
    Object.entries(objects).map(([slug, objectSchema]) => [
      slug,
      new ObjectClient(adapter, slug, objectSchema, objects, events, dbRef),
    ]),
  ) as ObjectClients<T>
}

export function relate<T extends SchemaDefinition>(config: {
  adapter: StorageAdapter
  schema: T
  events?: EventBus
}): Relate<T['objects']> {
  const { adapter, schema } = config
  const objects = schema.objects

  validateSchema(schema)
  adapter.setSchema?.(objects)

  const events = config.events ?? new EventBus()
  let instance: Relate<T['objects']>
  const objectClients = createObjectClients(adapter, objects, events, () => instance)

  instance = {
    migrate: () => adapter.migrate(objects),
    applyMigrations: (migrations: Migration[]) => {
      if (!adapter.applyMigrations) {
        throw new Error('This adapter does not support applyMigrations')
      }
      return adapter.applyMigrations(migrations)
    },
    relationships: new RelationshipsClient<T['objects']>(adapter, schema),
    activities: new ActivitiesClient<T['objects']>(adapter, objects),
    lists: new ListsClient<T['objects']>(adapter, objects),
    on: (event: string, handler: EventHandler<any>) => events.on(event, handler),
    off: (event: string, handler: EventHandler<any>) => events.off(event, handler),
    ...objectClients,
  } as Relate<T['objects']>

  return instance
}
