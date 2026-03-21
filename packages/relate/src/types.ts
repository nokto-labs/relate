// ─── Attribute schema ────────────────────────────────────────────────────────

export type AttributeTypeName = 'text' | 'number' | 'boolean' | 'date' | 'email' | 'url'

export type AttributeSchema =
  | AttributeTypeName
  | { type: AttributeTypeName; required?: boolean }
  | { type: 'select'; options: readonly string[]; required?: boolean }

// ─── Object schema ───────────────────────────────────────────────────────────

export interface ObjectSchema {
  attributes: Record<string, AttributeSchema>
  /** Attribute name used to deduplicate records on upsert */
  uniqueBy?: string
  /** Plural name used for routing (e.g. 'people' for 'person'). Defaults to slug + 's'. */
  plural?: string
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

export type FilterOperator<T = unknown> = {
  eq?: T
  ne?: T
  gt?: T
  gte?: T
  lt?: T
  lte?: T
  in?: T[]
  like?: string
}

// ─── Runtime types ───────────────────────────────────────────────────────────

export type ObjectRef<S extends SchemaInput = SchemaInput> = {
  object: Extract<keyof S, string>
  id: string
}

export type CRMRecord<S extends ObjectSchema = ObjectSchema> = {
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

export interface CRMList<S extends SchemaInput = SchemaInput> {
  id: string
  name: string
  object: Extract<keyof S, string>
  type: 'static' | 'dynamic'
  filter?: Record<string, unknown>
  createdAt: Date
  updatedAt: Date
}
