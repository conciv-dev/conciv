import 'virtual:uno.css'
import {render} from '@solidjs/testing-library'
import {page} from 'vitest/browser'
import {expect, it, onTestFinished} from 'vitest'
import {TruncatedText} from '../src/truncated-text.js'

const LONG = 'I accept the terms and conditions. Required. Validation runs on submit and again on blur.'
const SHORT = 'Submit'

const ROW = 'flex min-w-0 max-w-40'
const TEXT = 'flex-1 min-w-0'

function mount(): Element {
  const {container, unmount} = render(() => (
    <ul class="m-0 p-0 list-none flex flex-row gap-2">
      <li class={ROW} aria-label="clipped row">
        <TruncatedText class={TEXT} text={LONG} />
      </li>
      <li class={ROW} aria-label="fitting row">
        <TruncatedText class={TEXT} text={SHORT} />
      </li>
    </ul>
  ))
  onTestFinished(unmount)
  return container
}

const clippedRow = () => page.getByRole('listitem', {name: 'clipped row'})
const fittingRow = () => page.getByRole('listitem', {name: 'fitting row'})

function spanReading(host: Element, text: string): HTMLElement {
  for (const node of host.querySelectorAll('[data-scope="tooltip"][data-part="trigger"]')) {
    if (node instanceof HTMLElement && node.textContent === text) return node
  }
  throw new Error(`no truncating span reads "${text}"`)
}

it('reveals the whole string in a tooltip when the text is clipped', async () => {
  mount()

  await clippedRow().hover()

  const tooltip = page.getByRole('tooltip')
  await expect.element(tooltip).toBeVisible()
  await expect.element(tooltip).toHaveTextContent(LONG)
})

it('grows no tooltip for text that fits its box', async () => {
  mount()

  await clippedRow().hover()
  await expect.element(page.getByRole('tooltip')).toHaveTextContent(LONG)

  await fittingRow().hover()

  await expect.element(page.getByRole('tooltip')).not.toBeInTheDocument()
})

it('keeps the clipped string whole for assistive technology', async () => {
  const host = mount()

  expect(spanReading(host, LONG).textContent).toBe(LONG)
})

it('adds no tab stop to the rows it sits in', async () => {
  const host = mount()

  expect(spanReading(host, LONG).hasAttribute('tabindex')).toBe(false)
})

it('leaves no dangling description on a span that never reveals anything', async () => {
  const host = mount()

  await clippedRow().hover()
  await expect.element(page.getByRole('tooltip')).toHaveTextContent(LONG)

  await fittingRow().hover()
  await expect.element(page.getByRole('tooltip')).not.toBeInTheDocument()

  expect(spanReading(host, SHORT).hasAttribute('aria-describedby')).toBe(false)
})
