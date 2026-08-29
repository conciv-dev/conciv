import {afterAll, beforeAll, expect, test} from 'vitest'
import {bootCoreKit, type CoreKit} from '@conciv/extension-testkit/core-kit'
import tanstackExtension from '../src/server.js'

const state: {kit?: CoreKit} = {}

beforeAll(async () => {
  state.kit = await bootCoreKit({id: 'fake-tanstack-catalog', extensions: [tanstackExtension]})
}, 120_000)

afterAll(async () => state.kit?.cleanup())

function kit(): CoreKit {
  const booted = state.kit
  if (!booted) throw new Error('the core kit did not boot')
  return booted
}

const PAGE_TOOLS = [
  'tanstack_back',
  'tanstack_data_entries',
  'tanstack_data_invalidate',
  'tanstack_data_refetch',
  'tanstack_detect',
  'tanstack_errors_snapshot',
  'tanstack_loader_data',
  'tanstack_navigate',
  'tanstack_query_cache',
  'tanstack_query_invalidate',
  'tanstack_query_refetch',
  'tanstack_route_tree',
  'tanstack_router_invalidate',
  'tanstack_router_state',
]

const SERVER_TOOLS = ['tanstack_build_errors', 'tanstack_route_manifest', 'tanstack_server_fn_trace']

test('the agent catalog lists exactly one tanstack tool per verb, page verbs bound client-side', async () => {
  const catalog = await kit().rpc.registry.catalog()
  const tanstackEntries = catalog
    .filter((entry) => entry.name.startsWith('tanstack_'))
    .map((entry) => `${entry.name} (${entry.binding})`)
    .toSorted()

  expect(tanstackEntries).toEqual(
    [...PAGE_TOOLS.map((name) => `${name} (client)`), ...SERVER_TOOLS.map((name) => `${name} (server)`)].toSorted(),
  )
})

test('every listed tanstack tool carries a summary the agent can read', async () => {
  const catalog = await kit().rpc.registry.catalog()
  const missing = catalog
    .filter((entry) => entry.name.startsWith('tanstack_'))
    .filter((entry) => entry.summary.trim().length === 0)
    .map((entry) => entry.name)

  expect(missing).toEqual([])
})
