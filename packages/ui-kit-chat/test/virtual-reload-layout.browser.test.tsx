import 'virtual:uno.css'
import {createSignal, onMount, type JSX} from 'solid-js'
import {page} from 'vitest/browser'
import {expect, it} from 'vitest'
import {useChat} from '@tanstack/ai-solid'
import type {UIMessage} from '@tanstack/ai-client'
import {ChatProvider} from '../src/store/chat-context.js'
import {storyConnection} from '../src/store/story-connection.js'
import {Thread} from '../src/styled/thread.js'
import {VIRTUALIZE_THRESHOLD} from '../src/primitives/thread/virtualize-threshold.js'
import {mountView} from './mount-view.js'

const TURNS = VIRTUALIZE_THRESHOLD * 4
const OVERLAP_TOLERANCE_PX = 1
const PROSE = 'a settled paragraph of the seeded answer that wraps across the pane. '

function answerFor(index: number): string {
  return `seeded answer ${index}`
}

function seedTranscript(turns: number): UIMessage[] {
  return Array.from(
    {length: turns},
    (_unused, index): UIMessage =>
      index % 2 === 0
        ? {id: `m${index}`, role: 'user', parts: [{type: 'text', content: `seeded question ${index}`}]}
        : {
            id: `m${index}`,
            role: 'assistant',
            parts: [{type: 'text', content: `${answerFor(index)}\n${PROSE.repeat(3)}`}],
          },
  )
}

function ReloadedThread(props: {initial: UIMessage[]; ref?: (element: HTMLElement) => void}): JSX.Element {
  const chat = useChat({connection: storyConnection({chunks: []}), initialMessages: props.initial})
  return (
    <ChatProvider chat={chat}>
      <Thread class="h-150 w-100">
        <Thread.Viewport ref={props.ref}>
          <Thread.Messages turnPrefix={() => null} />
        </Thread.Viewport>
      </Thread>
    </ChatProvider>
  )
}

function mountReloadedThread(initial: UIMessage[]): {host: HTMLElement; viewport: () => HTMLElement} {
  let viewport: HTMLElement | undefined
  const host = mountView(() => (
    <ReloadedThread
      initial={initial}
      ref={(element) => {
        viewport = element
      }}
    />
  ))
  return {
    host,
    viewport: () => {
      if (!viewport) throw new Error('viewport not mounted')
      return viewport
    },
  }
}

const SETTLED_FRAMES = 10
const LAYOUT_SETTLED = 'turn layout settled with no overlap'

function reportLayoutWhenSettled(host: HTMLElement): void {
  const readout = document.createElement('p')
  readout.textContent = 'turn layout sampling'
  host.append(readout)
  let cleanFrames = 0
  const sample = (): void => {
    const overlaps = overlappingTurns()
    cleanFrames = overlaps.length === 0 ? cleanFrames + 1 : 0
    if (cleanFrames >= SETTLED_FRAMES) {
      readout.textContent = LAYOUT_SETTLED
      return
    }
    if (overlaps[0]) readout.textContent = `turn layout overlaps: ${overlaps[0]}`
    requestAnimationFrame(sample)
  }
  requestAnimationFrame(sample)
}

type TurnBox = {index: number; top: number; bottom: number}

function turnBoxes(): TurnBox[] {
  const boxes: TurnBox[] = []
  for (const row of document.querySelectorAll<HTMLElement>('[data-index]')) {
    const root = row.querySelector<HTMLElement>('[data-conciv-msg]')
    if (!root) continue
    const box = root.getBoundingClientRect()
    if (box.height === 0) continue
    boxes.push({index: Number(row.dataset.index), top: box.top, bottom: box.bottom})
  }
  return boxes.toSorted((left, right) => left.index - right.index)
}

function overlappingTurns(): string[] {
  const boxes = turnBoxes()
  const overlaps: string[] = []
  for (let position = 1; position < boxes.length; position += 1) {
    const previous = boxes[position - 1]
    const current = boxes[position]
    if (!previous || !current) continue
    if (current.top < previous.bottom - OVERLAP_TOLERANCE_PX) {
      overlaps.push(
        `turn ${previous.index} ends at ${previous.bottom} while turn ${current.index} starts at ${current.top}`,
      )
    }
  }
  return overlaps
}

it('a fresh mount over a long transcript lays every turn out without overlap', async () => {
  const thread = mountReloadedThread(seedTranscript(TURNS))

  await expect.element(page.getByText(answerFor(TURNS - 1), {exact: false})).toBeVisible()
  reportLayoutWhenSettled(thread.host)

  await expect.element(page.getByText(LAYOUT_SETTLED)).toBeInTheDocument()
})

it('a fresh mount over a long transcript settles pinned to the latest turn', async () => {
  const thread = mountReloadedThread(seedTranscript(TURNS))

  await expect.element(page.getByText(answerFor(TURNS - 1), {exact: false})).toBeVisible()
  await expect.element(page.elementLocator(thread.viewport())).toHaveAttribute('data-at-bottom')
})

const REST_READOUT_LABEL = 'thread rest readout'
const RESTS_AT_END = 'thread rests at the end'
const REST_SAMPLE_FRAMES = 180

function restingGap(viewport: HTMLElement): number {
  return viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight
}

function reportRestWhenSettled(host: HTMLElement, viewport: () => HTMLElement): void {
  const readout = document.createElement('p')
  readout.setAttribute('role', 'status')
  readout.setAttribute('aria-label', REST_READOUT_LABEL)
  readout.textContent = 'thread rest sampling'
  host.append(readout)
  let cleanFrames = 0
  let framesLeft = REST_SAMPLE_FRAMES
  let widestGap = 0
  const sample = (): void => {
    const gap = restingGap(viewport())
    cleanFrames = gap < 0.5 ? cleanFrames + 1 : 0
    widestGap = Math.max(widestGap, gap)
    if (cleanFrames >= SETTLED_FRAMES) {
      readout.textContent = RESTS_AT_END
      return
    }
    framesLeft -= 1
    if (framesLeft <= 0) {
      readout.textContent = `thread rests ${gap}px short of the end, widest gap ${widestGap}px`
      return
    }
    requestAnimationFrame(sample)
  }
  requestAnimationFrame(sample)
}

function GrowingTail(): JSX.Element {
  const [tall, setTall] = createSignal(false)
  onMount(() => {
    void document.fonts.ready.then(() => {
      requestAnimationFrame(() => requestAnimationFrame(() => setTall(true)))
    })
  })
  return <div style={{height: tall() ? '41px' : '0px'}} />
}

function LateTailThread(props: {initial: UIMessage[]; ref?: (element: HTMLElement) => void}): JSX.Element {
  const chat = useChat({connection: storyConnection({chunks: []}), initialMessages: props.initial})
  const lastKey = props.initial[props.initial.length - 1]?.id
  return (
    <ChatProvider chat={chat}>
      <Thread class="h-150 w-100">
        <Thread.Viewport ref={props.ref}>
          <Thread.Messages turnPrefix={(turn) => (turn.key === lastKey ? <GrowingTail /> : null)} />
        </Thread.Viewport>
      </Thread>
    </ChatProvider>
  )
}

it('a fresh mount over a long transcript rests flush against the end of the thread', async () => {
  let viewport: HTMLElement | undefined
  const host = mountView(() => (
    <LateTailThread
      initial={seedTranscript(TURNS)}
      ref={(element) => {
        viewport = element
      }}
    />
  ))

  await expect.element(page.getByText(answerFor(TURNS - 1), {exact: false})).toBeVisible()
  reportRestWhenSettled(host, () => {
    if (!viewport) throw new Error('viewport not mounted')
    return viewport
  })

  await expect.element(page.getByRole('status', {name: REST_READOUT_LABEL})).toHaveTextContent(RESTS_AT_END)
})
