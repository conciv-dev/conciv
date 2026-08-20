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
    render: (branch) => <TraceToolRow projection={projection} last={branch.last} ring={branch.ring} body={body} />,
  }
}

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

function headerConnectorRect(container: HTMLElement): DOMRect {
  const span = container.querySelector('span[aria-hidden="true"]')
  if (!(span instanceof HTMLElement)) throw new Error('expected the header connector span')
  return span.getBoundingClientRect()
}

function railSvg(container: HTMLElement): SVGSVGElement {
  const svg = container.querySelector('ul + svg')
  if (!(svg instanceof SVGSVGElement)) throw new Error('expected the rail svg')
  return svg
}

function spinePath(container: HTMLElement): SVGPathElement {
  const path = railSvg(container).querySelectorAll('path')[0]
  if (!(path instanceof SVGPathElement)) throw new Error('expected the rail spine path')
  return path
}

function rowsList(container: HTMLElement): HTMLUListElement {
  const ul = container.querySelector('ul')
  if (!(ul instanceof HTMLUListElement)) throw new Error('expected the rows list')
  return ul
}

function liveRailSvg(container: HTMLElement): SVGSVGElement {
  const svgs = container.querySelectorAll('ul ~ svg')
  const svg = svgs[1]
  if (!(svg instanceof SVGSVGElement)) throw new Error('expected the live rail svg')
  return svg
}

function railDot(container: HTMLElement): HTMLElement {
  const dot = container.querySelector('ul ~ span')
  if (!(dot instanceof HTMLElement)) throw new Error('expected the rail dot')
  return dot
}

function dotTranslateY(dot: HTMLElement): number {
  return new DOMMatrixReadOnly(getComputedStyle(dot).transform).m42
}

function anchorOf(ul: HTMLUListElement, index: number): number {
  const li = ul.querySelectorAll(':scope > li')[index]
  if (!(li instanceof HTMLElement)) throw new Error(`expected row ${index}`)
  const ulRect = ul.getBoundingClientRect()
  const gutter = Number.parseFloat(getComputedStyle(ul).getPropertyValue('--chat-trace-gutter'))
  return li.getBoundingClientRect().top - ulRect.top + gutter / 2
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
      <TraceToolRow
        projection={{mark: 'pass', label: 'read', target, meta: '1 line'}}
        last={branch.last}
        ring={branch.ring}
      />
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
        <TraceToolRow
          projection={{mark: 'run', label: 'bash', target: 'pnpm build'}}
          last={branch.last}
          ring={branch.ring}
        />
      ),
    },
  ]
}

function threeRowLiveTrace(liveIndex: () => number): TraceItem[] {
  return [0, 1, 2].map((index) => liveToolItem(`row-${index}`, `file-${index}.ts`, () => liveIndex() === index))
}

it('centers the rail spine start under the header connector within 0.51px', async () => {
  const container = mountTrace(twoRowTrace())
  await expect.element(page.getByText('bash')).toBeVisible()

  const path = spinePath(container)
  const svg = railSvg(container)
  const svgRect = svg.getBoundingClientRect()
  const start = path.getPointAtLength(0)
  const spineStartX = svgRect.left + start.x

  const headerRect = headerConnectorRect(container)
  const headerCenterX = headerRect.left + headerRect.width / 2

  expect(Math.abs(spineStartX - headerCenterX)).toBeLessThanOrEqual(0.51)
})

it('ends the spine at the gutter edge, aligned to the last row anchor', async () => {
  const container = mountTrace(twoRowTrace())
  await expect.element(page.getByText('bash')).toBeVisible()

  const ul = rowsList(container)
  const path = spinePath(container)
  const ulRect = ul.getBoundingClientRect()
  const lastLi = ul.querySelectorAll(':scope > li')[ul.querySelectorAll(':scope > li').length - 1]
  if (!(lastLi instanceof HTMLElement)) throw new Error('expected a last row')
  const gutter = Number.parseFloat(getComputedStyle(ul).getPropertyValue('--chat-trace-gutter'))
  const expectedY = lastLi.getBoundingClientRect().top - ulRect.top + gutter / 2

  const end = path.getPointAtLength(path.getTotalLength())

  expect(Math.abs(end.x - gutter)).toBeLessThanOrEqual(0.01)
  expect(Math.abs(end.y - expectedY)).toBeLessThanOrEqual(0.5)
})

it('spans the spine from the ul top down to the last row anchor', async () => {
  const container = mountTrace(twoRowTrace())
  await expect.element(page.getByText('bash')).toBeVisible()

  const path = spinePath(container)
  const start = path.getPointAtLength(0)

  expect(Math.abs(start.y)).toBeLessThanOrEqual(0.01)
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

it('anchors the live accent under a live row that is not last and shows it', async () => {
  const container = mountView(() => (
    <Trace summary="3 tools ran" compactLine="3 tools" items={threeRowLiveTrace(() => 1)} defaultOpen />
  ))
  await expect.element(page.getByText('file-1.ts')).toBeVisible()

  const ul = rowsList(container)
  const liveSvg = liveRailSvg(container)

  expect(getComputedStyle(liveSvg).opacity).toBe('1')
  expect(Math.abs(railBottomOf(liveSvg) - anchorOf(ul, 1))).toBeLessThanOrEqual(0.5)
})

it('fades the live accent out and settles it at the last row once nothing is live', async () => {
  const [liveIndex, setLiveIndex] = createSignal(1)
  const container = mountView(() => (
    <Trace summary="3 tools ran" compactLine="3 tools" items={threeRowLiveTrace(liveIndex)} defaultOpen />
  ))
  await expect.element(page.getByText('file-1.ts')).toBeVisible()

  const ul = rowsList(container)
  const liveSvg = liveRailSvg(container)
  const settled = waitForTransitionEnd(liveSvg, 'opacity')
  setLiveIndex(-1)
  await settled

  expect(getComputedStyle(liveSvg).opacity).toBe('0')
  expect(Math.abs(railBottomOf(liveSvg) - anchorOf(ul, 2))).toBeLessThanOrEqual(0.5)
})

it('starts the live accent hidden with no flash when nothing is live at mount', () => {
  const container = mountView(() => (
    <Trace summary="3 tools ran" compactLine="3 tools" items={threeRowLiveTrace(() => -1)} defaultOpen />
  ))

  const liveSvg = liveRailSvg(container)

  expect(getComputedStyle(liveSvg).opacity).toBe('0')
})

it('rides the travelling dot on the live row anchor and shows it', async () => {
  const container = mountView(() => (
    <Trace summary="3 tools ran" compactLine="3 tools" items={threeRowLiveTrace(() => 1)} defaultOpen />
  ))
  await expect.element(page.getByText('file-1.ts')).toBeVisible()

  const ul = rowsList(container)
  const dot = railDot(container)

  expect(getComputedStyle(dot).opacity).toBe('1')
  expect(Math.abs(dotTranslateY(dot) - anchorOf(ul, 1))).toBeLessThanOrEqual(1)
})

it('keeps the travelling dot hidden when nothing is live', () => {
  const container = mountView(() => (
    <Trace summary="3 tools ran" compactLine="3 tools" items={threeRowLiveTrace(() => -1)} defaultOpen />
  ))

  expect(getComputedStyle(railDot(container)).opacity).toBe('0')
})

it('mirrors the travelling dot onto the mirrored spine under rtl', async () => {
  const container = mountView(() => (
    <Trace summary="3 tools ran" compactLine="3 tools" items={threeRowLiveTrace(() => 1)} defaultOpen />
  ))
  await expect.element(page.getByText('file-1.ts')).toBeVisible()

  const scope = rowsList(container).parentElement
  if (!(scope instanceof HTMLElement)) throw new Error('expected the rail scope')
  scope.setAttribute('dir', 'rtl')

  const svgRect = railSvg(container).getBoundingClientRect()
  const ulRect = rowsList(container).getBoundingClientRect()
  const mirroredSpineX = svgRect.left + (svgRect.width - spinePath(container).getPointAtLength(0).x)

  const dotRect = railDot(container).getBoundingClientRect()
  const dotCenterX = dotRect.left + dotRect.width / 2

  expect(Math.abs(svgRect.right - ulRect.right)).toBeLessThanOrEqual(0.51)
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
  await expect.element(page.getByText('file-1.ts')).toBeVisible()

  const dot = railDot(container)
  const scope = rowsList(container).parentElement
  if (!(scope instanceof HTMLElement)) throw new Error('expected the rail scope')
  const settled = Promise.all([waitForTransitionEnd(dot, 'opacity'), waitForTransitionEnd(dot, 'transform')])
  setLiveIndex(-1)
  await settled

  expect(getComputedStyle(dot).opacity).toBe('0')
  expect(scope.getAnimations({subtree: true})).toEqual([])
})
