import {afterEach, expect, test} from 'vitest'
import {page, userEvent} from 'vitest/browser'
import {render} from 'solid-js/web'
import {QueryClient, QueryClientProvider} from '@tanstack/solid-query'
import {makeRpcClient, type LiveSession} from '@conciv/contract'
import {makeQueryUtils} from '@conciv/client'
import type {NoticeOptions} from '../src/chat/notify.js'
import {useConnectFlow} from '../src/composer/connect/use-connect-flow.js'
import {ConnectDialog} from '../src/composer/connect/connect-dialog.js'
import {
  HAND_BACK_CLOSE_LABEL,
  HAND_BACK_LABEL,
  HANDED_BACK,
  KEEP_WAITING_LABEL,
  LEAVING_UNRELOADED,
  LOOKING_LABEL,
  LOOKUP_FAILED,
  STILL_CONNECTED,
  UNDO_LABEL,
} from '../src/composer/connect/connect-copy.js'
import {liveSession} from './helpers/live-session.js'

const BASE = 'http://conciv.test'

type Answer<Value> = {value: Value} | {failure: string}

type Server = {
  candidates: Answer<LiveSession[]>
  adopt: Answer<{sessionId: string; reloadCommand: string}>
  detach?: Answer<{ok: boolean}>
  calls: {path: string; body: unknown}[]
  delayMs?: number
}

const disposers: (() => void)[] = []
const realFetch = globalThis.fetch

afterEach(() => {
  for (const dispose of disposers.splice(0)) dispose()
  globalThis.fetch = realFetch
})

function answer<Value>(server: Server, path: string, given: Answer<Value>): Response {
  if ('failure' in given) {
    const body = {json: {defined: false, code: 'INTERNAL_SERVER_ERROR', status: 500, message: given.failure}, meta: []}
    return new Response(JSON.stringify(body), {status: 500, headers: {'content-type': 'application/json'}})
  }
  if (path === '') throw new Error('a route needs a name')
  return new Response(JSON.stringify({json: given.value, meta: []}), {
    status: 200,
    headers: {'content-type': 'application/json'},
  })
}

async function listing(server: Server): Promise<Answer<LiveSession[]>> {
  const wait = server.delayMs ?? 0
  if (wait > 0) await new Promise((settle) => setTimeout(settle, wait))
  return server.candidates
}

function routes(server: Server): Record<string, () => Promise<Answer<unknown>>> {
  return {
    attachCandidates: () => listing(server),
    attachAdopt: async () => server.adopt,
    attachDetach: async () => server.detach ?? {value: {ok: true}},
    connectCommand: async () => ({value: {command: null, supported: false, opened: false}}),
  }
}

function installServer(server: Server): void {
  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const request = input instanceof Request ? input : new Request(input, init)
    const path = new URL(request.url).pathname.replace('/rpc/sessions/', '')
    const text = await request.clone().text()
    const parsed: unknown = text === '' ? null : JSON.parse(text)
    server.calls.push({path, body: parsed})
    const route = routes(server)[path]
    if (!route) throw new Error(`the fake core has no route for ${path}`)
    return answer(server, path, await route())
  }
}

type Raised = {message: string; options: NoticeOptions | undefined}

type Mounted = {
  server: Server
  notices: Raised[]
  navigated: string[]
  queryClient: QueryClient
}

function mountFlow(server: Server): Mounted {
  installServer(server)
  const host = document.createElement('div')
  document.body.appendChild(host)
  const queryClient = new QueryClient()
  const rpc = makeRpcClient(BASE)
  const utils = makeQueryUtils(rpc)
  const mounted: Mounted = {server, notices: [], navigated: [], queryClient}
  const Harness = () => {
    const flow = useConnectFlow({
      utils,
      rpc,
      queryClient,
      harnessName: () => 'Claude',
      sessionId: () => 'conciv_panel',
      navigate: (sessionId) => mounted.navigated.push(sessionId),
      notify: (message, options) => mounted.notices.push({message, options}),
      invalidateSessions: () => {},
    })
    return (
      <>
        <button type="button" aria-busy={flow.busy()} onClick={() => flow.start()}>
          Connect a session
        </button>
        <ConnectDialog
          step={flow.step()}
          harnessName="Claude"
          candidates={flow.candidates()}
          loading={flow.loading()}
          refreshing={flow.refreshing()}
          failure={flow.failure()}
          stale={flow.stale()}
          checkedAt={flow.checkedAt()}
          connectingId={flow.connectingId()}
          dialledIn={flow.dialledIn()}
          contactLost={flow.contactLost()}
          onPick={flow.pick}
          onRetry={flow.retry}
          onRefresh={flow.refresh}
          onLaunch={() => {}}
          onCopy={() => {}}
          onBack={flow.back}
          onDone={flow.done}
          onKeepWaiting={flow.keepWaiting}
          onHandBack={flow.handBack}
          onClose={flow.close}
        />
      </>
    )
  }
  const dispose = render(
    () => (
      <QueryClientProvider client={queryClient}>
        <Harness />
      </QueryClientProvider>
    ),
    host,
  )
  disposers.push(() => {
    dispose()
    host.remove()
    queryClient.clear()
  })
  return mounted
}

const trigger = () => page.getByRole('button', {name: 'Connect a session'})
const cancel = () => page.getByRole('button', {name: 'Cancel'})

test('the list is a cached read: reopening paints the rows it already has, with no skeleton', async () => {
  const mounted = mountFlow({
    candidates: {value: [liveSession(), liveSession({sessionId: 'sess-2', title: 'fix the flaky test'})]},
    adopt: {value: {sessionId: 'conciv_adopted', reloadCommand: '/reload-plugins --force'}},
    calls: [],
    delayMs: 300,
  })

  await trigger().click()
  await expect.element(page.getByText(LOOKING_LABEL)).toBeVisible()
  await expect.element(page.getByRole('button', {name: /fix the flaky test/})).toBeVisible()

  await cancel().click()
  await expect.element(page.getByRole('dialog')).not.toBeInTheDocument()

  await trigger().click()
  expect(page.getByText(LOOKING_LABEL).elements()).toHaveLength(0)
  expect(page.getByRole('button', {name: /fix the flaky test/}).elements()).toHaveLength(1)
  expect(mounted.server.calls.filter((call) => call.path === 'attachCandidates')).toHaveLength(1)
})

test('a listing that failed is an error cell, never a confident empty list', async () => {
  mountFlow({
    candidates: {failure: 'claude agents exited with code 1'},
    adopt: {value: {sessionId: 'conciv_adopted', reloadCommand: ''}},
    calls: [],
  })

  await trigger().click()

  await expect.element(page.getByText(LOOKUP_FAILED)).toBeVisible()
  expect(page.getByText('No Claude session is running here.').elements()).toHaveLength(0)
})

test('the panel follows the session the server handed back, and undo lets that one go', async () => {
  const mounted = mountFlow({
    candidates: {value: [liveSession(), liveSession({sessionId: 'sess-2', title: 'fix the flaky test'})]},
    adopt: {value: {sessionId: 'conciv_adopted', reloadCommand: '/reload-plugins --force'}},
    calls: [],
  })

  await trigger().click()
  await page.getByRole('button', {name: /fix the flaky test/}).click()

  await expect.element(page.getByRole('dialog')).not.toBeInTheDocument()
  expect(mounted.navigated).toEqual(['conciv_adopted'])

  const notice = mounted.notices.at(-1)
  expect(notice?.options?.action?.label).toBe(UNDO_LABEL)
  notice?.options?.action?.run()

  await expect.poll(() => mounted.server.calls.filter((call) => call.path === 'attachDetach')).toHaveLength(1)
  expect(mounted.server.calls.find((call) => call.path === 'attachDetach')?.body).toEqual({
    json: {sessionId: 'conciv_adopted'},
  })
})

test('a single ready session connects without ever opening the picker', async () => {
  const mounted = mountFlow({
    candidates: {value: [liveSession()]},
    adopt: {value: {sessionId: 'conciv_only', reloadCommand: '/reload-plugins --force'}},
    calls: [],
  })
  await mounted.queryClient.prefetchQuery(makeQueryUtils(makeRpcClient(BASE)).sessions.attachCandidates.queryOptions())

  await trigger().click()

  await expect.poll(() => mounted.navigated).toEqual(['conciv_only'])
  expect(page.getByRole('dialog').elements()).toHaveLength(0)
})

function unreloadedTerminal(detach?: Answer<{ok: boolean}>): Server {
  return {
    candidates: {value: [liveSession({ready: false})]},
    adopt: {value: {sessionId: 'conciv_only', reloadCommand: '/reload-plugins --force'}},
    detach,
    calls: [],
  }
}

async function openReloadCard(server: Server): Promise<Mounted> {
  const mounted = mountFlow(server)
  await mounted.queryClient.prefetchQuery(makeQueryUtils(makeRpcClient(BASE)).sessions.attachCandidates.queryOptions())
  await trigger().click()
  await expect.element(page.getByText('/reload-plugins --force')).toBeVisible()
  return mounted
}

const detachCalls = (mounted: Mounted) => mounted.server.calls.filter((call) => call.path === 'attachDetach')

test('walking out of the reload card asks first instead of leaving the terminal half connected', async () => {
  const mounted = await openReloadCard(unreloadedTerminal())

  await userEvent.keyboard('{Escape}')

  await expect.element(page.getByText(LEAVING_UNRELOADED)).toBeVisible()
  await expect.element(page.getByRole('dialog')).toBeVisible()
  expect(detachCalls(mounted)).toHaveLength(0)

  await page.getByRole('button', {name: KEEP_WAITING_LABEL}).click()
  await expect.element(page.getByText('/reload-plugins --force')).toBeVisible()
})

test('handing it back on the way out lets go of the session the server minted', async () => {
  const mounted = await openReloadCard(unreloadedTerminal())

  await userEvent.keyboard('{Escape}')
  await page.getByRole('button', {name: HAND_BACK_CLOSE_LABEL}).click()

  await expect.element(page.getByRole('dialog')).not.toBeInTheDocument()
  await expect.poll(() => detachCalls(mounted)).toHaveLength(1)
  expect(detachCalls(mounted)[0]?.body).toEqual({json: {sessionId: 'conciv_only'}})
  await expect.poll(() => mounted.notices.at(-1)?.message).toBe(HANDED_BACK)
})

test('a second escape hands it back, so escape always gets the reader out', async () => {
  const mounted = await openReloadCard(unreloadedTerminal())

  await userEvent.keyboard('{Escape}')
  await expect.element(page.getByText(LEAVING_UNRELOADED)).toBeVisible()
  await userEvent.keyboard('{Escape}')

  await expect.element(page.getByRole('dialog')).not.toBeInTheDocument()
  await expect.poll(() => detachCalls(mounted)).toHaveLength(1)
})

test('a hand back that fails leaves a standing notice that says so and offers to try again', async () => {
  const mounted = await openReloadCard(unreloadedTerminal({failure: 'that session is gone'}))

  await userEvent.keyboard('{Escape}')
  await page.getByRole('button', {name: HAND_BACK_CLOSE_LABEL}).click()

  await expect.element(page.getByRole('dialog')).not.toBeInTheDocument()
  await expect.poll(() => mounted.notices.at(-1)?.message).toBe(STILL_CONNECTED)
  const notice = mounted.notices.at(-1)
  expect(notice?.options?.tone).toBe('danger')
  expect(notice?.options?.action?.label).toBe(HAND_BACK_LABEL)
})

test('the panel follows the session the moment the terminal dials in, with no Done to click', async () => {
  const mounted = await openReloadCard(unreloadedTerminal())
  expect(mounted.navigated).toEqual([])

  mounted.server.candidates = {value: [liveSession({ready: true})]}
  await page.getByRole('button', {name: /Check for running sessions again/}).click()

  await expect.poll(() => mounted.navigated).toEqual(['conciv_only'])
  expect(mounted.notices.at(-1)?.options?.action?.label).toBe(UNDO_LABEL)
})

test('a single session that is not ready is adopted first, then asks for the reload it just learned about', async () => {
  const mounted = mountFlow({
    candidates: {value: [liveSession({ready: false})]},
    adopt: {value: {sessionId: 'conciv_only', reloadCommand: '/reload-plugins --force'}},
    calls: [],
  })
  await mounted.queryClient.prefetchQuery(makeQueryUtils(makeRpcClient(BASE)).sessions.attachCandidates.queryOptions())

  await trigger().click()

  await expect.element(page.getByText('/reload-plugins --force')).toBeVisible()
  expect(mounted.server.calls.filter((call) => call.path === 'attachAdopt')).toHaveLength(1)
  expect(mounted.navigated).toEqual([])
})
