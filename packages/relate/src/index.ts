export { createCRM } from './crm'
export { defineSchema } from './schema'
export { EventBus } from './events'
export { RelateError, NotFoundError, DuplicateError, ValidationError } from './errors'
export type { ErrorCode, ErrorDetail } from './errors'

export type { CRM } from './crm'
export type {
  StorageAdapter,
  CreateRelationshipInput,
  TrackActivityInput,
  ListActivitiesOptions,
  FindRecordsOptions,
  ListRelationshipsOptions,
  PaginatedResult,
  UpsertResult,
  Migration,
  CreateListInput,
  ListListsOptions,
  ListItemsOptions,
} from './adapter'
export type {
  CRMRecord,
  CRMList,
  Relationship,
  Activity,
  SchemaInput,
  ObjectSchema,
  AttributeSchema,
  AttributeTypeName,
  InferAttributes,
  ObjectRef,
  FilterOperator,
  RelationshipSchema,
  SchemaDefinition,
} from './types'
export type {
  EventHandler,
  CreatedEvent,
  UpdatedEvent,
  DeletedEvent,
} from './events'
