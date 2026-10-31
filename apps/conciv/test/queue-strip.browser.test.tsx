import './helpers/utilities.css'
import {render} from '@solidjs/testing-library'
import {createRoot, createSignal, onMount, type JSX} from 'solid-js'
import {afterEach, describe, expect, it, vi} from 'vitest'
import {page} from 'vitest/browser'
import {
  createChat,
  createChatSession,
  type ChatSession,
  type ChatSessionConnection,
  type ChatSessionHydration,
} from '@conciv/ai/client'
import {ChatProvider} from '@conciv/ui-kit-chat'
import {createTextChunks, storyConnection} from '@conciv/ai/testkit'
import {QueueStrip} from '../src/pane/queue-strip.jsx'

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

describe('a later Stop cancels a queued flush still waiting on an earlier one', () => {
  const disposers: Array<() => void> = []
  const mounted = (create: () => ChatSession): ChatSession =>
    createRoot((dispose) => {
      disposers.push(dispose)
      return create()
    })

  afterEach(() => {
    for (const dispose of disposers.splice(0)) dispose()
  })

  it('does not send the follow-up after a newer turn was started and stopped during the wait', async () => {
    const heldRefresh = Promise.withResolvers<ChatSessionHydration>()
    const refreshStarted = Promise.withResolvers<void>()
    const held = () => {
      refreshStarted.resolve()
      return heldRefresh.promise
    }
    const {sent, session: create} = sessionOverHeldRuns([held])
    const session = mounted(create)
    void session.sendMessage('first turn')
    await vi.waitFor(() => expect(sent).toEqual(['first turn']))
    await session.sendMessage('queued follow-up')
    const earlierFlush = session.interruptAndFlush()
    await refreshStarted.promise
    void session.sendMessage('second turn')
    await vi.waitFor(() => expect(sent).toEqual(['first turn', 'second turn']))
    await session.interruptAndFlush()
    heldRefresh.resolve(EMPTY_HYDRATION)
    await Promise.race([earlierFlush, vi.waitUntil(() => sent.length > 2)])
    expect(sent).toEqual(['first turn', 'second turn'])
  })

  it('stops walking a multipart queue once a Stop lands mid-flush', async () => {
    const {sent, session: create} = sessionOverHeldRuns([])
    const session = mounted(create)
    const multipart = (text: string) => [{type: 'text' as const, content: text}]
    void session.sendMessage('first turn')
    await vi.waitFor(() => expect(sent).toEqual(['first turn']))
    await session.sendMessage({content: multipart('queued one')})
    await session.sendMessage({content: multipart('queued two')})
    const flush = session.interruptAndFlush()
    await vi.waitFor(() => expect(sent).toEqual(['first turn', 'queued one']))
    await session.stop()
    await Promise.race([flush, vi.waitUntil(() => sent.length > 2)])
    expect(sent).toEqual(['first turn', 'queued one'])
  })
})
