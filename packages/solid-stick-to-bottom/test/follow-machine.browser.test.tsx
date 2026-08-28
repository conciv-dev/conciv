import {createSignal, onMount, type JSX} from 'solid-js'
import {render} from '@solidjs/testing-library'
import {page, userEvent} from 'vitest/browser'
import {expect, it, onTestFinished} from 'vitest'
import {createStickToBottom, type StickToBottom} from '../src/stick-to-bottom.js'

const VIEWPORT_HEIGHT_PX = 200

type Mounted = {
  scroller: () => HTMLElement
  machine: () => StickToBottom
  setContentHeight: (height: number) => void
}

function mountScroller(initialHeight: number): Mounted {
  const [contentHeight, setContentHeight] = createSignal(initialHeight)
  const [renderedHeight, setRenderedHeight] = createSignal(0)
  let scroller: HTMLElement | undefined
  let body: HTMLElement | undefined
  let machine: StickToBottom | undefined

  function Harness(): JSX.Element {
    const [element, setElement] = createSignal<HTMLDivElement>()
    const stick = createStickToBottom(element)
    onMount(() => {
      machine = stick
    })
    return (
      <div>
        <div
          tabIndex={0}
          ref={(node) => {
            scroller = node
            setElement(node)
          }}
          style={{height: `${VIEWPORT_HEIGHT_PX}px`, width: '300px', 'overflow-y': 'auto'}}
        >
          <div
            ref={(node) => (body = node)}
            style={{height: `${contentHeight()}px`, background: 'linear-gradient(#eee, #333)'}}
          />
        </div>
        <span role="status">{`${stick.phase()} at ${renderedHeight()}`}</span>
      </div>
    )
  }

  render(() => <Harness />)
  const measuredBody = body
  if (!measuredBody) throw new Error('content body not mounted')
  const observer = new ResizeObserver(() => setRenderedHeight(measuredBody.offsetHeight))
  observer.observe(measuredBody)
  onTestFinished(() => observer.disconnect())
  return {
    scroller: () => {
      if (!scroller) throw new Error('scroller not mounted')
      return scroller
    },
    machine: () => {
      if (!machine) throw new Error('machine not mounted')
      return machine
    },
    setContentHeight,
  }
}

function distanceFromEnd(element: HTMLElement): number {
  return element.scrollHeight - element.scrollTop - element.clientHeight
}

async function mountFollowingScroller(initialHeight: number): Promise<Mounted> {
  const mounted = mountScroller(initialHeight)
  await expect.element(page.getByRole('status')).toHaveTextContent(`following at ${initialHeight}`)
  return mounted
}

async function releaseByWheelingUp(mounted: Mounted): Promise<void> {
  await userEvent.wheel(mounted.scroller(), {delta: {y: -400}})
  await expect.element(page.getByRole('status')).toHaveTextContent('released at')
}

it('settles to following pinned at the end of the content', async () => {
  const mounted = await mountFollowingScroller(2000)

  expect(distanceFromEnd(mounted.scroller())).toBeLessThanOrEqual(1)
})

it('releases when a wheel gesture scrolls up', async () => {
  const mounted = await mountFollowingScroller(2000)

  await releaseByWheelingUp(mounted)
})

it('releases when a keyboard scroll key is pressed', async () => {
  const mounted = await mountFollowingScroller(2000)

  mounted.scroller().focus()
  await userEvent.keyboard('{PageUp}')

  await expect.element(page.getByRole('status')).toHaveTextContent('released at')
})

it('keeps following when the browser clamps the scroll position after the content shrinks', async () => {
  const mounted = await mountFollowingScroller(4000)

  mounted.setContentHeight(900)

  await expect.element(page.getByRole('status')).toHaveTextContent('following at 900')
  expect(distanceFromEnd(mounted.scroller())).toBeLessThanOrEqual(1)
})

it('keeps following through a growth wave that follows a shrink wave', async () => {
  const mounted = await mountFollowingScroller(4000)

  mounted.setContentHeight(3700)
  await expect.element(page.getByRole('status')).toHaveTextContent('following at 3700')
  mounted.setContentHeight(10000)

  await expect.element(page.getByRole('status')).toHaveTextContent('following at 10000')
  expect(distanceFromEnd(mounted.scroller())).toBeLessThanOrEqual(1)
})

it('releases when the viewport scrolls up with no content change to explain it', async () => {
  const mounted = await mountFollowingScroller(2000)

  mounted.scroller().scrollTop = 0

  await expect.element(page.getByRole('status')).toHaveTextContent('released at')
})

it('returns to following at the end when asked to scroll to the bottom', async () => {
  const mounted = await mountFollowingScroller(2000)
  await releaseByWheelingUp(mounted)

  mounted.machine().scrollToBottom()

  await expect.element(page.getByRole('status')).toHaveTextContent('following at')
  expect(distanceFromEnd(mounted.scroller())).toBeLessThanOrEqual(1)
})

it('returns to following when the reader scrolls back down to the end', async () => {
  const mounted = await mountFollowingScroller(2000)
  await releaseByWheelingUp(mounted)

  await userEvent.wheel(mounted.scroller(), {delta: {y: 600}})

  await expect.element(page.getByRole('status')).toHaveTextContent('following at')
})
