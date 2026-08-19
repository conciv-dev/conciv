import 'virtual:uno.css'
import {expect, it} from 'vitest'
import {createStore, produce} from 'solid-js/store'
import {Index} from 'solid-js'
import type {ToolCallPart} from '@tanstack/ai-client'
import {ToolCard} from '../src/tools/styled/tool-card.js'
import {mountView} from './mount-view.js'

const CARD_COUNT = 15
const SIBLING_COUNT = 60
const STAGGER_MS = 40
const SIBLING_PARAGRAPHS = Array.from({length: SIBLING_COUNT}, (_, index) => index)

function part(state: ToolCallPart['state']): ToolCallPart {
  return {type: 'tool-call', id: 't1', name: 'demo', arguments: '{}', input: {}, state}
}

const Icon = () => <span>i</span>

function ThreadBurst(props: {open: boolean[]}) {
  return (
    <div style={{display: 'flex', 'flex-direction': 'column', gap: '8px', width: '640px'}}>
      <Index each={props.open}>
        {(isOpen, index) => (
          <ToolCard
            Icon={Icon}
            title={`Tool step ${index}`}
            part={part('input-complete')}
            result={undefined}
            autoOpen={isOpen()}
            class={`card-${index}`}
          >
            <span>
              step rail detail for card {index}, enough content to give the collapsible a real measured height across
              several lines of diagnostic output that a tool would actually stream back to the thread.
            </span>
          </ToolCard>
        )}
      </Index>
      <Index each={SIBLING_PARAGRAPHS}>
        {(index) => (
          <p>Later thread content paragraph {index()} that the browser must reflow below the toggling cards.</p>
        )}
      </Index>
    </div>
  )
}

function wait(delayMs: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, delayMs))
}

function nextFrame(): Promise<number> {
  return new Promise((resolve) => requestAnimationFrame(resolve))
}

it('drives every card through the shared collapse keyframes while sibling content below reflows', async () => {
  const [open, setOpen] = createStore<boolean[]>(Array.from({length: CARD_COUNT}, () => false))
  const container = mountView(() => <ThreadBurst open={open} />)

  setOpen(produce((state) => (state[0] = true)))
  await nextFrame()
  await nextFrame()

  const trackedCard = container.querySelector('.card-0')
  const contentEl = trackedCard?.querySelector('[data-part="content"]')
  if (!(contentEl instanceof HTMLElement)) throw new Error('collapsible content element not found')

  expect(getComputedStyle(contentEl).animationName).toContain('collapse')

  for (let index = 1; index < CARD_COUNT; index += 1) {
    setOpen(produce((state) => (state[index] = true)))
    await wait(STAGGER_MS)
  }
})

it('animates the collapse content via keyframed grid-template-rows, not clip-path', async () => {
  const [open, setOpen] = createStore<boolean[]>([false])
  const container = mountView(() => <ThreadBurst open={open} />)

  setOpen(produce((state) => (state[0] = true)))
  await nextFrame()
  await nextFrame()

  const trackedCard = container.querySelector('.card-0')
  const contentEl = trackedCard?.querySelector('[data-part="content"]')
  if (!(contentEl instanceof HTMLElement)) throw new Error('collapsible content element not found')
  const innerWrapper = contentEl.firstElementChild
  if (!(innerWrapper instanceof HTMLElement)) throw new Error('collapsible inner wrapper not found')

  const computed = getComputedStyle(contentEl)

  expect(computed.animationName).toContain('collapse')
  expect(computed.display).toBe('grid')
  expect(getComputedStyle(innerWrapper).overflow).toBe('hidden')
})

it('plays the close animation when an open card collapses again', async () => {
  const [open, setOpen] = createStore<boolean[]>([true])
  const container = mountView(() => <ThreadBurst open={open} />)
  await nextFrame()
  await nextFrame()

  setOpen(produce((state) => (state[0] = false)))
  await nextFrame()
  await nextFrame()

  const trackedCard = container.querySelector('.card-0')
  const contentEl = trackedCard?.querySelector('[data-part="content"]')
  if (!(contentEl instanceof HTMLElement)) throw new Error('collapsible content element not found')

  expect(getComputedStyle(contentEl).animationName).toContain('close')
})
