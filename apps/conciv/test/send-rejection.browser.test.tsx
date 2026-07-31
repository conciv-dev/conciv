import {afterEach, expect, test} from 'vitest'
import {page, userEvent} from 'vitest/browser'
import {render} from 'solid-js/web'
import {createEffect, createSignal, For} from 'solid-js'
import {ChatProvider, Composer, ComposerHandlersProvider} from '@conciv/ui-kit-chat'
import {makeRpcClient} from '@conciv/contract'
import {useChatSession} from '@conciv/client'
import {makeGrabStore} from '../src/app/pane-context.js'
import {ComposerStateBridge, type ComposerStateApi} from '../src/chat/composer-state.js'
import {makeSendGuard, type SendGuard} from '../src/chat/send-guard.js'
import {TerminalConflictDialog} from '../src/chat/terminal-conflict-dialog.js'
import {TERMINAL_RECONNECTED} from '../src/chat/conflict.js'

const BASE = 'http://conciv.test'
const RUN_ID = 'conciv_1:1'

type Rejection = {code: string; message: string} | {plain: string}

type Server = {
  send: Rejection | 'accept'
  detach: Rejection | 'accept'
  detachDelayMs?: number
  calls: string[]
  push: (chunk: unknown) => void
}

const disposers: (() => void)[] = []
const realFetch = globalThis.fetch

afterEach(() => {
  for (const dispose of disposers.splice(0)) dispose()
  globalThis.fetch = realFetch
})

function rejection(given: Rejection): Response {
  const body =
    'plain' in given
      ? {defined: false, code: 'INTERNAL_SERVER_ERROR', status: 500, message: given.plain}
      : {defined: true, code: given.code, status: 409, message: given.message}
  return new Response(JSON.stringify({json: body, meta: []}), {
    status: body.status,
    headers: {'content-type': 'application/json'},
  })
}

function ok(value: unknown): Response {
  return new Response(JSON.stringify({json: value, meta: []}), {
    status: 200,
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

function installServer(server: Server): void {
  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const request = input instanceof Request ? input : new Request(input, init)
    const path = new URL(request.url).pathname.replace('/rpc/', '')
    server.calls.push(path)
    if (path === 'chat/attach') return liveStream(server)
    if (path === 'chat/send') {
      if (server.send !== 'accept') return rejection(server.send)
      queueMicrotask(() => {
        server.push({type: 'RUN_STARTED', threadId: 'conciv_1', runId: RUN_ID})
        server.push({type: 'RUN_FINISHED', threadId: 'conciv_1', runId: RUN_ID, finishReason: 'stop'})
      })
      return ok({ok: true, runId: RUN_ID})
    }
    if (path === 'sessions/attachDetach') {
      if (server.detachDelayMs) await wait(server.detachDelayMs)
      if (server.detach !== 'accept') return rejection(server.detach)
      return ok({ok: true})
    }
    throw new Error(`the fake core has no route for ${path}`)
  }
}

type Mounted = {server: Server; failures: string[]; setAttached: (value: boolean) => void}

function mountComposer(given: Partial<Server>): Mounted {
  const server: Server = {send: 'accept', detach: 'accept', calls: [], push: () => {}, ...given}
  installServer(server)
  const host = document.createElement('div')
  document.body.appendChild(host)
  const [attached, setAttached] = createSignal(false)
  const failures: string[] = []
  const rpc = makeRpcClient(BASE)

  const Harness = () => {
    const grabStore = makeGrabStore()
    const composerApi = {current: null as ComposerStateApi | null}
    const holder = {guard: null as SendGuard | null}
    const [force, setForce] = createSignal(false)
    const chat = useChatSession({
      rpc,
      sessionId: 'conciv_1',
      connection: {force: () => force()},
      onError: (error) => holder.guard?.rejected(error),
    })
    const delivery = {done: false}
    createEffect(() => {
      if (chat.status() === 'streaming') delivery.done = true
    })
    const guard = makeSendGuard({
      attached,
      delivered: () => delivery.done,
      snapshot: () => composerApi.current?.snapshotDraft() ?? null,
      restore: (draft) => composerApi.current?.restoreDraft(draft),
      clearDraft: () => composerApi.current?.clearDraft(),
      grabs: grabStore.grabs,
      stageGrabs: grabStore.stageAll,
      clearGrabs: grabStore.clear,
      focusComposer: () => {},
      detach: () => rpc.sessions.attachDetach({sessionId: 'conciv_1'}),
      dispatch: async (content, forced) => {
        setForce(forced)
        delivery.done = false
        await chat.sendMessage(content).finally(() => setForce(false))
      },
      onFailed: (error) => failures.push(error instanceof Error ? error.message : String(error)),
    })
    holder.guard = guard
    grabStore.stageTexts(['the save button'])
    return (
      <ChatProvider chat={chat}>
        <ComposerHandlersProvider value={{beforeSend: guard.beforeSend, onSend: guard.onSend}}>
          <ul>
            <For each={grabStore.grabs()}>{(grab) => <li>{grab.text}</li>}</For>
          </ul>
          <Composer inputLabel="Message the conciv agent">
            <ComposerStateBridge
              onReady={(api) => {
                composerApi.current = api
              }}
            />
          </Composer>
          <TerminalConflictDialog
            conflict={guard.conflict()}
            onCancel={guard.cancel}
            onTakeOver={guard.takeOver}
            onSendAnyway={guard.sendAnyway}
          />
        </ComposerHandlersProvider>
      </ChatProvider>
    )
  }

  const dispose = render(() => <Harness />, host)
  disposers.push(() => {
    dispose()
    host.remove()
  })
  return {server, failures, setAttached}
}

const input = () => page.getByRole('textbox', {name: 'Message the conciv agent'})
const grab = () => page.getByText('the save button')
const sends = (mounted: Mounted) => mounted.server.calls.filter((call) => call === 'chat/send')

async function typeAndSend(text: string): Promise<void> {
  await input().fill(text)
  await userEvent.keyboard('{Enter}')
}

async function modalTakesOverTheScreen(): Promise<void> {
  await expect.element(page.getByRole('alertdialog')).toBeVisible()
  await expect.element(input()).not.toBeInTheDocument()
}

async function modalIsGone(): Promise<void> {
  await expect.element(page.getByRole('alertdialog')).not.toBeInTheDocument()
  await expect.element(input()).toBeVisible()
}

test('a send the terminal blocked gives the message and its grabs back to the composer', async () => {
  const mounted = mountComposer({
    send: {code: 'EXTERNAL_BLOCKED', message: 'Claude is working in your terminal right now.'},
  })

  await typeAndSend('rename the widget package')
  await expect.element(page.getByText('Claude is working in your terminal right now.')).toBeVisible()
  await modalTakesOverTheScreen()

  await page.getByRole('button', {name: 'OK'}).click()

  await expect.element(input()).toHaveValue('rename the widget package')
  await expect.element(grab()).toBeVisible()
  expect(sends(mounted)).toHaveLength(1)
})

test('escape out of the terminal question is a plain cancel that keeps everything typed', async () => {
  mountComposer({send: {code: 'SESSION_ATTACHED', message: 'This session is driven from your terminal.'}})

  await typeAndSend('rename the widget package')
  await modalTakesOverTheScreen()

  await userEvent.keyboard('{Escape}')

  await modalIsGone()
  await expect.element(input()).toHaveValue('rename the widget package')
  await expect.element(grab()).toBeVisible()
})

test('a session already known to be driven from the terminal is never even sent', async () => {
  const mounted = mountComposer({})
  mounted.setAttached(true)

  await typeAndSend('rename the widget package')
  await modalTakesOverTheScreen()
  expect(sends(mounted)).toHaveLength(0)

  await page.getByRole('button', {name: 'Cancel'}).click()

  await modalIsGone()
  await expect.element(input()).toHaveValue('rename the widget package')
  await expect.element(grab()).toBeVisible()
})

test('taking over hands the terminal back and then sends the message exactly once', async () => {
  const mounted = mountComposer({})
  mounted.setAttached(true)

  await typeAndSend('rename the widget package')
  await modalTakesOverTheScreen()
  await page.getByRole('button', {name: 'Take over'}).click()

  await modalIsGone()
  await expect.element(input()).toHaveValue('')
  await expect.element(grab()).not.toBeInTheDocument()
  expect(mounted.server.calls.filter((call) => call === 'sessions/attachDetach')).toHaveLength(1)
  expect(sends(mounted)).toHaveLength(1)
})

test('a terminal that grabs the session back again is explained instead of asked twice', async () => {
  const mounted = mountComposer({
    send: {code: 'SESSION_ATTACHED', message: 'This session is driven from your terminal.'},
  })
  mounted.setAttached(true)

  await typeAndSend('rename the widget package')
  await modalTakesOverTheScreen()
  await page.getByRole('button', {name: 'Take over'}).click()

  await expect.element(page.getByText(TERMINAL_RECONNECTED, {exact: false})).toBeVisible()
  expect(page.getByRole('alertdialog').elements()).toHaveLength(1)
  await expect.element(page.getByRole('button', {name: 'Try again'})).toBeVisible()
})

test('a send that fails on the way out comes straight back to the composer with no question asked', async () => {
  const mounted = mountComposer({send: {plain: 'Failed to fetch'}})

  await typeAndSend('rename the widget package')

  await expect.element(input()).toHaveValue('rename the widget package')
  await expect.element(grab()).toBeVisible()
  expect(page.getByRole('alertdialog').elements()).toHaveLength(0)
  expect(mounted.failures).toHaveLength(1)
})

test('a take over that lands after the reader gave up cannot reopen the dialog or send', async () => {
  const mounted = mountComposer({detachDelayMs: 200})
  mounted.setAttached(true)

  await typeAndSend('rename the widget package')
  await modalTakesOverTheScreen()
  await page.getByRole('button', {name: 'Take over'}).click()
  await page.getByRole('button', {name: 'Cancel'}).click()

  await modalIsGone()
  await wait(400)

  expect(page.getByRole('alertdialog').elements()).toHaveLength(0)
  expect(sends(mounted)).toHaveLength(0)
  await expect.element(input()).toHaveValue('rename the widget package')
})
