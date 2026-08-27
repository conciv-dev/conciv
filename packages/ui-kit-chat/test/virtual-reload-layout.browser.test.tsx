import 'virtual:uno.css'
import type {JSX} from 'solid-js'
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

function mountReloadedThread(initial: UIMessage[]): () => HTMLElement {
  let viewport: HTMLElement | undefined
  mountView(() => (
    <ReloadedThread
      initial={initial}
      ref={(element) => {
        viewport = element
      }}
    />
  ))
  return () => {
    if (!viewport) throw new Error('viewport not mounted')
    return viewport
  }
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
  mountReloadedThread(seedTranscript(TURNS))

  await expect.element(page.getByText(answerFor(TURNS - 1), {exact: false})).toBeVisible()

  expect(overlappingTurns()).toEqual([])
})

it('a fresh mount over a long transcript settles pinned to the latest turn', async () => {
  const viewport = mountReloadedThread(seedTranscript(TURNS))

  await expect.element(page.getByText(answerFor(TURNS - 1), {exact: false})).toBeVisible()
  await expect.element(page.elementLocator(viewport())).toHaveAttribute('data-at-bottom')
})
