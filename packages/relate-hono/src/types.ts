export type AnyRelate = {
  migrate(): Promise<void>
  relationships: { create(input: any): Promise<any>; list(ref?: any, options?: any): Promise<any[]>; update(id: string, attrs: any): Promise<any>; delete(id: string): Promise<void> }
  activities: { track(input: any): Promise<any>; list(ref?: any, options?: any): Promise<any[]> }
  lists: { create(input: any): Promise<any>; get(id: string): Promise<any>; list(options?: any): Promise<any[]>; update(id: string, attrs: any): Promise<any>; delete(id: string): Promise<void>; addTo(listId: string, recordIds: string[]): Promise<void>; removeFrom(listId: string, recordIds: string[]): Promise<void>; items(listId: string, options?: any): Promise<any>; count(listId: string): Promise<number> }
  on(event: string, handler: (event: any) => void | Promise<void>): void
  off(event: string, handler: (event: any) => void | Promise<void>): void
  [key: string]: unknown
}

export type AnyObjectClient = {
  create(attributes: Record<string, unknown>): Promise<unknown>
  upsert(attributes: Record<string, unknown>): Promise<unknown>
  get(id: string): Promise<unknown>
  find(options?: { filter?: Record<string, unknown>; limit?: number; offset?: number; orderBy?: string; order?: 'asc' | 'desc' }): Promise<unknown>
  findPage(options?: { filter?: Record<string, unknown>; limit?: number; orderBy?: string; order?: 'asc' | 'desc'; cursor?: string }): Promise<{ records: unknown[]; nextCursor?: string }>
  count(filter?: Record<string, unknown>): Promise<unknown>
  update(id: string, attributes: Record<string, unknown>): Promise<unknown>
  delete(id: string): Promise<void>
}

export type HonoEnv = {
  Variables: { db: AnyRelate; maxLimit?: number }
}
