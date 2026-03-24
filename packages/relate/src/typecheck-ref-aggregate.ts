import type { StorageAdapter } from './adapter'
import { defineSchema } from './schema'
import { relate } from './relate'

declare const adapter: StorageAdapter

const schema = defineSchema({
  objects: {
    item: {
      attributes: {
        amountCents: { type: 'number', required: true },
        quantity: 'number',
      },
    },
    order: {
      attributes: {
        requiredItem: { type: 'ref', object: 'item', required: true },
        optionalItem: { type: 'ref', object: 'item', onDelete: 'set_null' },
      },
    },
  },
})

const db = relate({ adapter, schema })

void db.order.aggregate({ sum: { field: 'requiredItem.amountCents' } })
void db.order.aggregate({ sum: { field: 'optionalItem.amountCents' } })
void db.order.aggregate({ sum: { field: 'optionalItem.quantity' } })

// @ts-expect-error ref sums must end in a numeric attribute
void db.order.aggregate({ sum: { field: 'optionalItem.missingField' } })

// @ts-expect-error direct sums must target numeric fields
void db.order.aggregate({ sum: { field: 'requiredItem' } })
