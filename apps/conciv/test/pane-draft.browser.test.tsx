import {afterEach, expect, test, vi} from 'vitest'
import {page, userEvent} from 'vitest/browser'
import {render} from 'solid-js/web'
import {createSignal, For, onMount, type JSX} from 'solid-js'
import {QueryClient, QueryClientProvider} from '@tanstack/solid-query'
import {makeRpcClient, type DraftRow} from '@conciv/contract'
import {makeQueryUtils} from '@conciv/client'
import type {ComposerStateApi} from '../src/chat/composer-state.js'
import {usePaneDraft} from '../src/chat/use-pane-draft.js'

const BASE = 'http://conciv.test'
const SNAPSHOT_SETTLE_MS = 400

type Server = {rows: Record<string, DraftRow>}

type Pane = {
  queryClient: QueryClient
  viewport: () => HTMLElement
  setSessionId: (sessionId: string) => void
  teardown: () => void
}

const disposers: (() => void)[] = []
const realFetch = globalThis.fetch

afterEach(() => {
  vi.useRealTimers()
  for (const dispose of disposers.splice(0)) dispose()
  globalThis.fetch = realFetch
  sessionStorage.clear()
})

function draftRow(sessionId: string, text: string, grabs: string[]): DraftRow {
  return {sessionId, text, selectionStart: text.length, selectionEnd: text.length, grabs, updatedAt: 1}
}

function reply(value: unknown): Response {
  return new Response(JSON.stringify({json: value, meta: []}), {
    status: 200,
    headers: {'content-type': 'application/json'},
  })
}

function askedSessionId(body: unknown): string {
  if (typeof body !== 'object' || body === null || !('json' in body)) throw new Error('the rpc body lost its payload')
  const json = body.json
  if (typeof json !== 'object' || json === null || !('sessionId' in json)) throw new Error('no session was asked for')
  const sessionId = json.sessionId
  if (typeof sessionId !== 'string') throw new Error('a session id must be text')
  return sessionId
}

function installServer(server: Server): void {
  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const request = input instanceof Request ? input : new Request(input, init)
    const path = new URL(request.url).pathname.replace('/rpc/drafts/', '')
    const body: unknown = JSON.parse(await request.clone().text())
    if (path === 'get') return reply(server.rows[askedSessionId(body)] ?? null)
    if (path === 'set') return reply({ok: true})
    throw new Error(`the fake core has no route for ${path}`)
  }
}

function mountPane(server: Server, initialSessionId: string): Pane {
  installServer(server)
  const host = document.createElement('div')
  document.body.appendChild(host)
  const queryClient = new QueryClient({defaultOptions: {queries: {retry: false}}})
  const rpc = makeRpcClient(BASE)
  const utils = makeQueryUtils(rpc)
  const [sessionId, setSessionId] = createSignal(initialSessionId)
  const viewportEl = document.createElement('div')
  viewportEl.style.height = '3rem'
  viewportEl.style.overflowY = 'auto'
  const tall = document.createElement('div')
  tall.style.height = '40rem'
  viewportEl.append(tall)
  document.body.append(viewportEl)

  const Harness = (): JSX.Element => {
    const [text, setText] = createSignal('')
    const [staged, setStaged] = createSignal<string[]>([])
    const [ready, setReady] = createSignal<ComposerStateApi | null>(null)
    let inputEl: HTMLTextAreaElement | undefined

    const composer: ComposerStateApi = {
      append: (value) => setText(value),
      text,
      setText,
      addAttachment: async () => {},
      snapshotDraft: () => ({draft: text(), attachments: [], quote: null}),
      restoreDraft: (saved) => setText(saved.draft),
      clearDraft: () => setText(''),
    }

    const draft = usePaneDraft({
      rpc,
      utils,
      sessionId,
      composer: ready,
      grabTexts: staged,
      stageTexts: (texts) => setStaged(texts),
      input: () => inputEl,
      viewport: () => viewportEl,
    })

    onMount(() => {
      setReady(() => composer)
      draft.restore()
    })

    return (
      <>
        <textarea
          ref={(element) => (inputEl = element)}
          aria-label="Message"
          value={text()}
          onInput={(event) => setText(event.currentTarget.value)}
        />
        <button type="button" aria-label="Somewhere else">
          Elsewhere
        </button>
        <ul aria-label="Staged grabs">
          <For each={staged()}>{(grab) => <li>{grab}</li>}</For>
        </ul>
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
  let live: (() => void) | null = dispose
  const teardown = (): void => {
    const stop = live
    live = null
    stop?.()
  }
  disposers.push(() => {
    teardown()
    host.remove()
    viewportEl.remove()
  })

  return {queryClient, viewport: () => viewportEl, setSessionId, teardown}
}

async function nextFrame(): Promise<void> {
  await new Promise((settle) => requestAnimationFrame(() => settle(null)))
}

test('a scrolled viewport stops recording the pane once the pane is torn down', async () => {
  const server: Server = {rows: {gone: draftRow('gone', 'a saved draft', [])}}
  const pane = mountPane(server, 'gone')
  await expect.element(page.getByRole('textbox', {name: 'Message'})).toHaveValue('a saved draft')

  sessionStorage.clear()
  vi.useFakeTimers({toFake: ['setTimeout', 'clearTimeout']})
  pane.viewport().scrollTop = 40
  await nextFrame()
  vi.advanceTimersByTime(SNAPSHOT_SETTLE_MS)
  expect(sessionStorage.getItem('conciv-pane:gone')).not.toBeNull()
  vi.useRealTimers()

  pane.teardown()

  sessionStorage.clear()
  vi.useFakeTimers({toFake: ['setTimeout', 'clearTimeout']})
  pane.viewport().scrollTop = 120
  await nextFrame()
  vi.advanceTimersByTime(SNAPSHOT_SETTLE_MS)
  expect(sessionStorage.getItem('conciv-pane:gone')).toBeNull()
})

test('a fresh look at the server draft never overwrites what was just typed', async () => {
  const server: Server = {rows: {typing: draftRow('typing', 'from the server', [])}}
  const pane = mountPane(server, 'typing')
  const message = page.getByRole('textbox', {name: 'Message'})
  await expect.element(message).toHaveValue('from the server')
  await expect.element(message).toHaveFocus()

  await userEvent.fill(message, 'half a thought')
  await expect.element(message).toHaveValue('half a thought')
  await userEvent.click(page.getByRole('button', {name: 'Somewhere else'}))

  await pane.queryClient.refetchQueries()
  await userEvent.click(page.getByRole('button', {name: 'Somewhere else'}))

  await expect.element(message).toHaveValue('half a thought')
})

test('pointing the pane at another session restores that session draft and its grabs', async () => {
  const server: Server = {
    rows: {one: draftRow('one', 'one draft', ['grab one']), two: draftRow('two', 'two draft', ['grab two'])},
  }
  const pane = mountPane(server, 'one')
  const message = page.getByRole('textbox', {name: 'Message'})
  await expect.element(message).toHaveValue('one draft')
  await expect.element(page.getByRole('listitem')).toHaveTextContent('grab one')

  pane.setSessionId('two')

  await expect.element(message).toHaveValue('two draft')
  await expect.element(page.getByRole('listitem')).toHaveTextContent('grab two')
})
