import 'virtual:uno.css'
import '@conciv/ui-kit-system/tokens.css'
import '@conciv/ui-kit-chat/theme/tokens.css'
import {expect, it} from 'vitest'
import {page} from 'vitest/browser'
import type {JSX} from 'solid-js'
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

function headerItem(container: HTMLElement): HTMLElement {
  const trigger = traceRoot(container).querySelector('[data-part="trigger"]')
  const item = trigger?.parentElement
  if (!(item instanceof HTMLElement)) throw new Error('expected the header item')
  return item
}

it('starts the spine at the top of the header row, above the rows list', async () => {
  const container = mountTrace(twoRowTrace())
  await expect.element(page.getByText('bash')).toBeVisible()

  const start = spinePath(container).getPointAtLength(0)
  const rootTop = traceRoot(container).getBoundingClientRect().top
  const expected = headerItem(container).getBoundingClientRect().top - rootTop

  expect(Math.abs(start.y - expected)).toBeLessThanOrEqual(0.01)
})

it('draws nothing at all while the trace is collapsed', async () => {
  const container = mountView(() => <Trace summary="2 tools ran" compactLine="2 tools" items={twoRowTrace()} folded />)
  await expect.element(page.getByText('Show trace')).toBeVisible()

  expect(spinePath(container).getAttribute('d')).toBe('')
  expect(armsPath(container).getAttribute('d')).toBe('')
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
