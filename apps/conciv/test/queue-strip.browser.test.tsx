import './helpers/utilities.css'
import {render} from '@solidjs/testing-library'
import {createRoot, createSignal, onMount, type JSX} from 'solid-js'
import {afterEach, describe, expect, it, vi} from 'vitest'
import {page, userEvent} from 'vitest/browser'
import {
  createChat,
  createChatSession,
  type ChatSession,
  type ChatSessionConnection,
  type ChatSessionHydration,
} from '@conciv/ai/client'
import type {ContentPart} from '@conciv/protocol/chat-message-types'
import {ChatProvider, ComposerHandlersProvider, useComposer} from '@conciv/ui-kit-chat'
import {createTextChunks, storyConnection} from '@conciv/ai/testkit'
import {EngineReachabilityContext} from '../src/app/reachability.js'
import type {ComposerInputHandle} from '../src/pane/composer-input-adapter.jsx'
import {returnUnsentToDraft} from '../src/pane/pane-attachments.js'
import {PaneComposer} from '../src/pane/pane-composer.jsx'
import {QueueStrip} from '../src/pane/queue-strip.jsx'
import {memoryStorage} from './helpers/memory-storage.js'

function Harness(props: {count: number}): JSX.Element {
  const chat = createChat({
    threadId: 'queue-strip',
    connection: storyConnection({chunks: createTextChunks('working'), runsUntilStopped: true}),
    queue: {whenBusy: 'queue', drain: 'fifo'},
  })
  onMount(() => {
    void chat.sendMessage('active request')
    for (let index = 0; index < props.count; index += 1) void chat.sendMessage(`queued instruction ${index + 1}`)
  })
  return (
    <ChatProvider chat={chat}>
      <QueueStrip queue={chat.queue()} />
    </ChatProvider>
  )
}

function SwitchingHarness(): JSX.Element {
  const chatFor = (threadId: string) =>
    createChat({
      threadId,
      connection: storyConnection({chunks: createTextChunks('working'), runsUntilStopped: true}),
      queue: {whenBusy: 'queue', drain: 'fifo'},
    })
  const first = chatFor('queue-strip-first')
  const second = chatFor('queue-strip-second')
  const [current, setCurrent] = createSignal(first)
  onMount(() => {
    setCurrent(second)
    void second.sendMessage('active request')
    void second.sendMessage('queued after the switch')
  })
  return (
    <ChatProvider chat={current()}>
      <QueueStrip queue={current().queue()} />
    </ChatProvider>
  )
}

describe('QueueStrip', () => {
  it('renders no rows when the queue is empty', () => {
    const host = render(() => <QueueStrip queue={[]} />).container
    expect(host.textContent).toBe('')
  })

  it('shows a row per queued message, in order, once the composer queues work', async () => {
    render(() => <Harness count={2} />)
    await expect.element(page.getByText('Queue', {exact: true})).toBeVisible()
    await expect.element(page.getByText('2 waiting · runs in order')).toBeVisible()
    await expect.element(page.getByText('queued instruction 1')).toBeVisible()
    await expect.element(page.getByText('queued instruction 2')).toBeVisible()
  })

  it('Remove drops the queued message of the chat the strip shows after a session switch', async () => {
    render(() => <SwitchingHarness />)
    await expect.element(page.getByText('queued after the switch')).toBeVisible()
    await page.getByRole('button', {name: 'Remove from queue'}).click()
    await expect.element(page.getByText('queued after the switch')).not.toBeInTheDocument()
  })

  it('collapses beyond three rows into a "+N more" line', async () => {
    render(() => <Harness count={5} />)
    await expect.element(page.getByText('queued instruction 1')).toBeVisible()
    await expect.element(page.getByText('queued instruction 3')).toBeVisible()
    await expect.element(page.getByText('+2 more')).toBeVisible()
    expect(page.getByText('queued instruction 4').elements()).toHaveLength(0)
  })
})

describe('a later Stop returns a superseded queued flush to the draft', () => {
  afterEach(() => {
    for (const dispose of disposers.splice(0)) dispose()
  })

  it('appends the follow-up under typed text after a newer turn was started and stopped during the wait', async () => {
    const heldRefresh = Promise.withResolvers<ChatSessionHydration>()
    const refreshStarted = Promise.withResolvers<void>()
    const held = () => {
      refreshStarted.resolve()
      return heldRefresh.promise
    }
    const {sent, session: create} = sessionOverHeldRuns([held])
    const {session, cancel} = mountDraftPane(create)
    void session.sendMessage('first turn')
    await vi.waitFor(() => expect(sent).toEqual(['first turn']))
    await session.sendMessage('queued follow-up')
    const earlierCancel = cancel()
    await refreshStarted.promise
    void session.sendMessage('second turn')
    await vi.waitFor(() => expect(sent).toEqual(['first turn', 'second turn']))
    await cancel()
    await userEvent.click(page.getByRole('textbox', {name: 'Message'}))
    await userEvent.keyboard('still typing')
    await expect.element(draftOutput()).toHaveTextContent('"still typing"')
    heldRefresh.resolve(EMPTY_HYDRATION)
    await Promise.race([earlierCancel, vi.waitUntil(() => sent.length > 2)])
    expect(sent).toEqual(['first turn', 'second turn'])
    await expect.element(draftOutput()).toHaveTextContent('"still typing\\nqueued follow-up"')
  })

  it('returns only the unsent items, text in order and images as attachments, once a Stop lands mid-flush', async () => {
    const {sent, session: create} = sessionOverHeldRuns([])
    const {session, cancel, attached} = mountDraftPane(create)
    const multipart = (text: string): ContentPart[] => [{type: 'text', content: text}]
    void session.sendMessage('first turn')
    await vi.waitFor(() => expect(sent).toEqual(['first turn']))
    await session.sendMessage({content: multipart('queued one')})
    await session.sendMessage({content: multipart('queued two')})
    await session.sendMessage({
      content: [
        ...multipart('queued three'),
        {type: 'image', source: {type: 'data', mimeType: 'image/png', value: PNG_PIXEL}},
      ],
    })
    const flush = cancel()
    await vi.waitFor(() => expect(sent).toEqual(['first turn', 'queued one']))
    await session.stop()
    await Promise.race([flush, vi.waitUntil(() => sent.length > 2)])
    expect(sent).toEqual(['first turn', 'queued one'])
    await expect.element(draftOutput()).toHaveTextContent('"queued two\\nqueued three"')
    expect(attached.map((file) => file.type)).toEqual(['image/png'])
  })
})

const PNG_PIXEL = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='

const EMPTY_HYDRATION: ChatSessionHydration = {messages: [], lastRun: null, pendingApprovals: []}

type SentMessages = Parameters<ChatSessionConnection['send']>[0]

function lastUserText(messages: SentMessages): string {
  const last = messages.at(-1)
  if (!last || !('parts' in last)) return ''
  return last.parts.flatMap((part) => (part.type === 'text' ? [part.content] : [])).join(' ')
}

const abortOf = (signal: AbortSignal | undefined): Promise<void> =>
  new Promise((resolve) => signal?.addEventListener('abort', () => resolve(), {once: true}))

function sessionOverHeldRuns(refreshes: Array<() => Promise<ChatSessionHydration>>) {
  const sent: string[] = []
  const connection: ChatSessionConnection = {
    subscribe: async function* (signal) {
      await abortOf(signal)
      yield* []
    },
    send: async (messages, _data, signal) => {
      sent.push(lastUserText(messages))
      await abortOf(signal)
    },
    refresh: () => refreshes.shift()?.() ?? Promise.resolve(EMPTY_HYDRATION),
    close: () => undefined,
  }
  return {
    sent,
    session: (): ChatSession =>
      createChatSession({
        sessionId: 'queue-flush',
        connect: () => connection,
        stop: () => Promise.resolve(),
        decide: () => Promise.resolve({startsTurn: false}),
      }),
  }
}

const draftOutput = () => page.getByRole('status', {name: 'Draft'})

function DraftOutput(): JSX.Element {
  const composer = useComposer()
  return <output aria-label="Draft">{JSON.stringify(composer.text())}</output>
}

const disposers: Array<() => void> = []

function mountDraftPane(create: () => ChatSession) {
  const attached: File[] = []
  const inputs: ComposerInputHandle[] = []
  const session = createRoot((dispose) => {
    disposers.push(dispose)
    return create()
  })
  render(() => (
    <EngineReachabilityContext.Provider value={{online: () => true, sustainedOffline: () => false}}>
      <ChatProvider chat={session}>
        <ComposerHandlersProvider value={{}}>
          <PaneComposer
            draftStorage={memoryStorage()}
            draftKey="queue-flush"
            placeholder="Ask anything…"
            inputLabel="Message"
            onInputReady={(handle) => inputs.push(handle)}
          >
            <DraftOutput />
          </PaneComposer>
        </ComposerHandlersProvider>
      </ChatProvider>
    </EngineReachabilityContext.Provider>
  ))
  const sink = {
    insert: (text: string) => inputs[0]?.append(text),
    addFile: (file: File) => void attached.push(file),
  }
  const cancel = () => session.interruptAndFlush().then((unsent) => returnUnsentToDraft(unsent, sink))
  return {session, cancel, attached}
}
