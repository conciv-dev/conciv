import {createSignal, Index, onCleanup, onMount, type JSX} from 'solid-js'
import type {Meta, StoryObj} from 'storybook-solidjs-vite'
import {expect, within, userEvent, waitFor} from 'storybook/test'
import {useChat, type UseChatReturn} from '@tanstack/ai-solid'
import {ChatProvider} from '../store/chat-context.js'
import {storyConnection, createTextChunks} from '../store/story-connection.js'
import {Thread} from '../primitives/thread/thread.js'
import {useThreadViewport, ViewportProvider} from '../primitives/thread/viewport-context.js'
import {Message} from '../primitives/message/message.js'
import {useThreadAutoScroll} from './use-thread-auto-scroll.js'
import {Trace, type TraceItem} from '../styled/trace/trace.js'
import {CollapsibleCard} from '../tools/styled/collapsible-card.js'

const meta: Meta = {title: 'ui-kit-chat/behaviors/Scroll'}
export default meta
type Story = StoryObj

function AtBottomEcho(): JSX.Element {
  const viewport = useThreadViewport()
  return <div>atBottom: {String(viewport.isAtBottom())}</div>
}

function UserMessage(): JSX.Element {
  return (
    <Message.Root class="text-chat-on-accent px-3 py-1.5 rounded-chat-surface-md bg-chat-accent self-end">
      <Message.Parts />
    </Message.Root>
  )
}

function AssistantMessage(): JSX.Element {
  return (
    <Message.Root class="text-chat-text self-start">
      <Message.Parts />
    </Message.Root>
  )
}

const LONG_REPLY = `${'The bug is a missing await. '.repeat(40)}END_OF_ANSWER`

function StreamingThread(props: {expose: (chat: UseChatReturn) => void}): JSX.Element {
  const chat = useChat({connection: storyConnection({chunks: createTextChunks(LONG_REPLY), chunkDelay: 3})})
  onMount(() => props.expose(chat))
  return (
    <ChatProvider chat={chat}>
      <Thread.Root class="flex flex-col">
        <Thread.Viewport class="p-2 border border-chat-line rounded-chat-surface-sm flex flex-col gap-1 h-32 overflow-y-auto">
          <Thread.Empty>
            <div class="text-[0.75rem] text-chat-text-3">Ask to begin.</div>
          </Thread.Empty>
          <Thread.Messages components={{UserMessage, AssistantMessage}} />
          <AtBottomEcho />
        </Thread.Viewport>
      </Thread.Root>
    </ChatProvider>
  )
}

const GROWTH_LINES = 40

function CollapsePinHarness(): JSX.Element {
  const [viewport, setViewport] = createSignal<HTMLDivElement>()
  const {isAtBottom, scrollToBottom} = useThreadAutoScroll(viewport, {autoScroll: () => true})
  const [streaming, setStreaming] = createSignal(true)
  const [lines, setLines] = createSignal(3)
  onMount(() => {
    scrollToBottom('instant')
    const interval = setInterval(() => {
      if (lines() >= GROWTH_LINES) {
        clearInterval(interval)
        return
      }
      setLines(lines() + 1)
    }, 50)
    onCleanup(() => clearInterval(interval))
  })
  return (
    <div class="w-96">
      <button type="button" onClick={() => setStreaming(false)}>
        settle
      </button>
      <div>atBottom: {String(isAtBottom())}</div>
      <div ref={setViewport} data-thread-viewport class="p-2 border border-chat-line h-32 overflow-y-auto">
        <Trace
          summary="6 tool steps"
          compactLine="6 tool steps"
          folded={!streaming()}
          items={Array.from(
            {length: 6},
            (_, index): TraceItem => ({
              key: `step${index}`,
              render: () => <div>tool step {index}</div>,
            }),
          )}
        />
        <Index each={Array.from({length: lines()}, (_, index) => index)}>
          {(line) => <div>reply line {line()}</div>}
        </Index>
      </div>
    </div>
  )
}

function ExpandAtBottomHarness(): JSX.Element {
  const [viewport, setViewport] = createSignal<HTMLDivElement>()
  const scroll = useThreadAutoScroll(viewport, {autoScroll: () => true})
  onMount(() => scroll.scrollToBottom('instant'))
  return (
    <ViewportProvider value={scroll}>
      <div class="w-96">
        <div>atBottom: {String(scroll.isAtBottom())}</div>
        <div
          ref={setViewport}
          data-thread-viewport
          data-at-bottom={scroll.isAtBottom() ? '' : undefined}
          data-escaped={scroll.escapedFromLock() ? '' : undefined}
          class="p-2 border border-chat-line h-32 overflow-y-auto"
        >
          <Index each={Array.from({length: 20}, (_, index) => index)}>
            {(line) => <div>history line {line()}</div>}
          </Index>
          <CollapsibleCard header={<span>expand me</span>}>
            <Index each={Array.from({length: 30}, (_, index) => index)}>
              {(line) => <div>tool output {line()}</div>}
            </Index>
          </CollapsibleCard>
        </div>
      </div>
    </ViewportProvider>
  )
}

async function realWheel(element: Element, deltaY: number): Promise<void> {
  const {userEvent: realUserEvent} = await import('vitest/browser')
  await realUserEvent.wheel(element, {delta: {y: deltaY}})
}

function ExpandEscapedHarness(): JSX.Element {
  const [viewport, setViewport] = createSignal<HTMLDivElement>()
  const scroll = useThreadAutoScroll(viewport, {autoScroll: () => true})
  onMount(() => scroll.scrollToBottom('instant'))
  return (
    <ViewportProvider value={scroll}>
      <div class="w-96">
        <div
          ref={setViewport}
          data-thread-viewport
          data-at-bottom={scroll.isAtBottom() ? '' : undefined}
          data-escaped={scroll.escapedFromLock() ? '' : undefined}
          class="p-2 border border-chat-line h-32 overflow-y-auto"
        >
          <Index each={Array.from({length: 20}, (_, index) => index)}>
            {(line) => <div>history line {line()}</div>}
          </Index>
          <CollapsibleCard header={<span>expand me</span>}>
            <Index each={Array.from({length: 30}, (_, index) => index)}>
              {(line) => <div>tool output {line()}</div>}
            </Index>
          </CollapsibleCard>
          <Index each={Array.from({length: 20}, (_, index) => index)}>
            {(line) => <div>trailing line {line()}</div>}
          </Index>
        </div>
      </div>
    </ViewportProvider>
  )
}

function TallCardNearBottomHarness(): JSX.Element {
  const [viewport, setViewport] = createSignal<HTMLDivElement>()
  const scroll = useThreadAutoScroll(viewport, {autoScroll: () => true})
  onMount(() => scroll.scrollToBottom('instant'))
  return (
    <ViewportProvider value={scroll}>
      <div class="w-96">
        <div
          ref={setViewport}
          data-thread-viewport
          data-at-bottom={scroll.isAtBottom() ? '' : undefined}
          data-escaped={scroll.escapedFromLock() ? '' : undefined}
          class="p-2 border border-chat-line h-72 overflow-y-auto"
        >
          <Index each={Array.from({length: 20}, (_, index) => index)}>
            {(line) => <div>history line {line()}</div>}
          </Index>
          <CollapsibleCard header={<span>tall card trigger</span>} defaultOpen>
            <Index each={Array.from({length: 60}, (_, index) => index)}>
              {(line) => <div>tool output {line()}</div>}
            </Index>
          </CollapsibleCard>
          <Index each={Array.from({length: 3}, (_, index) => index)}>
            {(line) => <div>trailing line {line()}</div>}
          </Index>
        </div>
      </div>
    </ViewportProvider>
  )
}

function locateRequired(root: HTMLElement, selector: string): HTMLElement {
  const found = root.querySelector(selector)
  if (!(found instanceof HTMLElement)) throw new Error(`missing element for selector: ${selector}`)
  return found
}

function viewportOf(canvasElement: HTMLElement): HTMLElement {
  return locateRequired(canvasElement, '[data-thread-viewport]')
}

function contentHeight(vp: HTMLElement): number {
  return vp.scrollHeight
}

function scrollOffset(vp: HTMLElement): number {
  return vp.scrollTop
}

function ScrollToEndHarness(): JSX.Element {
  const chat = useChat({connection: storyConnection({chunks: [], chunkDelay: 1})})
  return (
    <ChatProvider chat={chat}>
      <Thread.Root class="flex flex-col">
        <Thread.Viewport class="p-2 flex flex-col gap-1 h-40 relative overflow-y-auto">
          <Index each={Array.from({length: 40}, (_, index) => index)}>
            {(line) => <div>message line {line()}</div>}
          </Index>
          <div class="h-0 pointer-events-none self-center bottom-2 sticky z-10 overflow-visible">
            <Thread.ScrollToBottom class="px-2 inline-flex min-h-6 pointer-events-auto items-center bottom-0 left-1/2 absolute data-[at-bottom]:invisible -translate-x-1/2">
              Latest
            </Thread.ScrollToBottom>
          </div>
        </Thread.Viewport>
      </Thread.Root>
    </ChatProvider>
  )
}

export const ScrollToEndNoLayoutShift: Story = {
  render: () => <ScrollToEndHarness />,
  play: async ({canvasElement}) => {
    const c = within(canvasElement)
    const vp = viewportOf(canvasElement)
    await waitFor(() => expect(vp.scrollHeight).toBeGreaterThan(vp.clientHeight))
    await realWheel(vp, -400)
    await waitFor(() => expect(c.getByText('Latest')).not.toHaveAttribute('data-at-bottom'))
    const heightNotAtBottom = contentHeight(vp)
    await userEvent.click(c.getByText('Latest'))
    await waitFor(() => expect(c.getByText('Latest')).toHaveAttribute('data-at-bottom'))
    await expect(contentHeight(vp)).toBe(heightNotAtBottom)
  },
}

export const ExpandDoesNotMoveViewport: Story = {
  render: () => <ExpandAtBottomHarness />,
  play: async ({canvasElement}) => {
    const c = within(canvasElement)
    const vp = viewportOf(canvasElement)
    await waitFor(() => expect(vp).toHaveAttribute('data-at-bottom'))

    await userEvent.click(c.getByText('expand me'))
    await waitFor(() => expect(c.getByText('tool output 29')).toBeVisible(), {timeout: 4000})
    await waitFor(() => expect(vp).toHaveAttribute('data-at-bottom'), {timeout: 4000})
    await expect(c.getByText('history line 19')).toBeVisible()

    await userEvent.click(c.getByText('expand me'))
    await waitFor(() => expect(c.getByText('tool output 29')).not.toBeVisible(), {timeout: 4000})
    await waitFor(() => expect(vp).toHaveAttribute('data-at-bottom'), {timeout: 4000})
    await expect(c.getByText('history line 19')).toBeVisible()
  },
}

export const ScrollToBottomButtonWhileEscaped: Story = {
  render: () => <ScrollToEndHarness />,
  play: async ({canvasElement}) => {
    const c = within(canvasElement)
    const vp = viewportOf(canvasElement)
    await waitFor(() => expect(vp.scrollHeight).toBeGreaterThan(vp.clientHeight))

    await realWheel(vp, -400)
    await waitFor(() => expect(c.getByText('Latest')).not.toHaveAttribute('data-at-bottom'))

    await userEvent.click(c.getByText('Latest'))
    await waitFor(() => expect(c.getByText('Latest')).toHaveAttribute('data-at-bottom'), {timeout: 2000})
    await waitFor(() => expect(vp).toHaveAttribute('data-at-bottom'))
  },
}

export const SendMessagePinsAfterEscape: Story = {
  render: () => {
    let chat: UseChatReturn | undefined
    return (
      <div>
        <button type="button" onClick={() => void chat?.sendMessage('why is it broken?')}>
          ask
        </button>
        <StreamingThread
          expose={(value) => {
            chat = value
          }}
        />
      </div>
    )
  },
  play: async ({canvasElement}) => {
    const c = within(canvasElement)
    const vp = viewportOf(canvasElement)
    await waitFor(() => expect(c.getByText('atBottom: true')).toBeVisible())

    await userEvent.click(c.getByText('ask'))
    await waitFor(() => expect(c.getByText(/END_OF_ANSWER/)).toBeVisible(), {timeout: 6000})
    await waitFor(() => expect(c.getByText('atBottom: true')).toBeVisible())

    await realWheel(vp, -400)
    await waitFor(() => expect(c.getByText('atBottom: false')).toBeVisible())

    await userEvent.click(c.getByText('ask'))
    await waitFor(() => expect(c.getByText('atBottom: true')).toBeVisible())
  },
}

export const ExpandDoesNotMoveViewportWhenEscaped: Story = {
  render: () => <ExpandEscapedHarness />,
  play: async ({canvasElement}) => {
    const c = within(canvasElement)
    const vp = viewportOf(canvasElement)
    await waitFor(() => expect(vp).toHaveAttribute('data-at-bottom'))

    await realWheel(vp, -400)
    await waitFor(() => expect(vp).toHaveAttribute('data-escaped'))
    await expect(vp).not.toHaveAttribute('data-at-bottom')

    const scrollTopWhileEscaped = scrollOffset(vp)
    await userEvent.click(c.getByText('expand me'))
    await waitFor(() => expect(c.getByText('tool output 29')).toBeVisible(), {timeout: 4000})
    await new Promise((resolve) => setTimeout(resolve, 300))
    await expect(scrollOffset(vp)).toBe(scrollTopWhileEscaped)
    await expect(vp).toHaveAttribute('data-escaped')
    await expect(c.getByText('trailing line 19')).toBeInTheDocument()
  },
}

export const TallCardNearBottomCollapseSettles: Story = {
  render: () => <TallCardNearBottomHarness />,
  play: async ({canvasElement}) => {
    const c = within(canvasElement)
    const vp = viewportOf(canvasElement)
    await waitFor(() => expect(c.getByText('tool output 59')).toBeVisible())

    await realWheel(vp, -50)
    await waitFor(() => expect(vp).toHaveAttribute('data-escaped'))
    const distFromBottom = () => contentHeight(vp) - vp.clientHeight - scrollOffset(vp)
    await waitFor(() => expect(distFromBottom()).toBeLessThan(90))

    await userEvent.click(c.getByText('tall card trigger'))
    const frames: Array<{t: number; scrollTop: number}> = []
    const start = performance.now()
    const collectFrames = () => {
      frames.push({t: Math.round(performance.now() - start), scrollTop: vp.scrollTop})
      if (performance.now() - start < 650) requestAnimationFrame(collectFrames)
    }
    requestAnimationFrame(collectFrames)
    await new Promise((resolve) => setTimeout(resolve, 700))

    const settledIndex = frames.findIndex((f) => f.t >= 220)
    const tail = frames.slice(settledIndex)
    const tailScrollTops = new Set(tail.map((f) => f.scrollTop))
    await expect(tailScrollTops.size).toBe(1)
    await expect(distFromBottom()).toBeLessThan(2)
  },
}

export const StaysPinnedThroughAutoCollapse: Story = {
  render: () => <CollapsePinHarness />,
  play: async ({canvasElement}) => {
    const c = within(canvasElement)
    await waitFor(() => expect(c.getByText('atBottom: true')).toBeVisible())
    await userEvent.click(c.getByRole('button', {name: 'settle'}))
    await waitFor(() => expect(c.getByText('tool step 0')).not.toBeVisible())
    await waitFor(() => expect(c.getByText(`reply line ${GROWTH_LINES - 1}`)).toBeVisible(), {timeout: 4000})
    await expect(c.getByText('atBottom: true')).toBeVisible()
  },
}

export const SticksToBottomWhileStreaming: Story = {
  render: () => {
    let chat: UseChatReturn | undefined
    return (
      <div>
        <button type="button" onClick={() => void chat?.sendMessage('why is it broken?')}>
          ask
        </button>
        <StreamingThread
          expose={(value) => {
            chat = value
          }}
        />
      </div>
    )
  },
  play: async ({canvasElement}) => {
    const c = within(canvasElement)

    await waitFor(() => expect(c.getByText('atBottom: true')).toBeVisible())
    await userEvent.click(c.getByText('ask'))

    await waitFor(() => expect(c.getByText(/END_OF_ANSWER/)).toBeVisible(), {timeout: 6000})
    await waitFor(() => expect(c.getByText('atBottom: true')).toBeVisible())
  },
}
