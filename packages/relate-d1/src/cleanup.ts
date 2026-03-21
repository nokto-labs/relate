import type { D1Database } from './d1-types'

/**
 * Remove all relationships and list memberships referencing a record.
 * Called automatically when a record is deleted.
 */
export async function cleanupRecordRefs(
  db: D1Database,
  objectSlug: string,
  id: string,
): Promise<void> {
  await db.batch([
    // Remove relationships where this record is on either side
    db.prepare(
      'DELETE FROM crm_relationships WHERE (from_record_id = ? AND from_object = ?) OR (to_record_id = ? AND to_object = ?)'
    ).bind(id, objectSlug, id, objectSlug),

    // Remove from any static lists
    db.prepare('DELETE FROM crm_list_items WHERE record_id = ?').bind(id),
  ])
}
