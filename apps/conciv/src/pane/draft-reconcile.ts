export type DraftReconcile =
  | {kind: 'local'; saveToEngine: boolean}
  | {kind: 'engine'}
  | {kind: 'cleared'}
  | {kind: 'empty'}

export function reconcileDraft<
  Local extends {syncedAt?: number | undefined; sent?: readonly number[] | undefined},
  Row extends {updatedAt: number},
>(local: Local | null, row: Row | null, same: (local: Local, row: Row) => boolean): DraftReconcile {
  if (!local) return row ? {kind: 'engine'} : {kind: 'empty'}
  if (!row) return local.syncedAt === undefined ? {kind: 'local', saveToEngine: true} : {kind: 'cleared'}
  if (row.updatedAt !== local.syncedAt && !local.sent?.includes(row.updatedAt)) return {kind: 'engine'}
  return {kind: 'local', saveToEngine: !same(local, row)}
}
