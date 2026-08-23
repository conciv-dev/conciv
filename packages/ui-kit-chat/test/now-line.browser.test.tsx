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

it('swaps the narration label for the next activity without moving the spinner', async () => {
  const [title, setTitle] = createSignal('Thinking…')
  mountView(() => framed(<NowLine title={title()} />))

  await expect.element(page.getByText('Thinking…', {exact: true})).toBeVisible()
  setTitle('Running ls')
  await expect.element(page.getByText('Running ls', {exact: true}), {timeout: TIMEOUT_MS}).toBeVisible()
  await page.screenshot({path: '__screenshots__/now-line/label-swap.png'})
  await expect.element(page.getByText('Thinking…', {exact: true}), {timeout: TIMEOUT_MS}).not.toBeVisible()
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
