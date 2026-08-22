import 'virtual:uno.css'
import '@conciv/ui-kit-system/tokens.css'
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

function segmentTop(container: HTMLElement): number {
  return Number.parseFloat(getComputedStyle(liveRailSvg(container)).getPropertyValue('--rail-top'))
}

function segmentBottom(container: HTMLElement): number {
  return Number.parseFloat(getComputedStyle(liveRailSvg(container)).getPropertyValue('--rail-bottom'))
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

const SAMPLE_COUNT = 1000
const CORNER_RADIUS = 3

function samplePoints(path: SVGPathElement): DOMPoint[] {
  const total = path.getTotalLength()
  return Array.from({length: SAMPLE_COUNT + 1}, (_, step) => path.getPointAtLength((total * step) / SAMPLE_COUNT))
}

function deepestXBetween(path: SVGPathElement, fromY: number, toY: number): number {
  const inside = samplePoints(path).filter((point) => point.y >= fromY && point.y <= toY)
  return Math.max(...inside.map((point) => point.x))
}

function expandedBodyTrace(): TraceItem[] {
  return [
    toolItem('failing', {mark: 'fail', label: 'bash', target: 'pnpm test', meta: 'exit 1'}, () => (
      <TraceOutputBlock text={LONG_OUTPUT}>{LONG_OUTPUT}</TraceOutputBlock>
    )),
    liveToolItem('live', 'file-live.ts', () => true),
    liveToolItem('after', 'file-after.ts', () => false),
  ]
}

it('holds the spine straight in its column alongside an expanded row body', async () => {
  const container = mountTrace(twoRowTrace())
  await expect.element(page.getByText('bash')).toBeVisible()

  const column = Math.round(gutterOf(container) / 2) + 0.5
  const path = spinePath(container)
  const bodyTop = rowAnchor(container, 0)
  const beforeTheCorner = rowAnchor(container, 1) - CORNER_RADIUS

  expect(path.getAttribute('d')).not.toMatch(/C/)
  expect(Math.abs(deepestXBetween(path, bodyTop, beforeTheCorner) - column)).toBeLessThanOrEqual(0.05)
})

it('keeps every tick arm and the terminal corner while a row body is expanded', async () => {
  const container = mountTrace(twoRowTrace())
  await expect.element(page.getByText('bash')).toBeVisible()

  const gutter = gutterOf(container)
  const arms = armSegments(armsPath(container))
  const spine = spinePath(container)
  const end = spine.getPointAtLength(spine.getTotalLength())
  const expected = [headerAnchor(container), rowAnchor(container, 0)]

  expect(arms).toHaveLength(2)
  expect(arms.map((arm, index) => Math.abs(arm.y - (expected[index] ?? Number.NaN)) <= 0.5)).toEqual([true, true])
  expect(Math.abs(end.x - gutter)).toBeLessThanOrEqual(0.01)
  expect(Math.abs(end.y - lastRowAnchor(container))).toBeLessThanOrEqual(0.5)
})

it('lights the span just traversed into a live row that follows an expanded row body', async () => {
  const container = mountTrace(expandedBodyTrace())
  await expect.element(page.getByText('file-after.ts')).toBeVisible()

  expect(getComputedStyle(liveRailSvg(container)).opacity).toBe('1')
  expect(Math.abs(segmentTop(container) - rowAnchor(container, 0))).toBeLessThanOrEqual(0.5)
  expect(Math.abs(segmentBottom(container) - rowAnchor(container, 1))).toBeLessThanOrEqual(0.5)
})

it('draws the whole rail from the svg layers with no fragment spans', async () => {
  const container = mountTrace(twoRowTrace())
  await expect.element(page.getByText('bash')).toBeVisible()

  const gutter = gutterOf(container)
  const start = spinePath(container).getPointAtLength(0)
  const root = traceRoot(container)

  expect(start.x).toBe(Math.round(gutter / 2) + 0.5)
  expect(root.querySelectorAll('span[class*="background:var(--chat-glyph)"]')).toHaveLength(0)
  expect(root.querySelectorAll('span[class*="solid_var(--chat-glyph)"]')).toHaveLength(0)
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

it('reflows the spine when a row before the last one changes height', async () => {
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

it('lights only the span just traversed into the live row and shows it', async () => {
  const container = await mountedThreeRow(() => 1)

  expect(getComputedStyle(liveRailSvg(container)).opacity).toBe('1')
  expect(Math.abs(segmentTop(container) - rowAnchor(container, 0))).toBeLessThanOrEqual(0.5)
  expect(Math.abs(segmentBottom(container) - rowAnchor(container, 1))).toBeLessThanOrEqual(0.5)
})

it('lights the span from the header down into a live first row', async () => {
  const container = await mountedThreeRow(() => 0)

  expect(Math.abs(segmentTop(container) - headerAnchor(container))).toBeLessThanOrEqual(0.5)
  expect(Math.abs(segmentBottom(container) - rowAnchor(container, 0))).toBeLessThanOrEqual(0.5)
})

it('fades the live segment out where it stands once nothing is live', async () => {
  const [liveIndex, setLiveIndex] = createSignal(1)
  const container = mountView(() => (
    <Trace summary="3 tools ran" compactLine="3 tools" items={threeRowLiveTrace(liveIndex)} defaultOpen />
  ))
  await expect.element(page.getByText('file-2.ts')).toBeVisible()

  const liveSvg = liveRailSvg(container)
  const litTop = segmentTop(container)
  const litBottom = segmentBottom(container)
  const settled = waitForTransitionEnd(liveSvg, 'opacity')
  setLiveIndex(-1)
  await settled

  expect(getComputedStyle(liveSvg).opacity).toBe('0')
  expect(segmentTop(container)).toBe(litTop)
  expect(segmentBottom(container)).toBe(litBottom)
})

it('starts the live segment hidden with no flash when nothing is live at mount', () => {
  const container = mountThreeRow(() => -1)

  expect(getComputedStyle(liveRailSvg(container)).opacity).toBe('0')
})

it('mirrors the rail onto the inline-start edge under rtl', async () => {
  const container = await mountedThreeRow(() => 1)

  const root = traceRoot(container)
  root.setAttribute('dir', 'rtl')

  const railRect = railSvg(container).getBoundingClientRect()
  const rootRect = root.getBoundingClientRect()
  const scale = getComputedStyle(railSvg(container)).scale

  expect(Math.abs(railRect.right - rootRect.right)).toBeLessThanOrEqual(0.51)
  expect(scale.split(' ')[0]).toBe('-1')
})

it('pulses the running ring dot while a run row is live and keeps the rail free of animations', async () => {
  const container = mountView(() => (
    <Trace summary="1 tool ran" compactLine="1 tool" items={liveRunTrace()} defaultOpen />
  ))
  await expect.element(page.getByText('pnpm build')).toBeVisible()

  expect(runningRingDot(container).getAnimations()).toHaveLength(1)
  expect(railSvg(container).getAnimations({subtree: true})).toEqual([])
  expect(liveRailSvg(container).getAnimations({subtree: true})).toEqual([])
})

it('leaves no running animation in the rail once the live row settles away', async () => {
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
  expect(traceRoot(container).getAnimations({subtree: true})).toEqual([])
})

it('drops the live segment and the rail to the header corner when a live trace is collapsed by click', async () => {
  const container = await mountedThreeRow(() => 1)
  const liveSvg = liveRailSvg(container)
  await expect.element(page.elementLocator(liveSvg), {timeout: 2000}).toHaveStyle({opacity: '1'})

  await page.getByText('Hide trace').click()
  await expect.element(page.getByText('Show trace'), {timeout: 2000}).toBeVisible()
  await expect.element(page.elementLocator(liveSvg), {timeout: 2000}).toHaveStyle({opacity: '0'})

  const path = spinePath(container)
  const end = path.getPointAtLength(path.getTotalLength())

  expect(armsPath(container).getAttribute('d')).toBe('')
  expect(Math.abs(end.x - gutterOf(container))).toBeLessThanOrEqual(0.01)
  expect(Math.abs(end.y - headerAnchor(container))).toBeLessThanOrEqual(0.5)
})

async function scrollRowToReadingBand(container: HTMLElement, index: number): Promise<void> {
  const li = rowsList(container).querySelectorAll(':scope > li')[index]
  if (!(li instanceof HTMLElement)) throw new Error(`expected row ${index}`)
  const rect = li.getBoundingClientRect()
  const target = rect.top + rect.height / 2 + window.scrollY - window.innerHeight * 0.325
  window.scrollTo(0, target)
  await new Promise(requestAnimationFrame)
}

function tallThreeRowTrace(liveIndex: () => number): JSX.Element {
  return (
    <>
      <div style={{height: '120vh'}} />
      <Trace summary="3 tools ran" compactLine="3 tools" items={threeRowLiveTrace(liveIndex)} defaultOpen />
      <div style={{height: '120vh'}} />
    </>
  )
}

it('lights the row under the reading line while scrolling a settled trace', async () => {
  const container = mountView(() => tallThreeRowTrace(() => -1))
  await expect.element(page.getByText('file-2.ts')).toBeVisible()

  await scrollRowToReadingBand(container, 1)

  await expect.element(page.elementLocator(liveRailSvg(container))).toHaveStyle({opacity: '1'})
  expect(Math.abs(segmentTop(container) - rowAnchor(container, 0))).toBeLessThanOrEqual(0.5)
  expect(Math.abs(segmentBottom(container) - rowAnchor(container, 1))).toBeLessThanOrEqual(0.5)

  window.scrollTo(0, 0)
})

it('keeps the live row segment even when scroll focuses another row', async () => {
  const container = mountView(() => tallThreeRowTrace(() => 2))
  await expect.element(page.getByText('file-2.ts')).toBeVisible()

  await scrollRowToReadingBand(container, 0)

  await expect.element(page.elementLocator(liveRailSvg(container))).toHaveStyle({opacity: '1'})
  expect(Math.abs(segmentTop(container) - rowAnchor(container, 1))).toBeLessThanOrEqual(0.5)
  expect(Math.abs(segmentBottom(container) - rowAnchor(container, 2))).toBeLessThanOrEqual(0.5)

  window.scrollTo(0, 0)
})

it('restores the full rail and re-anchors the live segment when the trace is reopened by click', async () => {
  const container = await mountedThreeRow(() => 1)
  const liveSvg = liveRailSvg(container)

  await page.getByText('Hide trace').click()
  await expect.element(page.elementLocator(liveSvg), {timeout: 2000}).toHaveStyle({opacity: '0'})
  const collapsedD = spinePath(container).getAttribute('d') ?? ''

  await page.getByText('Show trace').click()
  await expect.element(page.getByText('file-2.ts'), {timeout: 2000}).toBeVisible()
  await expect.element(page.elementLocator(spinePath(container)), {timeout: 2000}).not.toHaveAttribute('d', collapsedD)
  await expect.element(page.elementLocator(liveSvg), {timeout: 2000}).toHaveStyle({opacity: '1'})

  const path = spinePath(container)
  const end = path.getPointAtLength(path.getTotalLength())

  expect(armSegments(armsPath(container))).toHaveLength(3)
  expect(Math.abs(end.y - lastRowAnchor(container))).toBeLessThanOrEqual(0.5)
  expect(Math.abs(segmentBottom(container) - rowAnchor(container, 1))).toBeLessThanOrEqual(0.5)
})
