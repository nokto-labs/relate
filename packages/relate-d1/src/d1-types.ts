/**
 * Minimal D1 interface — keeps `relate` free of @cloudflare/workers-types
 * as a runtime dependency. The real D1Database from Cloudflare Workers
 * satisfies this interface at runtime.
 */
export interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement
  first<T = unknown>(colName?: string): Promise<T | null>
  run(): Promise<{ success: boolean; error?: string }>
  all<T = unknown>(): Promise<{ results: T[]; success: boolean; error?: string }>
}

export interface D1Database {
  prepare(query: string): D1PreparedStatement
  batch<T = unknown>(statements: D1PreparedStatement[]): Promise<Array<{ results: T[]; success: boolean }>>
}
