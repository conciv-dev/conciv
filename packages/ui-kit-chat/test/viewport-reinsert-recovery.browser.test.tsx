import 'virtual:uno.css'
import '@conciv/ui-kit-system/tokens.css'
import '@conciv/ui-kit-chat/theme/tokens.css'
import {createResource, createSignal, onMount, Suspense, type JSX} from 'solid-js'
import {render} from '@solidjs/testing-library'
import {page, userEvent} from 'vitest/browser'
import {expect, it} from 'vitest'
import {useChat, type UseChatReturn} from '@tanstack/ai-solid'
import type {UIMessage} from '@tanstack/ai-client'
import {ChatProvider} from '../src/store/chat-context.js'
import {storyConnection} from '../src/store/story-connection.js'
import {Thread} from '../src/styled/thread.js'

const TURN_COUNT = 60
const LAST_TURN = TURN_COUNT - 1
const PROSE = 'a settled paragraph of the seeded answer that wraps across the pane. '

function answerBody(index: number): string {
  if (index % 3 === 0) return `answer ${index}\n${PROSE.repeat(6)}\ntail marker ${index}`
  return `answer ${index}\ntail marker ${index}`
}

function seed(count: number): UIMessage[] {
  return Array.from({length: count}, (_unused, index): UIMessage[] => [
    {id: `u${index}`, role: 'user', parts: [{type: 'text', content: `question ${index}`}]},
    {id: `a${index}`, role: 'assistant', parts: [{type: 'text', content: answerBody(index)}]},
  ]).flat()
}

type MountedThread = {
  container: HTMLElement
  unmount: () => void
  viewport: () => HTMLElement
  branch: () => HTMLElement
  chat: () => UseChatReturn
}

type ThreadBodyProps = {initial: UIMessage[]; onChat: (chat: UseChatReturn) => void; ref: (node: HTMLElement) => void}

function ThreadBody(props: ThreadBodyProps): JSX.Element {
  const value = useChat({connection: storyConnection({chunks: []}), initialMessages: props.initial})
  onMount(() => props.onChat(value))
  return (
    <ChatProvider chat={value}>
      <div ref={props.ref}>
        <div style={{height: '420px', width: '560px'}}>
          <Thread>
            <Thread.Viewport>
              <Thread.Messages />
            </Thread.Viewport>
          </Thread>
        </div>
      </div>
    </ChatProvider>
  )
}

function mountedThreadFrom(
  result: {container: HTMLElement; unmount: () => void},
  branch: () => HTMLElement,
  chat: () => UseChatReturn,
): MountedThread {
  return {
    container: result.container,
    unmount: result.unmount,
    branch,
    chat,
    viewport: () => {
      const found = result.container.querySelector('[data-thread-viewport]')
      if (!(found instanceof HTMLElement)) throw new Error('expected the thread viewport')
      return found
    },
  }
}

function mountThread(initial: UIMessage[]): MountedThread {
  let chat: UseChatReturn | undefined
  let branch: HTMLElement | undefined
  const result = render(() => (
    <ThreadBody
      initial={initial}
      onChat={(value) => {
        chat = value
      }}
      ref={(node) => {
        branch = node
      }}
    />
  ))
  return mountedThreadFrom(
    result,
    () => {
      if (!branch) throw new Error('branch not mounted')
      return branch
    },
    () => {
      if (!chat) throw new Error('chat not mounted')
      return chat
    },
  )
}

function detachSubtree(node: HTMLElement): () => void {
  const parent = node.parentNode
  if (!parent) throw new Error('the subtree is not attached')
  const next = node.nextSibling
  parent.removeChild(node)
  return () => {
    parent.insertBefore(node, next)
  }
}

const REST_LABEL = 'thread rest readout'
const RESTS_WHERE_EXPECTED = 'thread rests where expected'
const REST_SAMPLE_FRAMES = 120
const REST_STABLE_FRAMES = 12
const REST_TOLERANCE_PX = 2

function reportRestingOffset(host: HTMLElement, viewport: () => HTMLElement, expected: () => number): void {
  const readout = document.createElement('p')
  readout.setAttribute('role', 'status')
  readout.setAttribute('aria-label', REST_LABEL)
  readout.textContent = 'thread rest sampling'
  host.append(readout)
  let stable = 0
  let framesLeft = REST_SAMPLE_FRAMES
  let worst = 'none'
  const sample = (): void => {
    const offset = viewport().scrollTop
    const target = expected()
    const off = Math.abs(offset - target)
    stable = off <= REST_TOLERANCE_PX ? stable + 1 : 0
    if (off > REST_TOLERANCE_PX) worst = `${Math.round(offset)} against ${Math.round(target)}`
    if (stable >= REST_STABLE_FRAMES) {
      readout.textContent = RESTS_WHERE_EXPECTED
      return
    }
    framesLeft -= 1
    if (framesLeft <= 0) {
      readout.textContent = `thread rests at ${Math.round(offset)}, expected ${Math.round(target)}, worst ${worst}`
      return
    }
    requestAnimationFrame(sample)
  }
  requestAnimationFrame(sample)
}

async function expectRestingOffset(thread: MountedThread, expected: () => number): Promise<void> {
  reportRestingOffset(thread.container, thread.viewport, expected)
  await expect.element(page.getByRole('status', {name: REST_LABEL})).toHaveTextContent(RESTS_WHERE_EXPECTED)
}

const endOffset = (viewport: HTMLElement): number => viewport.scrollHeight - viewport.clientHeight

async function mountFollowingThread(count = TURN_COUNT): Promise<MountedThread> {
  const thread = mountThread(seed(count))
  await expect.element(page.getByText(`tail marker ${count - 1}`).first()).toBeVisible()
  await expect.element(page.elementLocator(thread.viewport())).toHaveAttribute('data-at-bottom', '')
  return thread
}

async function readerScrollsUp(thread: MountedThread): Promise<number> {
  await userEvent.wheel(thread.viewport(), {delta: {y: -900}})
  await expect.element(page.elementLocator(thread.viewport())).not.toHaveAttribute('data-at-bottom')
  return thread.viewport().scrollTop
}

function appendTurns(thread: MountedThread, extra: number): void {
  thread.chat().setMessages(seed(TURN_COUNT + extra))
}

it('a reader parked above the bottom keeps the reading position when the viewport is re-inserted', async () => {
  const thread = await mountFollowingThread()
  const parked = await readerScrollsUp(thread)

  const reattach = detachSubtree(thread.branch())
  reattach()

  await expectRestingOffset(thread, () => parked)
})

it('a thread following the end stays at the end when the viewport is re-inserted', async () => {
  const thread = await mountFollowingThread()

  const reattach = detachSubtree(thread.branch())
  reattach()

  await expectRestingOffset(thread, () => endOffset(thread.viewport()))
})

it('a thread following the end lands on the new end when turns arrive while it is detached', async () => {
  const thread = await mountFollowingThread()

  const reattach = detachSubtree(thread.branch())
  appendTurns(thread, 3)
  reattach()

  await expect.element(page.getByText(`tail marker ${TURN_COUNT + 2}`).first()).toBeVisible()
  await expectRestingOffset(thread, () => endOffset(thread.viewport()))
})

it('a reader parked above the bottom keeps the position when turns arrive while it is detached', async () => {
  const thread = await mountFollowingThread()
  const parked = await readerScrollsUp(thread)

  const reattach = detachSubtree(thread.branch())
  appendTurns(thread, 3)
  reattach()

  await expectRestingOffset(thread, () => parked)
})

it('a reading position past the new maximum settles at the new maximum when the thread shrinks', async () => {
  const thread = await mountFollowingThread()
  const parked = await readerScrollsUp(thread)

  const reattach = detachSubtree(thread.branch())
  thread.chat().setMessages(seed(8))
  reattach()

  await expectRestingOffset(thread, () => Math.min(parked, endOffset(thread.viewport())))
})

it('two detach cycles in one task still restore the reading position', async () => {
  const thread = await mountFollowingThread()
  const parked = await readerScrollsUp(thread)

  detachSubtree(thread.branch())()
  detachSubtree(thread.branch())()

  await expectRestingOffset(thread, () => parked)
})

it('a genuine scroll to the very top right after re-insertion is left alone', async () => {
  const thread = await mountFollowingThread()
  const parked = await readerScrollsUp(thread)
  expect(parked).toBeGreaterThan(0)

  const reattach = detachSubtree(thread.branch())
  reattach()
  await userEvent.wheel(thread.viewport(), {delta: {y: -100000}})

  await expectRestingOffset(thread, () => 0)
})

function mountSuspendableThread(initial: UIMessage[]): {
  thread: MountedThread
  suspend: () => void
  resume: () => void
} {
  let chat: UseChatReturn | undefined
  let branch: HTMLElement | undefined
  let release: (() => void) | undefined
  const [gate, setGate] = createSignal(0)
  const result = render(() => {
    const [ready] = createResource(gate, (turn: number) => {
      if (turn === 0) return Promise.resolve(turn)
      return new Promise<number>((resolve) => {
        release = () => resolve(turn)
      })
    })
    return (
      <Suspense fallback={<p>thread suspended</p>}>
        <span hidden>{ready()}</span>
        <ThreadBody
          initial={initial}
          onChat={(value) => {
            chat = value
          }}
          ref={(node) => {
            branch = node
          }}
        />
      </Suspense>
    )
  })
  return {
    thread: mountedThreadFrom(
      result,
      () => {
        if (!branch) throw new Error('branch not mounted')
        return branch
      },
      () => {
        if (!chat) throw new Error('chat not mounted')
        return chat
      },
    ),
    suspend: () => setGate((turn) => turn + 1),
    resume: () => release?.(),
  }
}

it('a re-suspending Suspense boundary above the thread returns the reader to the reading position', async () => {
  const suspendable = mountSuspendableThread(seed(TURN_COUNT))
  const thread = suspendable.thread
  await expect.element(page.getByText(`tail marker ${LAST_TURN}`).first()).toBeVisible()
  await expect.element(page.elementLocator(thread.viewport())).toHaveAttribute('data-at-bottom', '')
  const parked = await readerScrollsUp(thread)

  suspendable.suspend()
  await expect.element(page.getByText('thread suspended')).toBeVisible()
  suspendable.resume()
  await expect.element(page.getByText('thread suspended')).not.toBeInTheDocument()

  await expectRestingOffset(thread, () => parked)
})
