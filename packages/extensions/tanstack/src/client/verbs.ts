import type {AnyToolBuilder} from '@conciv/extension'
import {invalidateQuery, readMutations, readQueryCache, refetchQuery} from './query-adapter.js'
import {readRuntimeErrors} from './error-ring.js'
import {
  goBack,
  invalidateRouter,
  invalidateRouterMatch,
  navigateTo,
  readDataEntries,
  readDetect,
  readLoaderData,
  readRouterState,
  readRouteTree,
} from './router-adapter.js'
import {
  backDef,
  dataEntriesDef,
  dataGetDef,
  dataInvalidateDef,
  dataRefetchDef,
  detectDef,
  errorsSnapshotDef,
  navigateDef,
  queryCacheDef,
  queryInvalidateDef,
  queryRefetchDef,
  routeTreeDef,
  routerInvalidateDef,
  routerStateDef,
} from '../shared/verb-defs.js'

export const tanstackVerbTools: readonly AnyToolBuilder[] = [
  detectDef.client(() => ({result: readDetect()})),
  routerStateDef.client(() => ({result: readRouterState()})),
  routeTreeDef.client(() => ({result: readRouteTree()})),
  dataEntriesDef.client(() => ({result: readDataEntries()})),
  dataGetDef.client((input) => ({result: readLoaderData(input.routeId) ?? null})),
  dataInvalidateDef.client(async (input) => ({result: await invalidateRouterMatch(input.routeId)})),
  dataRefetchDef.client(async (input) => ({result: await invalidateRouterMatch(input.routeId)})),
  errorsSnapshotDef.client(() => ({result: readRuntimeErrors()})),
  queryCacheDef.client(() => ({result: {queries: readQueryCache(), mutations: readMutations()}})),
  queryInvalidateDef.client(async (input) => ({result: await invalidateQuery(input.key)})),
  queryRefetchDef.client(async (input) => ({result: await refetchQuery(input.key)})),
  navigateDef.client(async (input) => ({result: await navigateTo(input)})),
  routerInvalidateDef.client(async () => ({result: await invalidateRouter()})),
  backDef.client(() => ({result: goBack()})),
]
