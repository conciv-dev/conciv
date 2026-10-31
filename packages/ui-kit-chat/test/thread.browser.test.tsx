import 'virtual:uno.css'
import '@conciv/ui-kit-system/tokens.css'
import '@conciv/ui-kit-chat/theme/tokens.css'
import {type JSX, createSignal, onMount, untrack, type ParentProps, For} from 'solid-js'
import {page, userEvent, type Locator} from 'vitest/browser'
import {expect, it, beforeEach, describe} from 'vitest'
import type {ChatPart, ToolCallPart, ChatMessage} from '@conciv/protocol/chat-message-types'
import type {ToolCardEntry, ToolCardProps, ToolViewCtx} from '@conciv/protocol/tool-view-types'
import {Activity} from '../src/styled/activity.js'
import {
  catalogOf,
  ctxWith,
  mountView,
  RunSettledIndicator,
  startRun,
  waitForRunSettled,
  haltRun,
  streamingThread,
} from './helpers.js'
import {createChat, type Chat} from '@conciv/ai/client'
import {ChatProvider} from '../src/store/chat-context.js'
import {ToolProvider} from '../src/store/tool-context.js'
import {
  createReasoningChunks,
  createToolCallChunks,
  storyConnection,
  createTextChunks,
  type StoryConnectionOptions,
} from '@conciv/ai/testkit'
import {Thread} from '../src/styled/thread.js'
import {
  PAGE_SESSION_GROUP_KEY,
  type GroupEntry,
  type GroupRenderProps,
  type Turn,
  type Grouper,
  type GroupKey,
  type Grouping,
} from '../src/store/grouping.js'
import {pageSessionCallParts, type PageSessionConfig, pageSessionThinkingParts} from '../src/store/page-session.js'
import {VIRTUALIZE_THRESHOLD} from '../src/primitives/thread/virtualize-threshold.js'
import {Message} from '../src/primitives/message/message.js'
import {MessageProvider} from '../src/primitives/message/message-context.js'
import {NowLine} from '../src/styled/now-line.js'
import {StatusVisual} from '../src/tools/primitives/status-visual.js'
import {ErrorBlock} from '../src/tools/styled/error-block.js'
import type {ToolStatus} from '../src/tools/primitives/tool-status.js'
import {TraceOutputBlock} from '../src/styled/trace/output-block.js'
import type {PermissionScope} from '@conciv/protocol/chat-types'
import {TracePermissionBlock} from '../src/styled/trace/permission-block.js'
import {Trace, type TraceItem} from '../src/styled/trace/trace.js'
import {TraceToolRow} from '../src/styled/trace/trace-row.js'
import {TraceActionRow} from '../src/styled/trace/action-row.js'
import {Thread as PrimitiveThread} from '../src/primitives/thread/thread.js'

describe('bottom pinned log scrollers', () => {
  const FULLY_IN_VIEWPORT = {ratio: 0.99}
  const LINE_COUNT = 60

  function turns(count: number): ChatMessage[] {
    return Array.from({length: count}, (_, index) => ({
      id: `m${index}`,
      role: index % 2 === 0 ? 'user' : 'assistant',
      parts: [{type: 'text', content: `timeline entry ${index}`}],
    }))
  }

  it('keeps the newest activity turn showing as the timeline grows', async () => {
    const [messages, setMessages] = createSignal(turns(3))
    function View(): JSX.Element {
      return (
        <div class="flex flex-col h-96 w-96">
          <Activity.Root messages={messages()}>
            <Activity.Timeline aria-label="Activity" />
          </Activity.Root>
        </div>
      )
    }
    mountView(() => <View />)

    await expect.element(page.getByText('timeline entry 0')).toBeInViewport(FULLY_IN_VIEWPORT)

    setMessages(turns(LINE_COUNT))

    await expect.element(page.getByText(`timeline entry ${LINE_COUNT - 1}`)).toBeInViewport(FULLY_IN_VIEWPORT)
    await expect.element(page.getByText('timeline entry 0')).not.toBeInViewport()
  })
})

describe('empty group suppression', () => {
  function dataPart(): ChatPart {
    return {type: 'structured-output', status: 'complete', raw: '{"done":true}', data: {done: true}}
  }

  function staticThread(parts: ChatPart[]): () => JSX.Element {
    const messages: ChatMessage[] = [
      {id: 'u1', role: 'user', parts: [{type: 'text', content: 'go'}]},
      {id: 'a1', role: 'assistant', parts},
    ]
    return function StaticThread(): JSX.Element {
      const chat = createChat({threadId: 'empty-group-suppression', connection: storyConnection()})
      onMount(() => chat.setMessages(messages))
      return (
        <ChatProvider chat={chat}>
          <Thread>
            <Thread.Viewport>
              <Thread.Messages />
            </Thread.Viewport>
          </Thread>
        </ChatProvider>
      )
    }
  }

  it('renders no group wrapper for a run of unrenderable data parts', async () => {
    mountView(staticThread([dataPart(), dataPart(), {type: 'text', content: 'All set.'}]))

    await expect.element(page.getByText('All set.'), {timeout: 3000}).toBeVisible()
    await expect.element(page.getByRole('button', {name: /trace/i})).not.toBeInTheDocument()
  })
})

describe('latest chip overlay', () => {
  const exchangeCount = VIRTUALIZE_THRESHOLD
  const lastExchange = exchangeCount - 1
  const lastAnswer = Array.from({length: 6}, () => `answer number ${lastExchange}`).join(' ')

  function longThread(): ChatMessage[] {
    return Array.from({length: exchangeCount}, (_, index): ChatMessage[] => [
      {id: `u${index}`, role: 'user', parts: [{type: 'text', content: `question number ${index}`}]},
      {id: `a${index}`, role: 'assistant', parts: [{type: 'text', content: `answer number ${index}\n`.repeat(6)}]},
    ]).flat()
  }

  function TallThread(): JSX.Element {
    const chat = createChat({threadId: 'latest-chip-overlay', connection: storyConnection()})
    onMount(() => chat.setMessages(longThread()))
    return (
      <ChatProvider chat={chat}>
        <div style={{height: '360px', width: '520px'}}>
          <Thread>
            <Thread.Viewport>
              <Thread.Messages />
            </Thread.Viewport>
          </Thread>
        </div>
      </ChatProvider>
    )
  }

  function viewportEl(container: HTMLElement): HTMLElement {
    const viewport = container.querySelector('[data-thread-viewport]')
    if (!(viewport instanceof HTMLElement)) throw new Error('expected the thread viewport')
    return viewport
  }

  function chipWrapper(container: HTMLElement): HTMLElement {
    const wrapper = viewportEl(container).nextElementSibling
    if (!(wrapper instanceof HTMLElement)) throw new Error('expected the latest chip wrapper')
    return wrapper
  }

  it('shows the Latest chip as an overlay outside the scroll content of a virtualized thread', async () => {
    const container = mountView(() => <TallThread />)
    await expect.element(page.getByText(lastAnswer)).toBeVisible()
    await expect.element(page.getByText('question number 0')).not.toBeInTheDocument()

    const viewport = viewportEl(container)
    await expect.element(page.elementLocator(viewport)).toHaveAttribute('data-at-bottom', '')
    expect(chipWrapper(container).inert).toBe(true)

    await userEvent.wheel(viewport, {delta: {y: -600}})
    await expect.element(page.elementLocator(viewport)).not.toHaveAttribute('data-at-bottom')
    await expect.element(page.getByText('Latest')).toBeVisible()
    expect(chipWrapper(container).inert).toBe(false)
    expect(viewport.contains(chipWrapper(container))).toBe(false)

    await page.getByText('Latest').click()
    await expect.element(page.elementLocator(viewport)).toHaveAttribute('data-at-bottom', '')
    await expect.element(page.getByText(lastAnswer)).toBeVisible()
    expect(chipWrapper(container).inert).toBe(true)
  })
})

describe('message if has text', () => {
  const GROUNDING = '<article class="card">Server Functions</article> at src/routes/index.tsx:44:9'

  function grabDocumentPart(): ChatPart {
    return {
      type: 'document',
      source: {type: 'data', value: 'e30=', mimeType: 'application/vnd.conciv.grab+json'},
    }
  }

  function modelOnlyText(): ChatPart {
    const part: ChatPart = {type: 'text', content: GROUNDING}
    return Object.assign(part, {metadata: {modelOnly: true}})
  }

  function visibleText(): ChatPart {
    return {type: 'text', content: 'explain this'}
  }

  function turnOf(parts: ChatPart[]): Turn {
    return {key: 'turn-1', role: 'user', parts, start: 0, end: 0}
  }

  function Host(props: ParentProps<{parts: ChatPart[]}>): JSX.Element {
    const chat = createChat({threadId: 'message-if-has-text', connection: storyConnection(untrack(() => undefined))})
    const turn = untrack(() => turnOf(props.parts))
    return (
      <ChatProvider chat={chat}>
        <MessageProvider
          value={{
            message: () => turn,
            index: () => 0,
            pairing: () => ({byCallId: new Map(), hiddenResultIds: new Set<string>()}),
            isLast: () => true,
          }}
        >
          {props.children}
        </MessageProvider>
      </ChatProvider>
    )
  }

  function mount(parts: ChatPart[]): void {
    mountView(() => (
      <Host parts={parts}>
        <Message.If hasText>
          <span>bubble drawn</span>
        </Message.If>
      </Host>
    ))
  }

  it('a grab-only turn whose only text is model-only draws no bubble', async () => {
    mount([grabDocumentPart(), modelOnlyText()])

    await expect.element(page.getByText('bubble drawn')).not.toBeInTheDocument()
  })

  it('a turn with visible text still draws its bubble', async () => {
    mount([grabDocumentPart(), visibleText()])

    await expect.element(page.getByText('bubble drawn')).toBeVisible()
  })
})

describe('nested group rendering', () => {
  const OUTER_KEY: GroupKey = 'group-outer'
  const INNER_KEY: GroupKey = 'group-inner'
  const MYSTERY_KEY: GroupKey = 'group-mystery'

  function grouperByText(pathOf: (content: string) => readonly GroupKey[] | null): Grouper {
    return (parts) =>
      parts.map((part) => {
        if (part.type !== 'text') return null
        return pathOf(part.content)
      })
  }

  function wrapperEntry(key: GroupKey, label: string): GroupEntry {
    return {
      key,
      render: (props: GroupRenderProps) => (
        <div>
          <span>{label}</span>
          {props.children}
        </div>
      ),
    }
  }

  function messagesWith(parts: ChatPart[]): ChatMessage[] {
    return [
      {id: 'u1', role: 'user', parts: [{type: 'text', content: 'go'}]},
      {id: 'a1', role: 'assistant', parts},
    ]
  }

  function staticThread(parts: ChatPart[], grouping: Grouping, groupEntries: readonly GroupEntry[]): () => JSX.Element {
    return function StaticThread(): JSX.Element {
      const chat = createChat({threadId: 'nested-group-rendering', connection: storyConnection()})
      onMount(() => chat.setMessages(messagesWith(parts)))
      return (
        <ChatProvider chat={chat}>
          <Thread>
            <Thread.Viewport>
              <Thread.Messages grouping={grouping} groupEntries={groupEntries} />
            </Thread.Viewport>
          </Thread>
        </ChatProvider>
      )
    }
  }

  it('renders a registered child entry inside its parent entry children slot', async () => {
    const grouping: Grouping = {grouper: grouperByText(() => [OUTER_KEY, INNER_KEY]), context: {}}
    mountView(
      staticThread([{type: 'text', content: 'nested body'}], grouping, [
        wrapperEntry(OUTER_KEY, 'outer wrapper'),
        wrapperEntry(INNER_KEY, 'inner wrapper'),
      ]),
    )

    await expect.element(page.getByText('outer wrapper'), {timeout: 3000}).toBeVisible()
    await expect.element(page.getByText('inner wrapper'), {timeout: 3000}).toBeVisible()
    await expect.element(page.getByText('nested body'), {timeout: 3000}).toBeVisible()
  })

  it('flattens an unregistered child group key and renders its leaves in place', async () => {
    const grouping: Grouping = {grouper: grouperByText(() => [OUTER_KEY, MYSTERY_KEY]), context: {}}
    mountView(
      staticThread([{type: 'text', content: 'nested body'}], grouping, [wrapperEntry(OUTER_KEY, 'outer wrapper')]),
    )

    await expect.element(page.getByText('outer wrapper'), {timeout: 3000}).toBeVisible()
    await expect.element(page.getByText('nested body'), {timeout: 3000}).toBeVisible()
  })

  it('flattens an unregistered top-level group key without a wrapper', async () => {
    const grouping: Grouping = {grouper: grouperByText(() => [MYSTERY_KEY]), context: {}}
    mountView(staticThread([{type: 'text', content: 'top body'}], grouping, []))

    await expect.element(page.getByText('top body'), {timeout: 3000}).toBeVisible()
  })
})

describe('now line', () => {
  const TIMEOUT_MS = 3000

  const spinnerGlyph = () => page.getByText(/^[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏]$/)

  const FRAME = 'dark p-3 w-[26rem] [background:var(--chat-bg)] [font-family:var(--chat-font)]'

  function framed(child: JSX.Element): JSX.Element {
    return <div class={FRAME}>{child}</div>
  }

  function withReducedMotion(): () => void {
    const original = window.matchMedia
    const reduced = original('(prefers-reduced-motion: reduce)')
    Object.defineProperty(reduced, 'matches', {value: true})
    window.matchMedia = (query: string) => (query === '(prefers-reduced-motion: reduce)' ? reduced : original(query))
    return () => {
      window.matchMedia = original
    }
  }

  it('narrates on one quiet mono line led by a visible braille spinner glyph', async () => {
    mountView(() => framed(<NowLine title="Running pnpm test" />))

    await expect.element(page.getByText('Running pnpm test', {exact: true})).toBeVisible()
    await page.screenshot({path: '__screenshots__/now-line/quiet-narration-line.png'})
    await expect.element(spinnerGlyph(), {timeout: TIMEOUT_MS}).toBeVisible()
  })

  it('freezes the spinner glyph visible under prefers-reduced-motion instead of hiding it', async () => {
    const restore = withReducedMotion()
    mountView(() => framed(<NowLine title="Reading widget-shell.tsx" />))

    await expect.element(page.getByText('⠿', {exact: true}), {timeout: TIMEOUT_MS}).toBeVisible()
    restore()
  })

  it('offers a mono text Stop affordance that matches the composer controls', async () => {
    const stopped: string[] = []
    mountView(() => framed(<NowLine title="Running pnpm test" onStop={() => stopped.push('stop')} />))

    const stop = page.getByRole('button', {name: 'Stop generating'})
    await expect.element(stop).toBeVisible()
    await expect.element(stop).toHaveTextContent('Stop')
    await page.screenshot({path: '__screenshots__/now-line/with-stop.png'})

    await userEvent.click(stop)
    await expect.element(page.getByText('Running pnpm test', {exact: true})).toBeVisible()
    expect(stopped).toEqual(['stop'])
  })
})

describe('page session injection', () => {
  function StubSessionCard(props: GroupRenderProps): JSX.Element {
    const parts = () => pageSessionCallParts(props.parts(), props.node.indices)
    const thinking = () => pageSessionThinkingParts(props.parts(), props.node.indices)
    return (
      <div>
        <span>{props.streaming ? 'session live' : 'session settled'}</span>
        <span>{`session acts ${parts().length}`}</span>
        <span>{`first result ${props.resultFor(parts()[0]?.id ?? '') === undefined ? 'missing' : 'paired'}`}</span>
        <span>{`session thinking ${thinking().length}`}</span>
      </div>
    )
  }

  const PAGE_SESSION_ENTRY: GroupEntry = {key: PAGE_SESSION_GROUP_KEY, render: StubSessionCard}

  const PAGE_SESSION: PageSessionConfig = {
    entry: PAGE_SESSION_ENTRY,
    actNames: new Set(['page_fill', 'page_check']),
    toolPrefix: 'page_',
  }

  function fillChunks(toolCallId: string, withResult: boolean) {
    return createToolCallChunks(
      'page_fill',
      {selector: '#field', value: 'hello'},
      {toolCallId, ...(withResult ? {result: '{"ok":true,"value":"hello"}'} : {})},
    )
  }

  function threadHarness(
    options: Parameters<typeof storyConnection>[0],
    pageSession?: PageSessionConfig,
  ): () => JSX.Element {
    return function ThreadHarness(): JSX.Element {
      const chat = createChat({threadId: 'page-session-injection', connection: storyConnection(options)})
      return (
        <ChatProvider chat={chat}>
          <button type="button" onClick={() => void chat.sendMessage('drive the page')}>
            ask
          </button>
          <button type="button" onClick={() => void chat.stop()}>
            halt
          </button>
          <Thread>
            <Thread.Viewport>
              <Thread.Messages pageSession={pageSession} />
            </Thread.Viewport>
          </Thread>
        </ChatProvider>
      )
    }
  }

  it('renders one injected page-session card with the reply and no chain for a settled act run', async () => {
    mountView(
      threadHarness(
        {
          chunks: [...fillChunks('f1', true), ...fillChunks('f2', true), ...createTextChunks('Filled the form.')],
          chunkDelay: 1,
        },
        PAGE_SESSION,
      ),
    )

    await page.getByRole('button', {name: 'ask'}).click()

    await expect.element(page.getByText('Filled the form.'), {timeout: 3000}).toBeVisible()
    await expect.element(page.getByText('session settled')).toBeVisible()
    await expect.element(page.getByText('session acts 2')).toBeVisible()
    await expect.element(page.getByText('first result paired')).toBeVisible()
    expect(page.getByText('session settled').elements()).toHaveLength(1)
    await expect.element(page.getByRole('button', {name: /trace/i})).not.toBeInTheDocument()
  })

  it('marks the trailing page-session streaming while the run is live and settles it on stop', async () => {
    mountView(
      threadHarness(
        {chunks: [...fillChunks('f1', true), ...fillChunks('f2', false)], runsUntilStopped: true},
        PAGE_SESSION,
      ),
    )

    await page.getByRole('button', {name: 'ask'}).click()
    await expect.element(page.getByText('session live'), {timeout: 3000}).toBeVisible()

    await page.getByRole('button', {name: 'halt'}).click()
    await expect.element(page.getByText('session settled'), {timeout: 3000}).toBeVisible()
  })

  it('keeps the flat chain rendering when no page-session config is passed', async () => {
    mountView(
      threadHarness({chunks: [...fillChunks('f1', true), ...createTextChunks('Filled the form.')], chunkDelay: 1}),
    )

    await page.getByRole('button', {name: 'ask'}).click()

    await expect.element(page.getByText('Filled the form.'), {timeout: 3000}).toBeVisible()
    await expect
      .element(page.getByRole('button', {name: /trace/i}), {timeout: 3000})
      .toHaveAttribute('data-state', 'open')
    await expect.element(page.getByText('session settled')).not.toBeInTheDocument()
  })

  function user(id: string, text: string): ChatMessage {
    return {id, role: 'user', parts: [{type: 'text', content: text}]}
  }

  function assistant(id: string, parts: ChatPart[]): ChatMessage {
    return {id, role: 'assistant', parts}
  }

  function call(id: string, name: string, state: ToolCallPart['state']): ChatPart {
    return {type: 'tool-call', id, name, arguments: '{}', state}
  }

  function subCall(id: string, name: string, parent: string, state: ToolCallPart['state']): ChatPart {
    const part: ToolCallPart & {metadata?: {parentToolCallId?: string}} = {
      type: 'tool-call',
      id,
      name,
      arguments: '{}',
      state,
      metadata: {parentToolCallId: parent},
    }
    return part
  }

  function result(toolCallId: string, state: 'complete' | 'error'): ChatPart {
    return {type: 'tool-result', toolCallId, content: '{"ok":true}', state}
  }

  const label = (part: ToolCallPart): string => part.name

  function ActivityHarness(props: {messages: ChatMessage[]; live?: boolean}): JSX.Element {
    return (
      <div class="flex flex-col h-96 w-96">
        <Activity.Root messages={props.messages} live={props.live} label={label} pageSession={PAGE_SESSION}>
          <Activity.Timeline />
        </Activity.Root>
      </div>
    )
  }

  it('settles a live activity session once a trailing reply follows the acts', async () => {
    mountView(() => (
      <ActivityHarness
        live
        messages={[
          user('u1', 'drive the page'),
          assistant('a1', [
            call('f1', 'page_fill', 'complete'),
            result('f1', 'complete'),
            {type: 'text', content: 'Form handled.'},
          ]),
        ]}
      />
    ))

    await expect.element(page.getByText('session settled'), {timeout: 3000}).toBeVisible()
    await expect.element(page.getByText('Form handled.')).toBeVisible()
  })

  it('renders a settled page-session between reply prose without a steps group', async () => {
    mountView(() => (
      <ActivityHarness
        messages={[
          user('u1', 'drive the page'),
          assistant('a1', [
            call('f1', 'page_fill', 'complete'),
            result('f1', 'complete'),
            call('c1', 'page_check', 'complete'),
            result('c1', 'complete'),
            {type: 'text', content: 'Form handled.'},
          ]),
        ]}
      />
    ))

    await expect.element(page.getByText('session settled'), {timeout: 3000}).toBeVisible()
    await expect.element(page.getByText('session acts 2')).toBeVisible()
    await expect.element(page.getByText('Form handled.')).toBeVisible()
    await expect.element(page.getByRole('button', {name: /steps?$/})).not.toBeInTheDocument()
  })

  it('folds a code-mode run into the session card and absorbs its parent and thinking', async () => {
    mountView(() => (
      <ActivityHarness
        messages={[
          user('u1', 'drive the page through code'),
          assistant('a1', [
            call('p1', 'execute_typescript', 'complete'),
            {type: 'thinking', content: 'pick the field to edit'},
            subCall('s1', 'page_fill', 'p1', 'complete'),
            result('s1', 'complete'),
            result('p1', 'complete'),
          ]),
        ]}
      />
    ))

    await expect.element(page.getByText('session acts 2'), {timeout: 3000}).toBeVisible()
    await expect.element(page.getByRole('button', {name: /steps?$/})).not.toBeInTheDocument()
    await expect.element(page.getByRole('button', {name: 'execute_typescript'})).not.toBeInTheDocument()
  })

  it('hands the folded thinking parts to the injected renderer', async () => {
    mountView(() => (
      <ActivityHarness
        messages={[
          user('u1', 'drive the page through code'),
          assistant('a1', [
            call('p1', 'execute_typescript', 'complete'),
            {type: 'thinking', content: 'choose the field'},
            subCall('s1', 'page_fill', 'p1', 'complete'),
            result('s1', 'complete'),
            result('p1', 'complete'),
          ]),
        ]}
      />
    ))

    await expect.element(page.getByText('session thinking 1'), {timeout: 3000}).toBeVisible()
  })
})

describe('standalone tool outside chain', () => {
  function ConfirmCard(props: ToolCardProps): JSX.Element {
    return <p>Confirm this action for {props.part.name}</p>
  }

  const entries: ToolCardEntry[] = [
    {names: ['confirm_ui'], render: ConfirmCard, hasEmbeddedBody: () => true, display: 'standalone'},
  ]

  function StandaloneThread(): JSX.Element {
    const chat = createChat({
      threadId: 'standalone-tool-outside-chain',
      connection: storyConnection({
        chunks: [
          ...createReasoningChunks('deciding what to confirm'),
          ...createToolCallChunks('Bash', {command: 'ls'}, {result: 'ok'}),
          ...createToolCallChunks('confirm_ui', {question: 'proceed?'}, {result: 'confirmed'}),
        ],
        chunkDelay: 30,
      }),
    })
    return (
      <ChatProvider chat={chat}>
        <ToolProvider value={ctxWith(catalogOf({}))}>
          <button type="button" onClick={() => void chat.sendMessage('ask me')}>
            ask
          </button>
          <RunSettledIndicator />
          <Thread>
            <Thread.Viewport>
              <Thread.Messages tools={entries} />
            </Thread.Viewport>
          </Thread>
        </ToolProvider>
      </ChatProvider>
    )
  }

  it('renders a standalone tool card outside the trace, whose trace stays open once the session settles', async () => {
    mountView(() => <StandaloneThread />)

    await startRun()
    await waitForRunSettled()

    const trigger = page.getByRole('button', {name: /trace/i})
    await expect.element(trigger, {timeout: 3000}).toHaveAttribute('data-state', 'open')

    await expect.element(page.getByText('Confirm this action for confirm_ui'), {timeout: 3000}).toBeVisible()

    expect(trigger.all()).toHaveLength(1)
  })
})

describe('status visual', () => {
  const STATUSES: Array<ToolStatus> = ['running', 'complete', 'error', 'approval']

  it('gives each status its own accessible name in dot form, distinguishing them without relying on color', async () => {
    mountView(() => <For each={STATUSES}>{(status) => <StatusVisual status={status} form="dot" />}</For>)

    await expect.element(page.getByRole('img', {name: 'running'})).toBeVisible()
    await expect.element(page.getByRole('img', {name: 'complete'})).toBeVisible()
    await expect.element(page.getByRole('img', {name: 'error'})).toBeVisible()
    await expect.element(page.getByRole('img', {name: 'needs approval'})).toBeVisible()
  })

  it('shows the default "Error" label and the message', async () => {
    mountView(() => <ErrorBlock message="nothing on the page matches that selector" />)

    await expect.element(page.getByText('Error')).toBeVisible()
    await expect.element(page.getByText('nothing on the page matches that selector')).toBeVisible()
  })
})

describe('thinking narration', () => {
  const TIMEOUT_MS = 3000

  function staticThread(parts: ChatPart[]): () => JSX.Element {
    const messages: ChatMessage[] = [
      {id: 'u1', role: 'user', parts: [{type: 'text', content: 'go'}]},
      {id: 'a1', role: 'assistant', parts},
    ]
    return function StaticThread(): JSX.Element {
      const chat = createChat({threadId: 'thinking-narration', connection: storyConnection()})
      onMount(() => chat.setMessages(messages))
      return (
        <ChatProvider chat={chat}>
          <Thread>
            <Thread.Viewport>
              <Thread.Messages />
            </Thread.Viewport>
          </Thread>
        </ChatProvider>
      )
    }
  }

  const traceTrigger = () => page.getByRole('button', {name: /trace/i})

  it('keeps a readable trace for a segment that only reasoned and ran no tool', async () => {
    mountView(
      staticThread([
        {type: 'thinking', content: 'weighing the rename against the call sites'},
        {type: 'text', content: 'All set.'},
      ]),
    )

    await expect.element(traceTrigger(), {timeout: TIMEOUT_MS}).toHaveAttribute('data-state', 'open')
    await expect
      .element(page.getByText('weighing the rename against the call sites'), {timeout: TIMEOUT_MS})
      .toBeVisible()
    await userEvent.click(traceTrigger())
    await expect.element(page.getByText('reasoning', {exact: true})).toBeVisible()
    await page.screenshot({path: '__screenshots__/thinking-narration/reasoning-only-trace.png'})
  })

  const RUNNING_TOOL_CHUNKS = [
    ...createReasoningChunks('mapping the repo'),
    ...createToolCallChunks('Bash', {command: 'ls'}),
  ]

  it('narrates the running tool on the collapsed trace line instead of a tally', async () => {
    mountView(streamingThread(RUNNING_TOOL_CHUNKS, 10))

    await startRun()
    await expect.element(traceTrigger(), {timeout: TIMEOUT_MS}).toHaveAttribute('data-state', 'open')
    await userEvent.click(traceTrigger())
    await expect.element(traceTrigger()).toHaveAttribute('data-state', 'closed')
    await expect.element(page.getByText('Running ls', {exact: true}), {timeout: TIMEOUT_MS}).toBeVisible()
    await page.screenshot({path: '__screenshots__/thinking-narration/collapsed-activity-line.png'})

    await haltRun()
  })
})

describe('thread composition', () => {
  function ComposedThread(): JSX.Element {
    const chat = createChat({
      threadId: 'thread-composition',
      connection: storyConnection({chunks: [...createTextChunks('On it.')], chunkDelay: 2}),
    })
    return (
      <ChatProvider chat={chat}>
        <button type="button" onClick={() => void chat.sendMessage('hello there')}>
          ask
        </button>
        <Thread>
          <Thread.Viewport>
            <Thread.Welcome>
              <span>Ask anything to begin.</span>
            </Thread.Welcome>
            <Thread.Messages />
            <span>footer line</span>
          </Thread.Viewport>
          <Thread.Composer>
            <span>composer region</span>
          </Thread.Composer>
        </Thread>
      </ChatProvider>
    )
  }

  it('shows welcome only while the thread is empty and keeps the composed regions', async () => {
    mountView(() => <ComposedThread />)

    await expect.element(page.getByText('Ask anything to begin.'), {timeout: 2000}).toBeVisible()
    await expect.element(page.getByText('composer region')).toBeVisible()
    await expect.element(page.getByText('footer line')).toBeVisible()

    await page.getByRole('button', {name: 'ask'}).click()

    await expect.element(page.getByText('hello there'), {timeout: 2000}).toBeVisible()
    await expect.element(page.getByText('On it.'), {timeout: 2000}).toBeVisible()
    await expect.element(page.getByText('Ask anything to begin.')).not.toBeInTheDocument()
    await expect.element(page.getByText('composer region')).toBeVisible()
  })
})

describe('thread session log', () => {
  function LogThread(props: {messages: ChatMessage[]}): JSX.Element {
    const chat = createChat({threadId: 'thread-session-log', connection: storyConnection()})
    onMount(() => chat.setMessages(props.messages))
    return (
      <ChatProvider chat={chat}>
        <ToolProvider value={ctxWith(catalogOf({}))}>
          <Thread>
            <Thread.Viewport>
              <Thread.Messages />
            </Thread.Viewport>
          </Thread>
        </ToolProvider>
      </ChatProvider>
    )
  }

  function messagesWithSettledTrace(): ChatMessage[] {
    return [
      {id: 'u1', role: 'user', parts: [{type: 'text', content: 'find the leak'}]},
      {
        id: 'a1',
        role: 'assistant',
        parts: [
          {type: 'thinking', content: 'checking the event listeners first'},
          {
            type: 'tool-call',
            id: 'call1',
            name: 'bash',
            arguments: '{"command":"grep -rn addEventListener src"}',
            input: {command: 'grep -rn addEventListener src'},
            state: 'complete',
            output: 'src/watcher.ts:12',
          },
          {type: 'text', content: 'Found it in watcher.ts.'},
        ],
      },
      {id: 'u2', role: 'user', parts: [{type: 'text', content: 'thanks, fix it'}]},
      {id: 'a2', role: 'assistant', parts: [{type: 'text', content: 'Fixed and verified.'}]},
    ]
  }

  it('collapses a settled, non-active turn to its record line and expands it again on toggle', async () => {
    mountView(() => <LogThread messages={messagesWithSettledTrace()} />)

    await expect.element(page.getByText('Found it in watcher.ts.'), {timeout: 3000}).toBeVisible()
    await expect.element(page.getByText('Fixed and verified.'), {timeout: 3000}).toBeVisible()

    const trigger = page.getByRole('button', {name: /trace/i})
    await expect.element(trigger, {timeout: 3000}).toHaveAttribute('data-state', 'closed')
    await expect.element(page.getByText('checking the event listeners first'), {timeout: 3000}).not.toBeInTheDocument()
    await page.screenshot({path: '__screenshots__/thread-session-log/collapsed-record.png'})

    await trigger.click()

    await expect.element(trigger, {timeout: 3000}).toHaveAttribute('data-state', 'open')
    await expect.element(page.getByText('checking the event listeners first'), {timeout: 3000}).toBeVisible()
    await new Promise((resolve) => setTimeout(resolve, 900))
    await page.screenshot({path: '__screenshots__/thread-session-log/expanded-record.png'})
  })

  function messagesWithTwoSegments(): ChatMessage[] {
    return [
      {id: 'u1', role: 'user', parts: [{type: 'text', content: 'ship the fix'}]},
      {
        id: 'a1',
        role: 'assistant',
        parts: [
          {
            type: 'tool-call',
            id: 'call1',
            name: 'Read',
            arguments: '{"file_path":"src/watcher.ts"}',
            input: {file_path: 'src/watcher.ts'},
            state: 'complete',
            output: 'one\ntwo',
          },
          {type: 'text', content: 'The listener is never removed.'},
          {
            type: 'tool-call',
            id: 'call2',
            name: 'Bash',
            arguments: '{"command":"pnpm test"}',
            input: {command: 'pnpm test'},
            state: 'complete',
            output: '{"stdout":"ok","exitCode":0}',
          },
          {type: 'text', content: 'Tests are green.'},
        ],
      },
    ]
  }

  it('gives each trace segment of one turn its own summary line', async () => {
    mountView(() => <LogThread messages={messagesWithTwoSegments()} />)

    await expect.element(page.getByText('Tests are green.'), {timeout: 3000}).toBeVisible()

    const triggers = page.getByRole('button', {name: /trace/i})
    await expect.element(triggers.nth(0), {timeout: 3000}).toMatchTextContent('1 read')
    await expect.element(triggers.nth(1), {timeout: 3000}).toMatchTextContent('1 bash')
  })

  function messagesWithInterleavedTurn(): ChatMessage[] {
    return [
      {id: 'u1', role: 'user', parts: [{type: 'text', content: 'why is the build red'}]},
      {
        id: 'a1',
        role: 'assistant',
        parts: [
          {type: 'text', content: 'Let me check the CI logs.'},
          {
            type: 'tool-call',
            id: 'call1',
            name: 'bash',
            arguments: '{"command":"grep -rn ERROR ci.log"}',
            input: {command: 'grep -rn ERROR ci.log'},
            state: 'complete',
            output: 'ci.log:9: ERROR type mismatch',
          },
          {type: 'text', content: 'The build fails from a type mismatch on line 9.'},
        ],
      },
    ]
  }

  it('renders text, trace, then text in stream order for a turn with parts interleaved around a tool call', async () => {
    const container = mountView(() => <LogThread messages={messagesWithInterleavedTurn()} />)

    const firstTextLocator = page.getByText('Let me check the CI logs.')
    const triggerLocator = page.getByRole('button', {name: /trace/i})
    const answerLocator = page.getByText('The build fails from a type mismatch on line 9.')
    await expect.element(firstTextLocator, {timeout: 3000}).toBeVisible()
    await expect.element(triggerLocator, {timeout: 3000}).toBeVisible()
    await expect.element(answerLocator, {timeout: 3000}).toBeVisible()

    const contentRows = [...container.querySelectorAll('[data-conciv-msg] > *:not(.absolute)')]
    const firstTextRow = firstTextLocator.element()
    const triggerRow = triggerLocator.element()
    const answerRow = answerLocator.element()
    const indexOf = (descendant: Element): number =>
      contentRows.findIndex((row) => row === descendant || row.contains(descendant))
    const firstTextIndex = indexOf(firstTextRow)
    const triggerIndex = indexOf(triggerRow)
    const answerIndex = indexOf(answerRow)

    expect(firstTextIndex).toBeGreaterThanOrEqual(0)
    expect(triggerIndex).toBeGreaterThan(firstTextIndex)
    expect(answerIndex).toBeGreaterThan(triggerIndex)
    expect(answerIndex).toBe(contentRows.length - 1)
    await page.screenshot({path: '__screenshots__/thread-session-log/interleaved-turn-order.png'})
  })
})

describe('trace output block', () => {
  const STDOUT = 'Test Files  3 passed (3)\n     Tests  17 passed (17)'
  const STDERR = 'error TS2345: Argument of type string is not assignable to parameter of type number'

  it('names a normal output frame as output and an error frame as error output', async () => {
    mountView(() => (
      <>
        <TraceOutputBlock text={STDOUT}>{STDOUT}</TraceOutputBlock>
        <TraceOutputBlock tone="error" text={STDERR}>
          {STDERR}
        </TraceOutputBlock>
      </>
    ))

    await expect.element(page.getByRole('group', {name: 'Output', exact: true})).toBeVisible()
    await expect.element(page.getByRole('group', {name: 'Error output', exact: true})).toBeVisible()
    await expect.element(page.getByText(STDERR)).toBeVisible()
  })

  it('copies the block text and announces that it landed on the clipboard', async () => {
    const written: string[] = []
    const record = (text: string): Promise<void> => {
      written.push(text)
      return Promise.resolve()
    }
    mountView(() => (
      <TraceOutputBlock text={STDOUT} writeText={record}>
        {STDOUT}
      </TraceOutputBlock>
    ))

    await page.getByRole('button', {name: 'Copy'}).click()

    await expect.element(page.getByRole('status')).toHaveTextContent('Copied the output')
    expect(written).toEqual([STDOUT])
  })

  it('announces a clipboard refusal instead of pretending the copy worked', async () => {
    const refuse = (): Promise<void> => Promise.reject(new Error('the document is not focused'))
    mountView(() => (
      <TraceOutputBlock text={STDOUT} writeText={refuse}>
        {STDOUT}
      </TraceOutputBlock>
    ))

    await page.getByRole('button', {name: 'Copy'}).click()

    await expect.element(page.getByRole('status')).toHaveTextContent('Could not copy the output')
  })

  it('runs the open action the block was given', async () => {
    function View() {
      const [opened, setOpened] = createSignal('')
      return (
        <>
          <TraceOutputBlock text={STDOUT} onOpen={() => setOpened('opened the full log')}>
            {STDOUT}
          </TraceOutputBlock>
          <p>{opened()}</p>
        </>
      )
    }
    mountView(() => <View />)

    await page.getByRole('button', {name: 'Open'}).click()

    await expect.element(page.getByText('opened the full log')).toBeVisible()
  })

  it('leaves the open action out when the block has nothing to open', async () => {
    mountView(() => <TraceOutputBlock text={STDOUT}>{STDOUT}</TraceOutputBlock>)

    await expect.element(page.getByRole('button', {name: 'Copy'})).toBeVisible()
    expect(document.querySelectorAll('button')).toHaveLength(1)
  })
})

describe('trace permission block', () => {
  const TARGET = 'rm -rf node_modules/.cache'

  function askingPart(): ToolCallPart {
    return {
      type: 'tool-call',
      id: 'call-1',
      name: 'Bash',
      arguments: JSON.stringify({command: TARGET}),
      state: 'approval-requested',
      approval: {id: 'approval-1', needsApproval: true},
    }
  }

  type Decision = {id: string; approved: boolean; scope: PermissionScope | undefined}

  function ctxRecording(decisions: Decision[]): ToolViewCtx {
    return {...ctxWith(catalogOf({})), respondApproval: (id, approved, scope) => decisions.push({id, approved, scope})}
  }

  it('approves through the Approve button', async () => {
    const decisions: Decision[] = []
    mountView(() => (
      <TracePermissionBlock
        part={askingPart()}
        ctx={ctxRecording(decisions)}
        target={TARGET}
        explanation="Deletes the cached build output."
      />
    ))

    await expect.element(page.getByRole('group', {name: 'Permission request'})).toBeVisible()
    await expect.element(page.getByText('Deletes the cached build output.')).toBeVisible()
    await expect.element(page.getByText(TARGET)).toBeVisible()

    await page.getByRole('button', {name: 'Approve'}).click()

    await expect.element(page.getByText('Approved', {exact: true})).toBeVisible()
    await expect.element(page.getByRole('button', {name: 'Approve'})).not.toBeInTheDocument()
    expect(decisions).toEqual([{id: 'approval-1', approved: true, scope: 'once'}])
  })

  it('denies through the Deny button', async () => {
    const decisions: Decision[] = []
    mountView(() => <TracePermissionBlock part={askingPart()} ctx={ctxRecording(decisions)} target={TARGET} />)

    await page.getByRole('button', {name: 'Deny'}).click()

    await expect.element(page.getByText('Denied', {exact: true})).toBeVisible()
    await expect.element(page.getByRole('button', {name: 'Deny'})).not.toBeInTheDocument()
    expect(decisions).toEqual([{id: 'approval-1', approved: false, scope: 'once'}])
  })

  it('approves only on the deliberate modifier-Enter, never on a bare Enter', async () => {
    const decisions: Decision[] = []
    mountView(() => <TracePermissionBlock part={askingPart()} ctx={ctxRecording(decisions)} target={TARGET} />)

    await userEvent.tab()
    await expect.element(page.getByRole('group', {name: 'Permission request'})).toHaveFocus()

    await userEvent.keyboard('{Enter}')

    await expect.element(page.getByRole('group', {name: 'Permission request'})).toBeVisible()
    expect(decisions).toEqual([])

    await userEvent.keyboard('{Meta>}{Enter}{/Meta}')

    await expect.element(page.getByText('Approved', {exact: true})).toBeVisible()
    await expect.element(page.getByRole('button', {name: 'Approve'})).not.toBeInTheDocument()
    expect(decisions).toEqual([{id: 'approval-1', approved: true, scope: 'once'}])
  })

  it('denies when Escape is pressed on the focused block', async () => {
    const decisions: Decision[] = []
    mountView(() => <TracePermissionBlock part={askingPart()} ctx={ctxRecording(decisions)} target={TARGET} />)

    await userEvent.tab()
    await userEvent.keyboard('{Escape}')

    await expect.element(page.getByText('Denied', {exact: true})).toBeVisible()
    await expect.element(page.getByRole('button', {name: 'Deny'})).not.toBeInTheDocument()
    expect(decisions).toEqual([{id: 'approval-1', approved: false, scope: 'once'}])
  })

  it('remembers the exact command for the session through the session action', async () => {
    const decisions: Decision[] = []
    mountView(() => <TracePermissionBlock part={askingPart()} ctx={ctxRecording(decisions)} target={TARGET} />)

    await page.getByRole('button', {name: 'Allow for session'}).click()

    await expect.element(page.getByText('Approved', {exact: true})).toBeVisible()
    await expect.element(page.getByRole('button', {name: 'Approve'})).not.toBeInTheDocument()
    expect(decisions).toEqual([{id: 'approval-1', approved: true, scope: 'session'}])
  })

  it('offers the session action only for an approval that carries a command to remember', async () => {
    const decisions: Decision[] = []
    const commandless: ToolCallPart = {
      type: 'tool-call',
      id: 'call-2',
      name: 'canvas_delete',
      arguments: JSON.stringify({elementId: 'e1'}),
      state: 'approval-requested',
      approval: {id: 'approval-2', needsApproval: true},
    }
    mountView(() => <TracePermissionBlock part={commandless} ctx={ctxRecording(decisions)} target="canvas_delete" />)

    await expect.element(page.getByRole('button', {name: 'Approve'})).toBeVisible()
    await expect.element(page.getByRole('button', {name: 'Deny'})).toBeVisible()
    expect(document.querySelectorAll('button')).toHaveLength(2)
  })

  it('shows the expiry countdown only for a request that carries a deadline', async () => {
    const decisions: Decision[] = []
    mountView(() => (
      <>
        <TracePermissionBlock part={askingPart()} ctx={ctxRecording(decisions)} target={TARGET} />
        <TracePermissionBlock
          part={askingPart()}
          ctx={ctxRecording(decisions)}
          target={TARGET}
          expiresAt={Date.now() + 90_000}
        />
      </>
    ))

    await expect.element(page.getByRole('timer')).toBeVisible()
    await expect.element(page.getByRole('timer')).toMatchTextContent(/expires in 1:\d\d/)
    expect(document.querySelectorAll('[role="timer"]')).toHaveLength(1)
  })
})

describe('trace', () => {
  const SUMMARY = '2 files changed · +18 −4'
  const COMPACT = '2 files · 4 tools · 12s'

  const settledItems: TraceItem[] = [
    {
      key: 'read',
      render: (branch) => (
        <TraceToolRow
          projection={{mark: 'pass', label: 'read', target: 'src/app.tsx', meta: '120 lines'}}
          ring={branch.ring}
        />
      ),
    },
    {
      key: 'edit',
      render: (branch) => (
        <TraceToolRow
          projection={{mark: 'warn', label: 'edit', target: 'src/store/turn.ts', meta: '+9 −4'}}
          ring={branch.ring}
        />
      ),
    },
    {
      key: 'bash',
      render: (branch) => (
        <TraceToolRow
          projection={{mark: 'fail', label: 'bash', target: 'pnpm test', meta: 'exit 1'}}
          ring={branch.ring}
        />
      ),
    },
  ]

  const liveItems: TraceItem[] = [
    {
      key: 'first-live',
      live: true,
      render: (branch) => (
        <TraceToolRow projection={{mark: 'run', label: 'run', target: 'installing dependencies'}} ring={branch.ring} />
      ),
    },
    {
      key: 'second-live',
      live: true,
      render: (branch) => (
        <TraceToolRow projection={{mark: 'run', label: 'tail', target: 'streaming the build log'}} ring={branch.ring} />
      ),
    },
  ]

  it('renders one row per trace item with the mark that matches its outcome', async () => {
    mountView(() => <Trace summary={SUMMARY} compactLine={COMPACT} items={settledItems} defaultOpen />)

    await expect.element(page.getByRole('img', {name: 'succeeded'})).toBeVisible()
    await expect.element(page.getByRole('img', {name: 'completed with warnings'})).toBeVisible()
    await expect.element(page.getByRole('img', {name: 'failed'})).toBeVisible()
    await expect.element(page.getByText('src/app.tsx')).toBeVisible()
    await expect.element(page.getByText('pnpm test')).toBeVisible()
    await expect.element(page.getByText('exit 1')).toBeVisible()
  })

  it('gives at most one live step the running ring and dims every earlier live step', async () => {
    mountView(() => <Trace summary={SUMMARY} compactLine={COMPACT} items={liveItems} defaultOpen />)

    await expect.element(page.getByRole('img', {name: 'running'})).toBeVisible()
    await expect.element(page.getByRole('img', {name: 'pending'})).toBeVisible()

    expect(document.querySelectorAll('[role="img"][aria-label="running"]')).toHaveLength(1)
    expect(document.querySelectorAll('[role="img"][aria-label="pending"]')).toHaveLength(1)
  })

  it('collapses to a single record line and restores the rows when toggled back', async () => {
    mountView(() => <Trace summary={SUMMARY} compactLine={COMPACT} items={settledItems} defaultOpen />)

    await expect.element(page.getByRole('button', {name: /Hide trace/})).toBeVisible()
    await expect.element(page.getByText(SUMMARY)).toBeVisible()

    await page.getByRole('button', {name: /Hide trace/}).click()

    await expect.element(page.getByRole('button', {name: /Show trace/})).toBeVisible()
    await expect.element(page.getByText(COMPACT)).toBeVisible()
    await expect.element(page.getByText('src/app.tsx')).not.toBeVisible()

    await page.getByRole('button', {name: /Show trace/}).click()

    await expect.element(page.getByText('src/app.tsx')).toBeVisible()
  })

  it('starts collapsed when the trace opens closed', async () => {
    mountView(() => <Trace summary={SUMMARY} compactLine={COMPACT} items={settledItems} folded />)

    await expect.element(page.getByRole('button', {name: /Show trace/})).toBeVisible()
    await expect.element(page.getByText('src/app.tsx')).not.toBeInTheDocument()
  })

  it('runs the action an action row offers and shows its hint and explainer', async () => {
    const runs: string[] = []
    const items: TraceItem[] = [
      {
        key: 'action',
        render: () => (
          <TraceActionRow
            label="Review the diff"
            hint="⌘⏎"
            explainer="18 lines across 2 files"
            onAction={() => runs.push('reviewed')}
          />
        ),
      },
    ]
    mountView(() => <Trace summary={SUMMARY} compactLine={COMPACT} items={items} defaultOpen />)

    await expect.element(page.getByText('18 lines across 2 files')).toBeVisible()
    await expect.element(page.getByText('⌘⏎')).toBeVisible()

    await page.getByRole('button', {name: 'Review the diff'}).click()

    await expect.element(page.getByRole('button', {name: 'Review the diff'})).toBeVisible()
    expect(runs).toEqual(['reviewed'])
  })
})

describe('virtual scroll', () => {
  const TURN_COUNT = 80

  const windowErrors: string[] = []
  window.addEventListener('error', (event) => {
    windowErrors.push(typeof event.message === 'string' ? event.message : String(event))
  })

  beforeEach(() => {
    windowErrors.length = 0
  })

  function answerOf(index: number): string {
    const shape = index % 4
    if (shape === 0) return `answer ${index}\n\nOne short line about the change.`
    if (shape === 1) {
      return `answer ${index}\n\n## Findings\n\n${['alpha', 'beta', 'gamma', 'delta']
        .map((name) => `- \`${name}\` ${'holds the shared lane. '.repeat(3)}`)
        .join('\n')}`
    }
    if (shape === 2) {
      return `answer ${index}\n\n${'The scheduler drains the queue in order. '.repeat(12)}\n\n${'It retries only the tail. '.repeat(10)}`
    }
    return `answer ${index}\n\n${'Then the caller folds the result. '.repeat(6)}`
  }

  function assistantParts(index: number): ChatMessage['parts'] {
    if (index % 4 !== 3) return [{type: 'text', content: answerOf(index)}]
    return [
      {type: 'text', content: `answer ${index}\n\nReading the file first.`},
      {
        type: 'tool-call',
        id: `call-${index}`,
        name: 'Read',
        arguments: JSON.stringify({file: `src/module-${index}.ts`}),
        input: {file: `src/module-${index}.ts`},
        state: 'complete',
      },
      {
        type: 'tool-result',
        toolCallId: `call-${index}`,
        content: `export function run(step: number): number {\n  return step * ${index}\n}\n`.repeat(4),
        state: 'complete',
      },
      {type: 'text', content: answerOf(index)},
    ]
  }

  function seedMessages(count: number): ChatMessage[] {
    const messages: ChatMessage[] = []
    for (let index = 0; index < count; index++) {
      const id = `m${index}`
      messages.push(
        index % 2 === 0
          ? {
              id,
              role: 'user',
              parts: [{type: 'text', content: `question ${index}. ${'why does it stall? '.repeat(index % 6)}`}],
            }
          : {id, role: 'assistant', parts: assistantParts(index)},
      )
    }
    return messages
  }

  function mountThread(initial: ChatMessage[]): void {
    function VirtualThread(): JSX.Element {
      const chat = createChat({
        threadId: 'virtual-scroll',
        connection: storyConnection({chunks: []}),
        initialMessages: initial,
      })
      return (
        <div class="flex flex-col h-[520px] w-[560px]">
          <ChatProvider chat={chat}>
            <ToolProvider value={ctxWith(catalogOf({}))}>
              <Thread>
                <Thread.Viewport>
                  <Thread.Messages />
                </Thread.Viewport>
              </Thread>
            </ToolProvider>
          </ChatProvider>
        </div>
      )
    }
    mountView(() => <VirtualThread />)
  }

  async function lastTurnVisible(): Promise<void> {
    await expect.element(page.getByText(`answer ${TURN_COUNT - 1}`, {exact: false}).first()).toBeVisible()
  }

  async function settledThread(): Promise<void> {
    mountThread(seedMessages(TURN_COUNT))
    await lastTurnVisible()
  }

  async function wheelToFirstTurn(): Promise<void> {
    await userEvent.wheel(page.getByRole('log'), {delta: {y: -1_000_000}})
    await expect.element(page.getByText('question 0', {exact: false}).first()).toBeVisible()
  }

  function resizeLoopErrors(): string[] {
    return windowErrors.filter((message) => message.includes('ResizeObserver loop'))
  }

  it('scrolling a card-heavy thread never trips a ResizeObserver notification loop', async () => {
    await settledThread()
    await wheelToFirstTurn()
    await userEvent.wheel(page.getByRole('log'), {delta: {y: 1_000_000}})
    await lastTurnVisible()

    expect(resizeLoopErrors()).toEqual([])
  })
})

describe('virtual thread', () => {
  const ABOVE_THRESHOLD = VIRTUALIZE_THRESHOLD * 4
  const JUST_BELOW_THRESHOLD = VIRTUALIZE_THRESHOLD - 1
  const WELL_BELOW_THRESHOLD = VIRTUALIZE_THRESHOLD - 5

  function lastAnswer(count: number): string {
    return `answer ${count % 2 === 0 ? count - 1 : count - 2}`
  }

  function seedMessages(count: number): ChatMessage[] {
    const messages: ChatMessage[] = []
    for (let index = 0; index < count; index++) {
      const id = `m${index}`
      messages.push(
        index % 2 === 0
          ? {id, role: 'user', parts: [{type: 'text', content: `question ${index}`}]}
          : {
              id,
              role: 'assistant',
              parts: [{type: 'text', content: `answer ${index}\n${'line of prose. '.repeat(6)}`}],
            },
      )
    }
    return messages
  }

  function UserMessage(): JSX.Element {
    return (
      <Message.Root class="text-white px-2 py-1 rounded bg-blue-600 self-end">
        <Message.Parts />
      </Message.Root>
    )
  }

  function AssistantMessage(): JSX.Element {
    return (
      <Message.Root class="self-start">
        <Message.Parts />
      </Message.Root>
    )
  }

  function mountThread(
    initial: ChatMessage[],
    stream: StoryConnectionOptions = {chunks: []},
  ): {
    host: HTMLElement
    viewport: () => HTMLElement
    transcript: Locator
    chat: () => Chat
  } {
    let viewport: HTMLElement | undefined
    let chat: Chat | undefined
    function VirtualThread(): JSX.Element {
      const value = createChat({
        threadId: 'virtual-thread',
        connection: storyConnection(stream),
        initialMessages: initial,
      })
      onMount(() => {
        chat = value
      })
      return (
        <ChatProvider chat={value}>
          <PrimitiveThread.Root class="flex flex-col h-80 relative">
            <PrimitiveThread.Viewport
              role="log"
              aria-label="Conversation"
              ref={(element) => {
                viewport = element
              }}
              class="p-2 flex flex-1 flex-col gap-2 min-h-0 overflow-y-auto"
              footer={
                <div class="flex pointer-events-none inset-inline-0 bottom-2 justify-center absolute">
                  <PrimitiveThread.ScrollToBottom class="pointer-events-auto">Latest</PrimitiveThread.ScrollToBottom>
                </div>
              }
            >
              <PrimitiveThread.Messages components={{UserMessage, AssistantMessage}} />
            </PrimitiveThread.Viewport>
          </PrimitiveThread.Root>
        </ChatProvider>
      )
    }
    const host = mountView(() => <VirtualThread />)
    return {
      host,
      viewport: () => {
        if (!viewport) throw new Error('viewport not mounted')
        return viewport
      },
      transcript: page.getByRole('log', {name: 'Conversation'}),
      chat: () => {
        if (!chat) throw new Error('chat not mounted')
        return chat
      },
    }
  }

  function wheelUpTo(viewport: HTMLElement, scrollTop: number): void {
    viewport.dispatchEvent(new WheelEvent('wheel', {deltaY: -120, bubbles: true}))
    viewport.scrollTop = scrollTop
  }

  it('virtualizes above the threshold: early turns unmount, pinned to the latest turn', async () => {
    const thread = mountThread(seedMessages(ABOVE_THRESHOLD))

    await expect.element(page.getByText(lastAnswer(ABOVE_THRESHOLD), {exact: false})).toBeVisible()
    await expect.element(thread.transcript).toHaveAttribute('data-at-bottom')
    await expect.element(page.getByText('question 0')).not.toBeInTheDocument()
  })

  it('windows nothing below the threshold: every turn stays mounted', async () => {
    mountThread(seedMessages(WELL_BELOW_THRESHOLD))

    await expect.element(page.getByText(lastAnswer(WELL_BELOW_THRESHOLD), {exact: false})).toBeVisible()
    await expect.element(page.getByText('question 0')).toBeInTheDocument()
  })

  it('crossing the threshold while following keeps the bottom pinned', async () => {
    const thread = mountThread(seedMessages(JUST_BELOW_THRESHOLD))
    await expect.element(page.getByText(lastAnswer(JUST_BELOW_THRESHOLD), {exact: false})).toBeVisible()
    await expect.element(page.getByText('question 0')).toBeInTheDocument()

    thread.chat().setMessages(seedMessages(ABOVE_THRESHOLD))
    await expect.element(page.getByText(lastAnswer(ABOVE_THRESHOLD), {exact: false})).toBeVisible()
    await expect.element(page.getByText('question 0')).not.toBeInTheDocument()
    await expect.element(thread.transcript).toHaveAttribute('data-at-bottom')
  })

  it('history prepend keeps the reading position while scrolled up', async () => {
    const thread = mountThread(seedMessages(ABOVE_THRESHOLD))
    await expect.element(page.getByText(lastAnswer(ABOVE_THRESHOLD), {exact: false})).toBeVisible()

    wheelUpTo(thread.viewport(), 0)
    await expect.element(thread.transcript).not.toHaveAttribute('data-at-bottom')
    await expect.element(page.getByText('question 0')).toBeVisible()

    const older: ChatMessage[] = Array.from({length: 10}, (_, index) => ({
      id: `old${index}`,
      role: index % 2 === 0 ? 'user' : 'assistant',
      parts: [{type: 'text', content: `older ${index}`}],
    }))
    thread.chat().setMessages([...older, ...seedMessages(ABOVE_THRESHOLD)])

    await expect.element(page.getByText('question 0')).toBeVisible()
    await expect.element(thread.transcript).not.toHaveAttribute('data-at-bottom')
  })
})
