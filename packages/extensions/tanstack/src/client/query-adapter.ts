import {dehydrate} from '@conciv/page'
import type {CacheEntry, CacheEntryState} from '@conciv/protocol/framework-types'
import {findInFibers, type Fiber} from './router-adapter.js'

type QueryClientLike = {
  getQueryCache: () => {getAll: () => unknown[]}
  getMutationCache: () => {getAll: () => unknown[]}
  invalidateQueries: (filters: {queryKey: unknown}) => Promise<unknown>
  refetchQueries: (filters: {queryKey: unknown}) => Promise<unknown>
}

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null

function isQueryClient(candidate: unknown): candidate is QueryClientLike {
  return isObject(candidate) && typeof candidate.getQueryCache === 'function'
}

function clientFromFiber(fiber: Fiber): QueryClientLike | null {
  const props: unknown = fiber.memoizedProps
  if (!isObject(props)) return null
  if (isQueryClient(props.client)) return props.client
  if (isQueryClient(props.value)) return props.value
  return null
}

function findQueryClient(): QueryClientLike | null {
  return findInFibers(clientFromFiber)
}

function requireQueryClient(): QueryClientLike {
  const client = findQueryClient()
  if (!client) throw new Error('TanStack QueryClient not found on page')
  return client
}

function callBoolean(host: Record<string, unknown>, method: string): boolean {
  const fn = host[method]
  return typeof fn === 'function' && fn.call(host) === true
}

function callNumber(host: Record<string, unknown>, method: string): number | null {
  const fn = host[method]
  if (typeof fn !== 'function') return null
  const value = fn.call(host)
  return typeof value === 'number' ? value : null
}

function stateFrom(host: Record<string, unknown>): Record<string, unknown> {
  return isObject(host.state) ? host.state : {}
}

function errorMessage(value: unknown): string | null {
  if (!value) return null
  if (isObject(value) && typeof value.message === 'string') return value.message
  return String(value)
}

function queryState(host: Record<string, unknown>, state: Record<string, unknown>): CacheEntryState {
  if (callBoolean(host, 'isStale')) return 'stale'
  if (state.fetchStatus === 'fetching') return 'fetching'
  if (state.status === 'error') return 'error'
  return 'fresh'
}

function statusOf(state: Record<string, unknown>): string | null {
  return typeof state.status === 'string' ? state.status : null
}

function updatedAtOf(state: Record<string, unknown>, key: string): number | null {
  const value = state[key]
  return typeof value === 'number' ? value : null
}

function queryToEntry(query: unknown): CacheEntry {
  if (!isObject(query))
    return {key: '', state: 'fresh', status: null, value: null, updatedAt: null, error: null, observers: null}
  const state = stateFrom(query)
  return {
    key: JSON.stringify(query.queryKey),
    state: queryState(query, state),
    status: statusOf(state),
    value: dehydrate(state.data),
    updatedAt: updatedAtOf(state, 'dataUpdatedAt'),
    error: errorMessage(state.error),
    observers: callNumber(query, 'getObserversCount'),
  }
}

function mutationKey(mutation: Record<string, unknown>): string {
  const options = isObject(mutation.options) ? mutation.options : {}
  if (options.mutationKey !== undefined) return JSON.stringify(options.mutationKey)
  return JSON.stringify(mutation.mutationId ?? null)
}

function mutationState(state: Record<string, unknown>): CacheEntryState {
  if (state.status === 'pending') return 'fetching'
  if (state.status === 'error') return 'error'
  return 'fresh'
}

function mutationToEntry(mutation: unknown): CacheEntry {
  if (!isObject(mutation))
    return {key: '', state: 'fresh', status: null, value: null, updatedAt: null, error: null, observers: null}
  const state = stateFrom(mutation)
  return {
    key: mutationKey(mutation),
    state: mutationState(state),
    status: statusOf(state),
    value: dehydrate(state.data),
    updatedAt: updatedAtOf(state, 'submittedAt'),
    error: errorMessage(state.error),
    observers: callNumber(mutation, 'getObserversCount'),
  }
}

export function readQueryCache(): CacheEntry[] {
  const client = requireQueryClient()
  return client.getQueryCache().getAll().map(queryToEntry)
}

export function readMutations(): CacheEntry[] {
  const client = requireQueryClient()
  return client.getMutationCache().getAll().map(mutationToEntry)
}

function queryKeyForKey(client: QueryClientLike, key: string): unknown {
  const match = client
    .getQueryCache()
    .getAll()
    .find((query) => isObject(query) && JSON.stringify(query.queryKey) === key)
  return isObject(match) ? match.queryKey : undefined
}

export async function invalidateQuery(key: string): Promise<{ok: true}> {
  const client = requireQueryClient()
  await client.invalidateQueries({queryKey: queryKeyForKey(client, key)})
  return {ok: true}
}

export async function refetchQuery(key: string): Promise<{ok: true}> {
  const client = requireQueryClient()
  await client.refetchQueries({queryKey: queryKeyForKey(client, key)})
  return {ok: true}
}
