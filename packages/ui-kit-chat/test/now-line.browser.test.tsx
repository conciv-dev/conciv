import 'virtual:uno.css'
import '@conciv/ui-kit-system/tokens.css'
import '@conciv/ui-kit-chat/theme/tokens.css'
import {createSignal, type JSX} from 'solid-js'
import {expect, it} from 'vitest'
import {page, userEvent} from 'vitest/browser'
import {NowLine} from '../src/styled/now-line.js'
import {mountView} from './mount-view.js'

const TIMEOUT_MS = 3000

const FRAME = 'dark p-3 w-[26rem] [background:var(--chat-bg)] [font-family:var(--chat-font)]'

function framed(child: JSX.Element): JSX.Element {
  return <div class={FRAME}>{child}</div>
}

function withReducedMotion(): () => void {
  const original = window.matchMedia
  const reduced = original('(prefers-reduced-motion: reduce)')
  Object.defineProperty(reduced, 'matches', {value: true})
  window.matchMedia = (query: string) => (query === '(prefers-reduced-motion: reduce)' ? reduced : original(query))
  return () => {
    window.matchMedia = original
  }
}

it('narrates on one quiet mono line led by a visible braille spinner glyph', async () => {
  mountView(() => framed(<NowLine title="Running pnpm test" />))

  await expect.element(page.getByText('Running pnpm test', {exact: true})).toBeVisible()
  await page.screenshot({path: '__screenshots__/now-line/quiet-narration-line.png'})
  await expect.element(page.getByText('⠋', {exact: true}), {timeout: TIMEOUT_MS}).toBeVisible()
})

it('cycles the braille spinner glyph while the run is live', async () => {
  mountView(() => framed(<NowLine title="Reading widget-shell.tsx" />))

  await expect.element(page.getByText('⠋', {exact: true}), {timeout: TIMEOUT_MS}).toBeVisible()
  await expect.element(page.getByText('⠙', {exact: true}), {timeout: TIMEOUT_MS}).toBeVisible()
})

it('freezes the spinner glyph visible under prefers-reduced-motion instead of hiding it', async () => {
  const restore = withReducedMotion()
  mountView(() => framed(<NowLine title="Reading widget-shell.tsx" />))

  await expect.element(page.getByText('⠿', {exact: true}), {timeout: TIMEOUT_MS}).toBeVisible()
  restore()
})

const FIRST_ACTIVITY = 'Thinking…'
const NEXT_ACTIVITY = 'Running ls'

it('swaps the narration label and unmounts the outgoing one once its exit finishes', async () => {
  const [title, setTitle] = createSignal(FIRST_ACTIVITY)
  mountView(() => framed(<NowLine title={title()} />))

  await expect.element(page.getByText(FIRST_ACTIVITY, {exact: true})).toBeVisible()
  setTitle(NEXT_ACTIVITY)
  await expect.element(page.getByText(NEXT_ACTIVITY, {exact: true}), {timeout: TIMEOUT_MS}).toBeVisible()
  await page.screenshot({path: '__screenshots__/now-line/label-swap.png'})
  await expect.element(page.getByText(FIRST_ACTIVITY, {exact: true}), {timeout: TIMEOUT_MS}).not.toBeInTheDocument()
})

it('swaps with a single label and no exit animation under prefers-reduced-motion', async () => {
  const restore = withReducedMotion()
  const [title, setTitle] = createSignal(FIRST_ACTIVITY)
  mountView(() => framed(<NowLine title={title()} />))

  await expect.element(page.getByText(FIRST_ACTIVITY, {exact: true})).toBeVisible()
  setTitle(NEXT_ACTIVITY)
  await expect.element(page.getByText(NEXT_ACTIVITY, {exact: true}), {timeout: TIMEOUT_MS}).toBeVisible()
  await expect.element(page.getByText(FIRST_ACTIVITY, {exact: true})).not.toBeInTheDocument()
  restore()
})

const CHURN_START = 'Thinking…'
const CHURN_STEPS = ['Reading app.tsx', 'Running tsc', 'Reading now-line.tsx', 'Running oxlint', 'Responding…']
const CHURN_SETTLED = 'Responding…'

it('cuts to the latest narration under rapid churn and settles on exactly one label', async () => {
  const [title, setTitle] = createSignal(CHURN_START)
  mountView(() => framed(<NowLine title={title()} />))

  await expect.element(page.getByText(CHURN_START, {exact: true})).toBeVisible()
  for (const step of CHURN_STEPS) {
    setTitle(step)
    await expect.element(page.getByText(step, {exact: true}), {timeout: TIMEOUT_MS}).toBeVisible()
  }

  await expect.element(page.getByText(CHURN_SETTLED, {exact: true})).toBeVisible()
  await page.screenshot({path: '__screenshots__/now-line/churn-settled.png'})
  for (const stale of [CHURN_START, ...CHURN_STEPS.slice(0, -1)]) {
    await expect.element(page.getByText(stale, {exact: true}), {timeout: TIMEOUT_MS}).not.toBeInTheDocument()
  }
})

const LONG_TITLE = 'Running pnpm turbo run test --filter=@conciv/ui-kit-chat --filter=@conciv/app --concurrency=1'

it('keeps the spinner and the Stop affordance on one line when the narration overflows a narrow panel', async () => {
  mountView(() => (
    <div class="dark p-3 w-[15rem] [background:var(--chat-bg)] [font-family:var(--chat-font)]">
      <NowLine title={LONG_TITLE} onStop={() => {}} />
    </div>
  ))

  await expect.element(page.getByText(LONG_TITLE, {exact: true})).toBeVisible()
  await expect.element(page.getByRole('button', {name: 'Stop generating'})).toBeVisible()
  await expect.element(page.getByText('⠋', {exact: true}), {timeout: TIMEOUT_MS}).toBeVisible()
  await page.screenshot({path: '__screenshots__/now-line/narrow-overflow.png'})
})

it('offers a mono text Stop affordance that matches the composer controls', async () => {
  const stopped: string[] = []
  mountView(() => framed(<NowLine title="Running pnpm test" onStop={() => stopped.push('stop')} />))

  const stop = page.getByRole('button', {name: 'Stop generating'})
  await expect.element(stop).toBeVisible()
  await expect.element(stop).toHaveTextContent('Stop')
  await page.screenshot({path: '__screenshots__/now-line/with-stop.png'})

  await userEvent.click(stop)
  await expect.element(page.getByText('Running pnpm test', {exact: true})).toBeVisible()
  expect(stopped).toEqual(['stop'])
})
