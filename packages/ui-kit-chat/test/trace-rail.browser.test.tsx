import 'virtual:uno.css'
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
