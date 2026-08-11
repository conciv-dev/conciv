import 'virtual:uno.css'
import {expect, it} from 'vitest'
import {createSignal, For} from 'solid-js'
import {createStickToBottom} from '../src/behaviors/stick-to-bottom.js'
import {mountView} from './mount-view.js'

function Harness(props: {onReady: (element: HTMLDivElement, addRow: () => void) => void}) {
  const [element, setElement] = createSignal<HTMLDivElement>()
  const [rows, setRows] = createSignal<Array<number>>([])
  createStickToBottom(element, {initial: 'instant'})

  return (
    <div
      ref={(node) => {
        setElement(node)
        props.onReady(node, () => setRows((current) => [...current, current.length]))
      }}
      style={{height: '150px', width: '260px', 'overflow-y': 'auto'}}
    >
      <For each={rows()}>{(row) => <div style={{height: '24px'}}>transcript row {row}</div>}</For>
    </div>
  )
}

it('never runs the content-resize pass synchronously from the mutation observer, matching the ResizeObserver-only upstream contract', async () => {
  let containerElement: HTMLDivElement | undefined
  let addRow: (() => void) | undefined
  mountView(() => (
    <Harness
      onReady={(element, add) => {
        containerElement = element
        addRow = add
      }}
    />
  ))
  if (!containerElement) throw new Error('container did not mount')

  await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))

  const descriptor = Object.getOwnPropertyDescriptor(Element.prototype, 'scrollHeight')
  if (!descriptor?.get) throw new Error('scrollHeight getter unavailable on this browser')
  const originalGet = descriptor.get
  let sawScrollHeightReadBeforeAnyFrame = false
  let armed = true
  Object.defineProperty(Element.prototype, 'scrollHeight', {
    configurable: true,
    enumerable: descriptor.enumerable,
    set: descriptor.set,
    get(this: Element) {
      if (armed && this === containerElement) sawScrollHeightReadBeforeAnyFrame = true
      return originalGet.call(this)
    },
  })

  try {
    addRow?.()
    await Promise.resolve()
    await Promise.resolve()
    await Promise.resolve()
  } finally {
    armed = false
    Object.defineProperty(Element.prototype, 'scrollHeight', descriptor)
  }

  expect(sawScrollHeightReadBeforeAnyFrame).toBe(false)
})
