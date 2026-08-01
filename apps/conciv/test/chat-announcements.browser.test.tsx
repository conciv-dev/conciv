import {afterEach, expect, test} from 'vitest'
import {page, userEvent} from 'vitest/browser'
import {type JSX} from 'solid-js'
import {render} from 'solid-js/web'
import {QueryClient, QueryClientProvider} from '@tanstack/solid-query'
import {makeRpcClient} from '@conciv/contract'
import {makeQueryUtils} from '@conciv/client'
import {ChatProvider, Composer, ComposerHandlersProvider} from '@conciv/ui-kit-chat'
import {makeGrabStore, makePendingAttachmentQueue, type PaneContextValue} from '../src/app/pane-context.js'
import {ComposerStateBridge} from '../src/chat/composer-state.js'
import {useComposerBridge} from '../src/chat/use-composer-bridge.js'
import {useSendPipeline} from '../src/chat/use-send-pipeline.js'
import {useChatAnnouncements} from '../src/chat/use-chat-announcements.js'

const BASE = 'http://conciv.test'
const SESSION = 'conciv_1'
const RUN_ID = 'conciv_1:1'

type Server = {calls: string[]; push: (chunk: unknown) => void}

const disposers: (() => void)[] = []
const realFetch = globalThis.fetch

afterEach(() => {
  for (const dispose of disposers.splice(0)) dispose()
  globalThis.fetch = realFetch
  sessionStorage.clear()
})

function ok(value: unknown): Response {
  return new Response(JSON.stringify({json: value, meta: []}), {
    status: 200,
    headers: {'content-type': 'application/json'},
  })
}

function frame(chunk: unknown): Uint8Array {
  return new TextEncoder().encode(`event: message\ndata: ${JSON.stringify({json: chunk, meta: []})}\n\n`)
}

async function wait(ms: number): Promise<void> {
  await new Promise((settle) => setTimeout(settle, ms))
}

function liveStream(server: Server): Response {
  const stream = new ReadableStream<Uint8Array>({
    start: (controller) => {
      controller.enqueue(frame({type: 'MESSAGES_SNAPSHOT', messages: []}))
      server.push = (chunk) => controller.enqueue(frame(chunk))
    },
  })
  return new Response(stream, {status: 200, headers: {'content-type': 'text/event-stream'}})
}

function installServer(server: Server): void {
  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const request = input instanceof Request ? input : new Request(input, init)
    const path = new URL(request.url).pathname.replace('/rpc/', '')
    server.calls.push(path)
    if (path === 'chat/attach') return liveStream(server)
    if (path === 'drafts/get') return ok(null)
    if (path === 'drafts/set') return ok({ok: true})
    if (path === 'sessions/attachDetach') return ok({ok: true, detached: true})
    if (path === 'chat/send') {
      queueMicrotask(async () => {
        server.push({type: 'RUN_STARTED', threadId: SESSION, runId: RUN_ID})
        await wait(60)
        server.push({type: 'RUN_FINISHED', threadId: SESSION, runId: RUN_ID, finishReason: 'stop'})
      })
      return ok({ok: true, runId: RUN_ID})
    }
    throw new Error(`the fake core has no route for ${path}`)
  }
}

function makePane(): PaneContextValue {
  return {
    sessionId: () => SESSION,
    running: () => false,
    attached: () => false,
    viewLocked: () => false,
    setLockedFor: () => () => {},
    slideClass: () => '',
    resetSlide: () => {},
    grabProvider: undefined,
    grabStore: makeGrabStore(),
    attachments: makePendingAttachmentQueue(),
  }
}

function mountPipeline(): {server: Server; announcements: string[]} {
  const server: Server = {calls: [], push: () => {}}
  installServer(server)
  const host = document.createElement('div')
  document.body.appendChild(host)
  const queryClient = new QueryClient()
  const announcements: string[] = []

  const Harness = (): JSX.Element => {
    const rpc = makeRpcClient(BASE)
    const pane = makePane()
    const bridge = useComposerBridge({rpc, utils: makeQueryUtils(rpc), sessionId: () => SESSION, pane})
    const pipeline = useSendPipeline({
      rpc,
      sessionId: () => SESSION,
      pane,
      draft: bridge.draft,
      composer: bridge.composer,
      focusComposer: bridge.focusInput,
      busy: () => false,
      notify: () => {},
      invalidateSessions: () => {},
    })
    useChatAnnouncements({
      turn: pipeline,
      announce: (message) => announcements.push(message),
      invalidateSessions: () => {},
      refreshMarkers: () => {},
    })
    return (
      <ChatProvider chat={pipeline.chat}>
        <ComposerHandlersProvider value={pipeline.handlers}>
          <Composer inputLabel="Message the conciv agent" inputRef={bridge.inputRef}>
            <ComposerStateBridge onReady={bridge.onComposerReady} />
          </Composer>
          <p>{pipeline.chat.sessionGenerating() ? 'assistant working' : 'assistant idle'}</p>
        </ComposerHandlersProvider>
      </ChatProvider>
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
  })
  return {server, announcements}
}

const input = () => page.getByRole('textbox', {name: 'Message the conciv agent'})

async function typeAndSend(text: string): Promise<void> {
  await input().fill(text)
  await userEvent.keyboard('{Enter}')
}

test('conciv replied is announced once a turn with no text-lifecycle wire chunks finishes', async () => {
  const {announcements} = mountPipeline()

  await typeAndSend('rename the widget package')

  await expect.element(page.getByText('assistant working')).toBeVisible()
  await expect.element(page.getByText('assistant idle')).toBeVisible()
  expect(announcements).toContain('conciv replied.')
})
