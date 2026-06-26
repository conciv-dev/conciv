import type {Collection} from '@tanstack/solid-db'
import type {Comment} from './schema.js'

let current: Collection<Comment> | null = null

export function setCommentsCollection(collection: Collection<Comment>): void {
  current = collection
}

export function getCommentsCollection(): Collection<Comment> {
  if (!current) throw new Error('comments collection not initialized')
  return current
}
