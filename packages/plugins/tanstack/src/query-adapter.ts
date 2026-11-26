import type {Mutation, Query, QueryClient} from '@tanstack/react-query'
import type {ReactFiber, ReactTree} from '@conciv/frontend-plugin-api/page'
import {Effect, Predicate, Schema} from 'effect'
import type {CacheEntry, CacheEntryState} from './rpc.js'
import {callFailed, errorMessage, findInFibers} from './router-adapter.js'

const QueryClientNotFound = Schema.TaggedStruct('Tanstack.QueryClientNotFound', {})
export type QueryClientNotFound = typeof QueryClientNotFound.Type

function isQueryClient(candidate: unknown): candidate is QueryClient {
  return Predicate.isObject(candidate) && Predicate.isFunction(candidate.getQueryCache)
}

function clientFromFiber(fiber: ReactFiber): QueryClient | null {
  const props: unknown = fiber.memoizedProps
  if (!Predicate.isObject(props)) return null
  if (isQueryClient(props.client)) return props.client
  if (isQueryClient(props.value)) return props.value
  return null
}

function findQueryClient(tree: ReactTree): QueryClient | null {
  return findInFibers(tree, clientFromFiber)
}

function requireQueryClient(tree: ReactTree): Effect.Effect<QueryClient, QueryClientNotFound> {
  const client = findQueryClient(tree)
  return client ? Effect.succeed(client) : Effect.fail(QueryClientNotFound.make({}))
}

function queryState(query: Query): CacheEntryState {
  if (query.state.fetchStatus === 'fetching') return 'fetching'
  if (query.state.status === 'error') return 'error'
  if (query.isStale()) return 'stale'
  return 'fresh'
}

function redactedKey(tree: ReactTree, key: unknown): string {
  return JSON.stringify(tree.dehydrate(key))
}

function queryToEntry(tree: ReactTree, query: Query): CacheEntry {
  return {
    key: redactedKey(tree, query.queryKey),
    state: queryState(query),
    status: query.state.status,
    value: tree.dehydrate(query.state.data),
    updatedAt: query.state.dataUpdatedAt,
    error: errorMessage(query.state.error),
    observers: query.getObserversCount(),
  }
}

function mutationKey(tree: ReactTree, mutation: Mutation): string {
  if (mutation.options.mutationKey !== undefined) return redactedKey(tree, mutation.options.mutationKey)
  return JSON.stringify(mutation.mutationId)
}

function mutationState(mutation: Mutation): CacheEntryState {
  if (mutation.state.status === 'pending') return 'fetching'
  if (mutation.state.status === 'error') return 'error'
  return 'fresh'
}

function mutationToEntry(tree: ReactTree, mutation: Mutation): CacheEntry {
  return {
    key: mutationKey(tree, mutation),
    state: mutationState(mutation),
    status: mutation.state.status,
    value: tree.dehydrate(mutation.state.data),
    updatedAt: mutation.state.submittedAt,
    error: errorMessage(mutation.state.error),
    observers: null,
  }
}

export const readQueryCache = Effect.fn('tanstack.query.cache')(function* (tree: ReactTree) {
  const client = yield* requireQueryClient(tree)
  return {
    queries: client
      .getQueryCache()
      .getAll()
      .map((query) => queryToEntry(tree, query)),
    mutations: client
      .getMutationCache()
      .getAll()
      .map((mutation) => mutationToEntry(tree, mutation)),
  }
})

function matchingQueries(tree: ReactTree, client: QueryClient, key: string): Query[] {
  return client
    .getQueryCache()
    .getAll()
    .filter((query) => JSON.stringify(query.queryKey) === key || redactedKey(tree, query.queryKey) === key)
}

export const invalidateQuery = Effect.fn('tanstack.query.invalidate')(function* (tree: ReactTree, key: string) {
  const client = yield* requireQueryClient(tree)
  yield* Effect.forEach(
    matchingQueries(tree, client, key),
    (query) =>
      Effect.tryPromise({
        try: () => client.invalidateQueries({queryKey: query.queryKey, exact: true}),
        catch: callFailed,
      }),
    {concurrency: 'unbounded', discard: true},
  )
  return {ok: true as const}
})

export const refetchQuery = Effect.fn('tanstack.query.refetch')(function* (tree: ReactTree, key: string) {
  const client = yield* requireQueryClient(tree)
  yield* Effect.forEach(
    matchingQueries(tree, client, key),
    (query) =>
      Effect.tryPromise({
        try: () => client.refetchQueries({queryKey: query.queryKey, exact: true}),
        catch: callFailed,
      }),
    {concurrency: 'unbounded', discard: true},
  )
  return {ok: true as const}
})
