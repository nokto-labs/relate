export function encodeCursor(value: unknown, id: string): string {
  return btoa(JSON.stringify({ v: value, id }))
}

export function decodeCursor(cursor: string): { v: unknown; id: string } {
  return JSON.parse(atob(cursor)) as { v: unknown; id: string }
}
