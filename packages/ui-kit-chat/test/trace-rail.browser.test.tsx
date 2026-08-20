import 'virtual:uno.css'
import '@conciv/ui-kit-chat/theme/tokens.css'
import {expect, it} from 'vitest'
import {page} from 'vitest/browser'
import {createSignal, type JSX} from 'solid-js'
import type {ToolRowProjection} from '../src/tools/primitives/tool-row.js'
import {Trace, type TraceItem} from '../src/styled/trace/trace.js'
import {TraceToolRow} from '../src/styled/trace/trace-row.js'
import {TraceOutputBlock} from '../src/styled/trace/output-block.js'
import {mountView} from './mount-view.js'

function toolItem(key: string, projection: ToolRowProjection, body?: () => JSX.Element): TraceItem {
  return {
    key,
    render: (branch) => <TraceToolRow projection={projection} ring={branch.ring} body={body} />,
  }
}

const ONE_ROW_PROJECTION: ToolRowProjection = {mark: 'pass', label: 'read', target: 'src/app.tsx', meta: '12 lines'}

const LONG_OUTPUT = Array.from({length: 20}, (_, index) => `src/file-${index}.ts: a matching line`).join('\n')

function twoRowTrace(): TraceItem[] {
  return [
    toolItem('failing', {mark: 'fail', label: 'bash', target: 'pnpm test', meta: 'exit 1'}, () => (
      <TraceOutputBlock text={LONG_OUTPUT}>{LONG_OUTPUT}</TraceOutputBlock>
    )),
    toolItem('passing', {mark: 'pass', label: 'read', target: 'src/store/turn-rollup.ts', meta: '96 lines'}),
  ]
}

function mountTrace(items: TraceItem[]): HTMLElement {
  return mountView(() => <Trace summary="2 tools ran" compactLine="2 tools" items={items} defaultOpen />)
}

function traceRoot(container: HTMLElement): HTMLElement {
  const root = container.querySelector('[data-scope="collapsible"][data-part="root"]')
  if (!(root instanceof HTMLElement)) throw new Error('expected the collapsible root')
  return root
}

function railSvg(container: HTMLElement): SVGSVGElement {
  const svg = traceRoot(container).querySelectorAll(':scope > svg')[0]
  if (!(svg instanceof SVGSVGElement)) throw new Error('expected the rail svg')
  return svg
}

function liveRailSvg(container: HTMLElement): SVGSVGElement {
  const svg = traceRoot(container).querySelectorAll(':scope > svg')[1]
  if (!(svg instanceof SVGSVGElement)) throw new Error('expected the live rail svg')
  return svg
}

function railDot(container: HTMLElement): HTMLElement {
  const dot = traceRoot(container).querySelector(':scope > span')
  if (!(dot instanceof HTMLElement)) throw new Error('expected the rail dot')
  return dot
}

function spinePath(container: HTMLElement): SVGPathElement {
  const path = railSvg(container).querySelectorAll('path')[0]
  if (!(path instanceof SVGPathElement)) throw new Error('expected the rail spine path')
  return path
}

function armsPath(container: HTMLElement): SVGPathElement {
  const path = railSvg(container).querySelectorAll('path')[1]
  if (!(path instanceof SVGPathElement)) throw new Error('expected the rail arms path')
  return path
}

type Arm = {startX: number; y: number; endX: number}

function armSegments(path: SVGPathElement): Arm[] {
  return (path.getAttribute('d') ?? '')
    .split('M')
    .slice(1)
    .map((segment) => segment.replace('L', ' ').trim().split(/\s+/).map(Number))
    .map(([startX, y, endX]) => ({startX: startX ?? Number.NaN, y: y ?? Number.NaN, endX: endX ?? Number.NaN}))
}

function rowsList(container: HTMLElement): HTMLUListElement {
  const ul = container.querySelector('ul')
  if (!(ul instanceof HTMLUListElement)) throw new Error('expected the rows list')
  return ul
}

function gutterOf(container: HTMLElement): number {
  return Number.parseFloat(getComputedStyle(traceRoot(container)).getPropertyValue('--chat-trace-gutter'))
}

function headerItem(container: HTMLElement): HTMLElement {
  const trigger = traceRoot(container).querySelector('[data-part="trigger"]')
  const item = trigger?.parentElement
  if (!(item instanceof HTMLElement)) throw new Error('expected the header item')
  return item
}

function headerAnchor(container: HTMLElement): number {
  const rootTop = traceRoot(container).getBoundingClientRect().top
  return headerItem(container).getBoundingClientRect().top - rootTop + gutterOf(container) / 2
}

function rowAnchor(container: HTMLElement, index: number): number {
  const li = rowsList(container).querySelectorAll(':scope > li')[index]
  if (!(li instanceof HTMLElement)) throw new Error(`expected row ${index}`)
  const rootTop = traceRoot(container).getBoundingClientRect().top
  return li.getBoundingClientRect().top - rootTop + gutterOf(container) / 2
}

function lastRowAnchor(container: HTMLElement): number {
  return rowAnchor(container, rowsList(container).querySelectorAll(':scope > li').length - 1)
}

function dotTranslateY(dot: HTMLElement): number {
  return new DOMMatrixReadOnly(getComputedStyle(dot).transform).m42
}

function railBottomOf(svg: SVGSVGElement): number {
  return Number.parseFloat(getComputedStyle(svg).getPropertyValue('--rail-bottom'))
}

function waitForTransitionEnd(element: Element, property: string): Promise<void> {
  return new Promise((resolve) => {
    const handler = (event: Event): void => {
      if (event instanceof TransitionEvent && event.propertyName === property) {
        element.removeEventListener('transitionend', handler)
        resolve()
      }
    }
    element.addEventListener('transitionend', handler)
  })
}

function liveToolItem(key: string, target: string, live: () => boolean): TraceItem {
  return {
    key,
    get live() {
      return live()
    },
    render: (branch) => (
      <TraceToolRow projection={{mark: 'pass', label: 'read', target, meta: '1 line'}} ring={branch.ring} />
    ),
  }
}

function runningRingDot(container: HTMLElement): HTMLElement {
  const ring = container.querySelector('span[role="img"][aria-label="running"] > span')
  if (!(ring instanceof HTMLElement)) throw new Error('expected the running ring inner dot')
  return ring
}

function liveRunTrace(): TraceItem[] {
  return [
    {
      key: 'running',
      live: true,
      render: (branch) => (
        <TraceToolRow projection={{mark: 'run', label: 'bash', target: 'pnpm build'}} ring={branch.ring} />
      ),
    },
  ]
}

function threeRowLiveTrace(liveIndex: () => number): TraceItem[] {
  return [0, 1, 2].map((index) => liveToolItem(`row-${index}`, `file-${index}.ts`, () => liveIndex() === index))
}

function mountThreeRow(liveIndex: () => number): HTMLElement {
  return mountView(() => (
    <Trace summary="3 tools ran" compactLine="3 tools" items={threeRowLiveTrace(liveIndex)} defaultOpen />
  ))
}

async function mountedThreeRow(liveIndex: () => number): Promise<HTMLElement> {
  const container = mountThreeRow(liveIndex)
  await expect.element(page.getByText('file-2.ts')).toBeVisible()
  return container
}

it('draws the whole rail as one svg with no leftover connector fragments', async () => {
  const container = mountTrace(twoRowTrace())
  await expect.element(page.getByText('bash')).toBeVisible()

  const gutter = gutterOf(container)
  const start = spinePath(container).getPointAtLength(0)

  expect(start.x).toBe(Math.round(gutter / 2) + 0.5)
  expect(traceRoot(container).querySelectorAll('span[class*="background:var(--chat-glyph)"]')).toHaveLength(0)
  expect(traceRoot(container).querySelectorAll('span[class*="solid_var(--chat-glyph)"]')).toHaveLength(0)
})

it('ends the spine at the gutter edge, aligned to the last row anchor', async () => {
  const container = mountTrace(twoRowTrace())
  await expect.element(page.getByText('bash')).toBeVisible()

  const path = spinePath(container)
  const end = path.getPointAtLength(path.getTotalLength())

  expect(Math.abs(end.x - gutterOf(container))).toBeLessThanOrEqual(0.01)
  expect(Math.abs(end.y - lastRowAnchor(container))).toBeLessThanOrEqual(0.5)
})

it('starts the spine at the top of the header row, above the rows list', async () => {
  const container = mountTrace(twoRowTrace())
  await expect.element(page.getByText('bash')).toBeVisible()

  const start = spinePath(container).getPointAtLength(0)
  const rootTop = traceRoot(container).getBoundingClientRect().top
  const expected = headerItem(container).getBoundingClientRect().top - rootTop

  expect(Math.abs(start.y - expected)).toBeLessThanOrEqual(0.01)
})

it('draws the header corner alone while the trace is collapsed', async () => {
  const container = mountView(() => <Trace summary="2 tools ran" compactLine="2 tools" items={twoRowTrace()} />)
  await expect.element(page.getByText('Show trace')).toBeVisible()

  const path = spinePath(container)
  const end = path.getPointAtLength(path.getTotalLength())

  expect(armsPath(container).getAttribute('d')).toBe('')
  expect(Math.abs(end.x - gutterOf(container))).toBeLessThanOrEqual(0.01)
  expect(Math.abs(end.y - headerAnchor(container))).toBeLessThanOrEqual(0.5)
})

it('reflows the spine end when a row before the last one changes height', async () => {
  const container = mountTrace(twoRowTrace())
  await expect.element(page.getByText('bash')).toBeVisible()

  const path = spinePath(container)
  const initialD = path.getAttribute('d')

  const fold = page.getByRole('button', {name: /pnpm test/})
  await expect.element(fold).toHaveAttribute('aria-expanded', 'true')
  await fold.click()
  await expect.element(fold).toHaveAttribute('aria-expanded', 'false')

  await expect.element(page.elementLocator(path)).not.toHaveAttribute('d', initialD ?? '')
})

it('ticks an arm from the spine to the gutter edge on the header and every row but the last', async () => {
  const container = await mountedThreeRow(() => -1)

  const gutter = gutterOf(container)
  const spineStartX = spinePath(container).getPointAtLength(0).x
  const arms = armSegments(armsPath(container))
  const expected = [headerAnchor(container), rowAnchor(container, 0), rowAnchor(container, 1)]

  expect(arms).toHaveLength(3)
  expect(arms.map((arm) => Math.abs(arm.startX - spineStartX) <= 0.01)).toEqual([true, true, true])
  expect(arms.map((arm) => Math.abs(arm.endX - gutter) <= 0.01)).toEqual([true, true, true])
  expect(arms.map((arm, index) => Math.abs(arm.y - (expected[index] ?? Number.NaN)) <= 0.5)).toEqual([true, true, true])
})

it('ticks only the header arm for a single-row trace where the corner already serves the row', async () => {
  const container = mountView(() => (
    <Trace summary="1 tool ran" compactLine="1 tool" items={[toolItem('only', ONE_ROW_PROJECTION)]} defaultOpen />
  ))
  await expect.element(page.getByText('src/app.tsx')).toBeVisible()

  const arms = armSegments(armsPath(container))

  expect(arms).toHaveLength(1)
  expect(Math.abs((arms[0]?.y ?? Number.NaN) - headerAnchor(container))).toBeLessThanOrEqual(0.5)
})

it('anchors the live accent under a live row that is not last and shows it', async () => {
  const container = await mountedThreeRow(() => 1)

  const liveSvg = liveRailSvg(container)

  expect(getComputedStyle(liveSvg).opacity).toBe('1')
  expect(Math.abs(railBottomOf(liveSvg) - rowAnchor(container, 1))).toBeLessThanOrEqual(0.5)
})

it('fades the live accent out and settles it at the last row once nothing is live', async () => {
  const [liveIndex, setLiveIndex] = createSignal(1)
  const container = mountView(() => (
    <Trace summary="3 tools ran" compactLine="3 tools" items={threeRowLiveTrace(liveIndex)} defaultOpen />
  ))
  await expect.element(page.getByText('file-2.ts')).toBeVisible()

  const liveSvg = liveRailSvg(container)
  const settled = waitForTransitionEnd(liveSvg, 'opacity')
  setLiveIndex(-1)
  await settled

  expect(getComputedStyle(liveSvg).opacity).toBe('0')
  expect(Math.abs(railBottomOf(liveSvg) - rowAnchor(container, 2))).toBeLessThanOrEqual(0.5)
})

it('starts the live accent hidden with no flash when nothing is live at mount', () => {
  const container = mountThreeRow(() => -1)

  expect(getComputedStyle(liveRailSvg(container)).opacity).toBe('0')
})

it('rides the travelling dot on the live row anchor and shows it', async () => {
  const container = await mountedThreeRow(() => 1)

  const dot = railDot(container)

  expect(getComputedStyle(dot).opacity).toBe('1')
  expect(Math.abs(dotTranslateY(dot) - rowAnchor(container, 1))).toBeLessThanOrEqual(1)
})

it('keeps the travelling dot hidden when nothing is live', () => {
  const container = mountThreeRow(() => -1)

  expect(getComputedStyle(railDot(container)).opacity).toBe('0')
})

it('mirrors the travelling dot onto the mirrored spine under rtl', async () => {
  const container = await mountedThreeRow(() => 1)

  const root = traceRoot(container)
  root.setAttribute('dir', 'rtl')

  const svgRect = railSvg(container).getBoundingClientRect()
  const rootRect = root.getBoundingClientRect()
  const mirroredSpineX = svgRect.left + (svgRect.width - spinePath(container).getPointAtLength(0).x)

  const dotRect = railDot(container).getBoundingClientRect()
  const dotCenterX = dotRect.left + dotRect.width / 2

  expect(Math.abs(svgRect.right - rootRect.right)).toBeLessThanOrEqual(0.51)
  expect(Math.abs(dotCenterX - mirroredSpineX)).toBeLessThanOrEqual(0.51)
})

it('pulses the rail dot rather than the row ring while a run row is live', async () => {
  const container = mountView(() => (
    <Trace summary="1 tool ran" compactLine="1 tool" items={liveRunTrace()} defaultOpen />
  ))
  await expect.element(page.getByText('pnpm build')).toBeVisible()

  expect(railDot(container).getAnimations({subtree: true})).toHaveLength(1)
  expect(runningRingDot(container).getAnimations()).toEqual([])
})

it('leaves no running animation in the rail once the live row settles away', async () => {
  const [liveIndex, setLiveIndex] = createSignal(1)
  const container = mountView(() => (
    <Trace summary="3 tools ran" compactLine="3 tools" items={threeRowLiveTrace(liveIndex)} defaultOpen />
  ))
  await expect.element(page.getByText('file-2.ts')).toBeVisible()

  const dot = railDot(container)
  const root = traceRoot(container)
  const settled = Promise.all([waitForTransitionEnd(dot, 'opacity'), waitForTransitionEnd(dot, 'transform')])
  setLiveIndex(-1)
  await settled

  expect(getComputedStyle(dot).opacity).toBe('0')
  expect(root.getAnimations({subtree: true})).toEqual([])
})
