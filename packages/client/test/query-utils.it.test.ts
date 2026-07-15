import {afterEach, describe, expect, it} from 'vitest'
import {MutationObserver, QueryClient} from '@tanstack/solid-query'
import {makeRpcClient, type SessionMeta} from '@conciv/contract'
import {makeQueryUtils} from '../src/query-utils.js'
import {bootClientKit, type ClientKit} from './helpers/boot.js'

let kit: ClientKit | undefined
afterEach(async () => {
  await kit?.cleanup()
  kit = undefined
})

type QueryFixture = {
  sessionId: string
  rpc: ReturnType<typeof makeRpcClient>
  utils: ReturnType<typeof makeQueryUtils>
  queryClient: QueryClient
}

async function bootQueryFixture(): Promise<QueryFixture> {
  kit = await bootClientKit()
  const rpc = makeRpcClient(kit.base)
  const {sessionId} = await rpc.sessions.create(undefined)
  return {sessionId, rpc, utils: makeQueryUtils(rpc), queryClient: new QueryClient()}
}

describe('makeQueryUtils', () => {
  it('queryOptions fetch through the real wire', async () => {
    const {sessionId, utils, queryClient} = await bootQueryFixture()
    const sessions = await queryClient.fetchQuery(utils.sessions.list.queryOptions())
    expect(sessions.map((meta: SessionMeta) => meta.id)).toContain(sessionId)
    const models = await queryClient.fetchQuery(utils.meta.models.queryOptions())
    expect(models.harness.id).toBe('fake-client')
  })

  it('mutationOptions execute intents', async () => {
    const {sessionId, utils, queryClient} = await bootQueryFixture()
    const rename = new MutationObserver(queryClient, utils.sessions.rename.mutationOptions())
    const renamed = await rename.mutate({sessionId, title: 'named by mutation'})
    expect(renamed.title).toBe('named by mutation')
  })

  it('a refetch after a rename sees the change (live lists are gone by design)', async () => {
    const {sessionId, rpc, utils, queryClient} = await bootQueryFixture()
    await rpc.sessions.rename({sessionId, title: 'refetch-renamed'})
    await queryClient.invalidateQueries()
    const sessions = await queryClient.fetchQuery(utils.sessions.list.queryOptions())
    expect(sessions.map((meta: SessionMeta) => meta.title)).toContain('refetch-renamed')
  })
})
