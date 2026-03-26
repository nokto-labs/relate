// ─── Attribute schema ────────────────────────────────────────────────────────

export type AttributeTypeName = 'text' | 'number' | 'boolean' | 'date' | 'email' | 'url'

export type OnDeleteAction = 'restrict' | 'cascade' | 'set_null' | 'none'

export interface RefAttributeSchema {
  type: 'ref'
  object: string
  required?: boolean
  validate?: boolean
  onDelete?: OnDeleteAction
}

export type AttributeSchema =
  | AttributeTypeName
  | { type: AttributeTypeName; required?: boolean }
  | { type: 'select'; options: readonly string[]; required?: boolean }
  | RefAttributeSchema

// ─── Object schema ───────────────────────────────────────────────────────────

export interface ObjectSchema {
  attributes: Record<string, AttributeSchema>
  /** Attribute name used to deduplicate records on upsert */
  uniqueBy?: string
  /** Plural name used for routing (e.g. 'people' for 'person'). Defaults to slug + 's'. */
  plural?: string
  /** Custom ID generator. Must return a string. Defaults to crypto.randomUUID(). */
  id?: () => string
  /** Prefix prepended to generated IDs (e.g. 'evt' produces 'evt_<id>'). */
  idPrefix?: string
}

export interface RelationshipSchema {
  from: string
  to: string
}

export type SchemaInput = Record<string, ObjectSchema>

export interface SchemaDefinition {
  objects: SchemaInput
  relationships?: Record<string, RelationshipSchema>
}

// ─── TypeScript inference helpers ────────────────────────────────────────────

type InferAttributeType<A extends AttributeSchema> =
  A extends 'text' ? string
  : A extends 'number' ? number
  : A extends 'boolean' ? boolean
  : A extends 'date' ? Date
  : A extends 'email' ? string
  : A extends 'url' ? string
  : A extends { type: 'text' } ? string
  : A extends { type: 'number' } ? number
  : A extends { type: 'boolean' } ? boolean
  : A extends { type: 'date' } ? Date
  : A extends { type: 'email' } ? string
  : A extends { type: 'url' } ? string
  : A extends { type: 'select'; options: infer O extends readonly string[] } ? O[number]
  : A extends { type: 'select' } ? string
  : A extends { type: 'ref' } ? string
  : unknown

type IsRequired<A extends AttributeSchema> = A extends { required: true } ? true : false

type RequiredKeys<S extends ObjectSchema> = {
  [K in keyof S['attributes']]: IsRequired<S['attributes'][K]> extends true ? K : never
}[keyof S['attributes']]

type OptionalKeys<S extends ObjectSchema> = {
  [K in keyof S['attributes']]: IsRequired<S['attributes'][K]> extends true ? never : K
}[keyof S['attributes']]

export type InferAttributes<S extends ObjectSchema> = {
  [K in RequiredKeys<S>]: InferAttributeType<S['attributes'][K]>
} & {
  [K in OptionalKeys<S>]?: InferAttributeType<S['attributes'][K]>
}

// ─── Filter operators ────────────────────────────────────────────────────────

type FilterEqualityValue<T> = undefined extends T ? Exclude<T, undefined> | null : T
type FilterRangeValue<T> = Exclude<FilterEqualityValue<T>, null>

export type FilterOperator<T = unknown> = {
  eq?: FilterEqualityValue<T>
  ne?: FilterEqualityValue<T>
  gt?: FilterRangeValue<T>
  gte?: FilterRangeValue<T>
  lt?: FilterRangeValue<T>
  lte?: FilterRangeValue<T>
  in?: FilterEqualityValue<T>[]
  like?: string
}

// ─── Runtime types ───────────────────────────────────────────────────────────

export type ObjectRef<S extends SchemaInput = SchemaInput> = {
  object: Extract<keyof S, string>
  id: string
}

export type RelateRecord<S extends ObjectSchema = ObjectSchema> = {
  id: string
  createdAt: Date
  updatedAt: Date
} & InferAttributes<S>

export type Relationship<S extends SchemaInput = SchemaInput> = {
  id: string
  from: ObjectRef<S>
  to: ObjectRef<S>
  type: string
  createdAt: Date
} & Record<string, unknown>

export interface Activity<S extends SchemaInput = SchemaInput> {
  id: string
  record: ObjectRef<S>
  type: string
  metadata: Record<string, unknown>
  occurredAt: Date
  createdAt: Date
}

export interface RelateList<S extends SchemaInput = SchemaInput> {
  id: string
  name: string
  object: Extract<keyof S, string>
  type: 'static' | 'dynamic'
  filter?: Record<string, unknown>
  createdAt: Date
  updatedAt: Date
}
