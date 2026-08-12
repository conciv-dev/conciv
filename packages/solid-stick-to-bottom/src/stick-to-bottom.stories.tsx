import {createSignal, For, onCleanup, onMount, type JSX} from 'solid-js'
import type {Meta, StoryObj} from 'storybook-solidjs-vite'
import {expect, within, userEvent, waitFor} from 'storybook/test'
import {userEvent as realUserEvent, cdp} from 'vitest/browser'
import type {} from '@vitest/browser-playwright'
import {createStickToBottom} from './stick-to-bottom.js'

const meta: Meta = {title: 'solid-stick-to-bottom/StickToBottom'}
export default meta
type Story = StoryObj

const ROW_HEIGHT_PX = 24

function locateRequired(root: HTMLElement, selector: string): HTMLElement {
  const found = root.querySelector(selector)
  if (!(found instanceof HTMLElement)) throw new Error(`missing element for selector: ${selector}`)
  return found
}

function atBottomFlag(canvasElement: HTMLElement): HTMLElement {
  return locateRequired(canvasElement, '[data-at-bottom]')
}

function escapedFlag(canvasElement: HTMLElement): HTMLElement {
  return locateRequired(canvasElement, '[data-escaped]')
}

function viewportOf(canvasElement: HTMLElement): HTMLElement {
  return locateRequired(canvasElement, '[data-viewport]')
}

async function realWheel(element: Element, deltaY: number): Promise<void> {
  await realUserEvent.wheel(element, {delta: {y: deltaY}})
}

function centerOf(element: Element): {x: number; y: number} {
  const box = element.getBoundingClientRect()
  return {x: box.left + box.width / 2, y: box.top + box.height / 2}
}

async function beginRealDrag(from: Element, to: Element): Promise<() => Promise<void>> {
  const session = cdp()
  const fromPoint = centerOf(from)
  const toPoint = centerOf(to)
  await session.send('Input.dispatchMouseEvent', {type: 'mouseMoved', x: fromPoint.x, y: fromPoint.y})
  await session.send('Input.dispatchMouseEvent', {
    type: 'mousePressed',
    x: fromPoint.x,
    y: fromPoint.y,
    button: 'left',
    clickCount: 1,
  })
  const steps = 8
  for (let step = 1; step <= steps; step += 1) {
    const x = fromPoint.x + ((toPoint.x - fromPoint.x) * step) / steps
    const y = fromPoint.y + ((toPoint.y - fromPoint.y) * step) / steps
    await session.send('Input.dispatchMouseEvent', {type: 'mouseMoved', x, y, buttons: 1})
  }
  return async () => {
    await session.send('Input.dispatchMouseEvent', {
      type: 'mouseReleased',
      x: toPoint.x,
      y: toPoint.y,
      button: 'left',
      clickCount: 1,
    })
  }
}

function growthTicker(add: () => void, intervalMs: number, ticks: number): () => void {
  let count = 0
  const interval = setInterval(() => {
    count += 1
    add()
    if (count >= ticks) clearInterval(interval)
  }, intervalMs)
  return () => clearInterval(interval)
}

type GrowthHarnessApi = {
  viewport: HTMLDivElement
  addRow: () => void
  addRows: (n: number) => void
  removeRows: (n: number) => void
}

function GrowthHarness(props: {
  height?: number
  initialRows?: number
  onReady?: (api: GrowthHarnessApi) => void
}): JSX.Element {
  const [viewport, setViewport] = createSignal<HTMLDivElement>()
  const [rows, setRows] = createSignal<Array<number>>(Array.from({length: props.initialRows ?? 0}, (_, index) => index))
  const stick = createStickToBottom(viewport, {initial: 'instant'})
  const addRow = () => setRows((current) => [...current, current.length])
  const addRows = (n: number) =>
    setRows((current) => [...current, ...Array.from({length: n}, (_, i) => current.length + i)])
  const removeRows = (n: number) => setRows((current) => current.slice(0, Math.max(0, current.length - n)))
  return (
    <div style={{padding: '0.5rem'}}>
      <div data-at-bottom>{String(stick.isAtBottom())}</div>
      <div data-escaped>{String(stick.escapedFromLock())}</div>
      <div
        ref={(node) => {
          setViewport(node)
          props.onReady?.({viewport: node, addRow, addRows, removeRows})
        }}
        data-viewport
        style={{height: `${props.height ?? 150}px`, width: '260px', 'overflow-y': 'auto'}}
      >
        <For each={rows()}>{(row) => <div style={{height: `${ROW_HEIGHT_PX}px`}}>row {row}</div>}</For>
      </div>
    </div>
  )
}

export const PinnedFollowThroughGrowth: Story = {
  render: () => {
    let stop: (() => void) | undefined
    return (
      <GrowthHarness
        onReady={(api) => {
          onMount(() => {
            stop = growthTicker(api.addRow, 40, 30)
          })
          onCleanup(() => stop?.())
        }}
      />
    )
  },
  play: async ({canvasElement}) => {
    const c = within(canvasElement)
    await waitFor(() => expect(c.getByText('row 5')).toBeVisible())
    await expect(atBottomFlag(canvasElement)).toHaveTextContent('true')
    await waitFor(() => expect(c.getByText('row 29')).toBeVisible(), {timeout: 4000})
    await waitFor(() => expect(atBottomFlag(canvasElement)).toHaveTextContent('true'))
  },
}

function TwoTurnHarness(): JSX.Element {
  const [addRows, setAddRows] = createSignal<(n: number) => void>()
  return (
    <div>
      <button type="button" onClick={() => addRows()?.(8)}>
        start second turn
      </button>
      <GrowthHarness
        onReady={(api) => {
          setAddRows(() => api.addRows)
          onMount(() => {
            const firstTurn = growthTicker(api.addRow, 30, 8)
            onCleanup(firstTurn)
          })
        }}
      />
    </div>
  )
}

export const FreshTurnFollowEngagement: Story = {
  render: () => <TwoTurnHarness />,
  play: async ({canvasElement}) => {
    const c = within(canvasElement)
    const viewport = viewportOf(canvasElement)

    await waitFor(() => expect(c.getByText('row 7')).toBeVisible(), {timeout: 3000})
    await waitFor(() => expect(atBottomFlag(canvasElement)).toHaveTextContent('true'))
    await new Promise((resolve) => setTimeout(resolve, 250))
    await expect(atBottomFlag(canvasElement)).toHaveTextContent('true')

    const beforeHeight = viewport.scrollHeight
    await userEvent.click(c.getByRole('button', {name: 'start second turn'}))

    await waitFor(() => expect(viewport.scrollHeight).toBeGreaterThan(beforeHeight), {timeout: 3000})
    await waitFor(() => expect(atBottomFlag(canvasElement)).toHaveTextContent('true'), {timeout: 3000})
  },
}

export const WheelUpEscapeMidGrowth: Story = {
  render: () => {
    return (
      <GrowthHarness
        initialRows={12}
        onReady={(api) => {
          onMount(() => {
            const growth = growthTicker(api.addRow, 30, 40)
            onCleanup(growth)
          })
        }}
      />
    )
  },
  play: async ({canvasElement}) => {
    const c = within(canvasElement)
    const viewport = viewportOf(canvasElement)

    await waitFor(() => expect(c.getByText('row 11')).toBeVisible())
    await waitFor(() => expect(atBottomFlag(canvasElement)).toHaveTextContent('true'))
    await waitFor(() => expect(viewport.scrollHeight).toBeGreaterThan(viewport.clientHeight))

    await realWheel(viewport, -300)
    await waitFor(() => expect(escapedFlag(canvasElement)).toHaveTextContent('true'))
    await waitFor(() => expect(c.getByText('row 11')).toBeVisible())

    await new Promise((resolve) => setTimeout(resolve, 3200))
    await expect(c.getByText('row 11')).toBeVisible()
    await expect(escapedFlag(canvasElement)).toHaveTextContent('true')
  },
}

export const WheelDownReturnReLocks: Story = {
  render: () => <GrowthHarness initialRows={20} />,
  play: async ({canvasElement}) => {
    const c = within(canvasElement)
    const viewport = viewportOf(canvasElement)

    await waitFor(() => expect(c.getByText('row 19')).toBeVisible())
    await waitFor(() => expect(viewport.scrollHeight).toBeGreaterThan(viewport.clientHeight))
    await realWheel(viewport, -400)
    await waitFor(() => expect(escapedFlag(canvasElement)).toHaveTextContent('true'))

    await realWheel(viewport, viewport.scrollHeight)
    await waitFor(() => expect(escapedFlag(canvasElement)).toHaveTextContent('false'))
    await expect(atBottomFlag(canvasElement)).toHaveTextContent('true')
  },
}

export const ShrinkWhilePinnedSilentRelock: Story = {
  render: () => {
    let removeRows: ((n: number) => void) | undefined
    return (
      <div>
        <button type="button" onClick={() => removeRows?.(10)}>
          shrink
        </button>
        <GrowthHarness
          initialRows={20}
          onReady={(api) => {
            removeRows = api.removeRows
          }}
        />
      </div>
    )
  },
  play: async ({canvasElement}) => {
    const c = within(canvasElement)

    await waitFor(() => expect(c.getByText('row 19')).toBeVisible())
    await waitFor(() => expect(atBottomFlag(canvasElement)).toHaveTextContent('true'))

    await userEvent.click(c.getByRole('button', {name: 'shrink'}))
    await waitFor(() => expect(c.queryByText('row 19')).toBeNull())
    await waitFor(() => expect(atBottomFlag(canvasElement)).toHaveTextContent('true'))
    await expect(escapedFlag(canvasElement)).toHaveTextContent('false')
  },
}

export const ShrinkWhileParkedFarAboveNothingMoves: Story = {
  render: () => {
    let removeRows: ((n: number) => void) | undefined
    return (
      <div>
        <button type="button" onClick={() => removeRows?.(10)}>
          shrink
        </button>
        <GrowthHarness
          initialRows={40}
          onReady={(api) => {
            removeRows = api.removeRows
          }}
        />
      </div>
    )
  },
  play: async ({canvasElement}) => {
    const c = within(canvasElement)
    const viewport = viewportOf(canvasElement)

    await waitFor(() => expect(c.getByText('row 39')).toBeVisible())
    await waitFor(() => expect(viewport.scrollHeight).toBeGreaterThan(viewport.clientHeight))
    await realWheel(viewport, -4000)
    await waitFor(() => expect(escapedFlag(canvasElement)).toHaveTextContent('true'))
    await waitFor(() => expect(c.getByText('row 0')).toBeVisible())

    await userEvent.click(c.getByRole('button', {name: 'shrink'}))
    await waitFor(() => expect(c.queryByText('row 39')).toBeNull())
    await new Promise((resolve) => setTimeout(resolve, 300))
    await expect(c.getByText('row 0')).toBeVisible()
    await expect(escapedFlag(canvasElement)).toHaveTextContent('true')
  },
}

export const SelectionDuringStreamNoRepin: Story = {
  render: () => {
    let addRow: (() => void) | undefined
    return (
      <GrowthHarness
        initialRows={4}
        onReady={(api) => {
          addRow = api.addRow
          onMount(() => {
            const growth = growthTicker(() => addRow?.(), 40, 30)
            onCleanup(growth)
          })
        }}
      />
    )
  },
  play: async ({canvasElement}) => {
    const c = within(canvasElement)

    await waitFor(() => expect(c.getByText('row 0')).toBeVisible())
    await waitFor(() => expect(atBottomFlag(canvasElement)).toHaveTextContent('true'))

    const release = await beginRealDrag(c.getByText('row 0'), c.getByText('row 3'))
    await new Promise((resolve) => setTimeout(resolve, 400))
    await expect(c.getByText('row 0')).toBeVisible()

    await release()
    await waitFor(() => expect(atBottomFlag(canvasElement)).toHaveTextContent('true'), {timeout: 3000})
  },
}
