import {afterEach, describe, expect, it} from 'vitest'
import {MutationObserver, QueryClient, QueryObserver} from '@tanstack/solid-query'
import {until} from '@conciv/harness-testkit/until'
import {makeRpcClient, type SessionMeta} from '@conciv/contract'
import {makeQueryUtils} from '../src/query-utils.js'
import {bootClientKit, type ClientKit} from './helpers/boot.js'

let kit: ClientKit | undefined
afterEach(async () => {
  await kit?.cleanup()
  kit = undefined
})

describe('makeQueryUtils', () => {
  it('queryOptions fetch through the real wire', async () => {
    kit = await bootClientKit()
    const rpc = makeRpcClient(kit.base)
    const {sessionId} = await rpc.sessions.create(undefined)
    const utils = makeQueryUtils(rpc)
    const queryClient = new QueryClient()
    const sessions = await queryClient.fetchQuery(utils.sessions.list.queryOptions())
    expect(sessions.map((meta: SessionMeta) => meta.id)).toContain(sessionId)
    const models = await queryClient.fetchQuery(utils.meta.models.queryOptions())
    expect(models.harness.id).toBe('fake-client')
  })

  it('mutationOptions execute intents', async () => {
    kit = await bootClientKit()
    const rpc = makeRpcClient(kit.base)
    const {sessionId} = await rpc.sessions.create(undefined)
    const utils = makeQueryUtils(rpc)
    const queryClient = new QueryClient()
    const rename = new MutationObserver(queryClient, utils.sessions.rename.mutationOptions())
    const renamed = await rename.mutate({sessionId, title: 'named by mutation'})
    expect(renamed.title).toBe('named by mutation')
  })

  it('experimental_liveOptions re-emit when the server pushes a sessions change', async () => {
    kit = await bootClientKit()
    const rpc = makeRpcClient(kit.base)
    const {sessionId} = await rpc.sessions.create(undefined)
    const utils = makeQueryUtils(rpc)
    const queryClient = new QueryClient()
    const observer = new QueryObserver<SessionMeta[]>(queryClient, {
      ...utils.sessions.live.experimental_liveOptions(),
      retry: true,
    })
    const titles: string[][] = []
    const unsubscribe = observer.subscribe((result) => {
      if (result.data) titles.push(result.data.map((meta) => meta.title))
    })
    await until(() => titles.length > 0, {hangGuardMs: 5000})
    await rpc.sessions.rename({sessionId, title: 'live-renamed'})
    await until(() => (titles.at(-1) ?? []).includes('live-renamed'), {hangGuardMs: 5000})
    unsubscribe()
    expect(titles.at(-1)).toContain('live-renamed')
  })
})
