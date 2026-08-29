import {and, eq} from 'drizzle-orm'
import type {MetadataStore} from '@tanstack/ai-persistence'
import type {ConcivDb} from './db.js'
import {chatMetadata} from './run-schema.js'

const at = (namespace: string, key: string) => and(eq(chatMetadata.namespace, namespace), eq(chatMetadata.key, key))

export function createMetadataStore(db: ConcivDb): MetadataStore {
  return {
    get: async (namespace, key) => {
      const rows = await db.select({valueJson: chatMetadata.valueJson}).from(chatMetadata).where(at(namespace, key))
      return rows[0]?.valueJson ?? null
    },
    set: async (namespace, key, value) => {
      if (value === null || value === undefined) {
        throw new TypeError(`cannot store ${String(value)} at (${namespace}, ${key}); delete() clears metadata`)
      }
      await db
        .insert(chatMetadata)
        .values({namespace, key, valueJson: value})
        .onConflictDoUpdate({target: [chatMetadata.namespace, chatMetadata.key], set: {valueJson: value}})
    },
    delete: async (namespace, key) => {
      await db.delete(chatMetadata).where(at(namespace, key))
    },
  }
}
