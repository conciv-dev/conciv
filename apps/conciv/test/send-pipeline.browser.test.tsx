import {afterEach, expect, test} from 'vitest'
import {page, userEvent} from 'vitest/browser'
import {For, type JSX} from 'solid-js'
import {render} from 'solid-js/web'
import {QueryClient, QueryClientProvider} from '@tanstack/solid-query'
import {makeRpcClient} from '@conciv/contract'
import {makeQueryUtils} from '@conciv/client'
import {ChatProvider, Composer, ComposerHandlersProvider} from '@conciv/ui-kit-chat'
import {makeGrabStore, makePendingAttachmentQueue, type PaneContextValue} from '../src/app/pane-context.js'
import {ComposerStateBridge} from '../src/chat/composer-state.js'
import {useComposerBridge} from '../src/chat/use-composer-bridge.js'
import {useSendPipeline} from '../src/chat/use-send-pipeline.js'
import {TerminalConflictDialog} from '../src/chat/terminal-conflict-dialog.js'

const BASE = 'http://conciv.test'
const SESSION = 'conciv_1'
const RUN_ID = 'conciv_1:1'
const BLOCKED = 'Claude is working in your terminal right now.'

type Server = {streams: boolean[]; sends: number; calls: string[]; push: (chunk: unknown) => void}

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

function blocked(): Response {
  const body = {defined: true, code: 'EXTERNAL_BLOCKED', status: 409, message: BLOCKED}
  return new Response(JSON.stringify({json: body, meta: []}), {
    status: 409,
    headers: {'content-type': 'application/json'},
  })
}

function frame(chunk: unknown): Uint8Array {
  return new TextEncoder().encode(`event: message\ndata: ${JSON.stringify({json: chunk, meta: []})}\n\n`)
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

async function wait(ms: number): Promise<void> {
  await new Promise((settle) => setTimeout(settle, ms))
}

function replyStarts(server: Server): void {
  server.push({type: 'RUN_STARTED', threadId: SESSION, runId: RUN_ID})
  server.push({type: 'TEXT_MESSAGE_START', messageId: `m${server.sends}`, role: 'assistant'})
  server.push({type: 'TEXT_MESSAGE_CONTENT', messageId: `m${server.sends}`, delta: 'on it'})
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
      const index = server.sends
      server.sends += 1
      if (server.streams[index]) {
        replyStarts(server)
        await wait(60)
      }
      return blocked()
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

function mountPipeline(streams: boolean[]): Server {
  const server: Server = {streams, sends: 0, calls: [], push: () => {}}
  installServer(server)
  const host = document.createElement('div')
  document.body.appendChild(host)
  const queryClient = new QueryClient()

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
      invalidateSessions: () => {},
    })
    pane.grabStore.stageTexts(['the save button'])
    return (
      <ChatProvider chat={pipeline.chat}>
        <ComposerHandlersProvider value={pipeline.handlers}>
          <ul>
            <For each={pane.grabStore.grabs()}>{(grab) => <li>{grab.text}</li>}</For>
          </ul>
          <Composer inputLabel="Message the conciv agent" inputRef={bridge.inputRef}>
            <ComposerStateBridge onReady={bridge.onComposerReady} />
          </Composer>
          <TerminalConflictDialog
            conflict={pipeline.guard.conflict()}
            onCancel={pipeline.guard.cancel}
            onTakeOver={pipeline.guard.takeOver}
            onSendAnyway={pipeline.guard.sendAnyway}
          />
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
  return server
}

const input = () => page.getByRole('textbox', {name: 'Message the conciv agent'})
const grab = () => page.getByText('the save button')

async function typeAndSend(text: string): Promise<void> {
  await input().fill(text)
  await userEvent.keyboard('{Enter}')
}

test('a block that lands after the reply already started counts as delivered, not as a conflict', async () => {
  mountPipeline([true])

  await typeAndSend('rename the widget package')

  await expect.element(grab()).not.toBeInTheDocument()
  expect(page.getByRole('alertdialog').elements()).toHaveLength(0)
  await expect.element(input()).toHaveValue('')
})

test('a send that never reached the stream is asked about even after a delivered one', async () => {
  mountPipeline([true, false])

  await typeAndSend('rename the widget package')
  await expect.element(grab()).not.toBeInTheDocument()

  await typeAndSend('now rename the docs')

  await expect.element(page.getByRole('alertdialog')).toBeVisible()
  await expect.element(page.getByText(BLOCKED)).toBeVisible()
})
