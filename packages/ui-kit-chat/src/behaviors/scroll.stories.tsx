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
import {ChainOfThought} from '../styled/chain-of-thought.js'
import {CollapsibleCard} from '../styled/collapsible-card.js'

const meta: Meta = {title: 'ui-kit-chat/behaviors/Scroll'}
export default meta
type Story = StoryObj

function AtBottomEcho(): JSX.Element {
  const viewport = useThreadViewport()
  return <div>atBottom: {String(viewport.isAtBottom())}</div>
}

function UserMessage(): JSX.Element {
  return (
    <Message.Root class="text-pw-on-accent px-3 py-1.5 rounded-pw-md bg-pw-accent self-end">
      <Message.Parts />
    </Message.Root>
  )
}

function AssistantMessage(): JSX.Element {
  return (
    <Message.Root class="text-pw-text self-start">
      <Message.Parts />
    </Message.Root>
  )
}

const LONG_REPLY = `${'The bug is a missing await. '.repeat(40)}END_OF_ANSWER`

function StreamingThread(props: {expose: (chat: UseChatReturn) => void}): JSX.Element {
  const chat = useChat({connection: storyConnection({chunks: createTextChunks(LONG_REPLY), chunkDelay: 3})})
  props.expose(chat)
  return (
    <ChatProvider chat={chat}>
      <Thread.Root class="flex flex-col">
        <Thread.Viewport class="p-2 border border-pw-line rounded-pw-sm flex flex-col gap-1 h-32 overflow-y-auto">
          <Thread.Empty>
            <div class="text-[0.75rem] text-pw-text-3">Ask to begin.</div>
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
      <div ref={setViewport} data-thread-viewport class="p-2 border border-pw-line h-32 overflow-y-auto">
        <ChainOfThought streaming={streaming()} settleDelayMs={300}>
          <Index each={Array.from({length: 6}, (_, index) => index)}>
            {(step) => (
              <ChainOfThought.Step icon={<span>*</span>} last={step() === 5}>
                <div>tool step {step()}</div>
              </ChainOfThought.Step>
            )}
          </Index>
        </ChainOfThought>
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
        <div ref={setViewport} data-thread-viewport class="p-2 border border-pw-line h-32 overflow-y-auto">
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

function distanceFromBottom(vp: HTMLElement): number {
  return vp.scrollHeight - vp.scrollTop - vp.clientHeight
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
    const vp = canvasElement.querySelector('[data-thread-viewport]') as HTMLElement
    await waitFor(() => expect(vp.scrollHeight).toBeGreaterThan(vp.clientHeight))
    vp.scrollTop = 0
    await waitFor(() => expect(c.getByText('Latest')).not.toHaveAttribute('data-at-bottom'))
    const heightNotAtBottom = vp.scrollHeight
    vp.scrollTop = vp.scrollHeight
    await waitFor(() => expect(c.getByText('Latest')).toHaveAttribute('data-at-bottom'))
    const heightAtBottom = vp.scrollHeight
    await expect(heightAtBottom).toBe(heightNotAtBottom)
  },
}

export const ExpandAtBottomKeepsPosition: Story = {
  render: () => <ExpandAtBottomHarness />,
  play: async ({canvasElement}) => {
    const c = within(canvasElement)
    const vp = canvasElement.querySelector('[data-thread-viewport]') as HTMLElement
    await waitFor(() => expect(distanceFromBottom(vp)).toBeLessThanOrEqual(1))
    await userEvent.click(c.getByText('expand me'))
    await waitFor(() => expect(c.getByText('tool output 0')).toBeVisible())
    await new Promise((resolve) => setTimeout(resolve, 700))
    await expect(distanceFromBottom(vp)).toBeGreaterThan(100)
    await expect(c.getByText('atBottom: false')).toBeVisible()
  },
}

export const StaysPinnedThroughAutoCollapse: Story = {
  render: () => <CollapsePinHarness />,
  play: async ({canvasElement}) => {
    const c = within(canvasElement)
    await waitFor(() => expect(c.getByText('atBottom: true')).toBeVisible())
    await userEvent.click(c.getByRole('button', {name: 'settle'}))
    await waitFor(() => expect(c.getByText('tool step 0')).not.toBeVisible(), {timeout: 2000})
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
