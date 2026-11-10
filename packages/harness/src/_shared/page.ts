import type {HarnessListCursor, HarnessListPage} from '@conciv/protocol/harness-types'

export function pageAfter<T>(
  items: T[],
  page: HarnessListPage,
  cursorOf: (item: T) => HarnessListCursor,
): {items: T[]; next: HarnessListCursor | null} {
  const after = page.after
  const ordered = items
    .filter((item) => after === null || newestFirst(cursorOf(item), after) > 0)
    .toSorted((first, second) => newestFirst(cursorOf(first), cursorOf(second)))
  const kept = ordered.slice(0, page.limit)
  const last = kept.at(-1)
  return {items: kept, next: ordered.length > page.limit && last !== undefined ? cursorOf(last) : null}
}

function newestFirst(first: HarnessListCursor, second: HarnessListCursor): number {
  if (first.updatedAt !== second.updatedAt) return second.updatedAt - first.updatedAt
  if (first.id === second.id) return 0
  return first.id < second.id ? 1 : -1
}
