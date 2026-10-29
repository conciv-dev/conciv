import 'virtual:uno.css'
import {createSignal} from 'solid-js'
import {expect, it} from 'vitest'
import {page} from 'vitest/browser'
import {Markdown} from '../src/styled/markdown.js'
import {mountView} from './mount-view.js'

function openFence(lines: Array<string>): string {
  return ['```typescript', ...lines].join('\n')
}

function tokenSpan(host: HTMLElement, text: string): HTMLElement {
  const found = [...host.querySelectorAll('pre span')].find(
    (span): span is HTMLElement => span instanceof HTMLElement && span.textContent.trim() === text,
  )
  if (!found) throw new Error(`expected a token span for ${text}`)
  return found
}

function watchRemovals(target: Node): () => Node[] {
  const removed: Node[] = []
  const observer = new MutationObserver((records) => {
    removed.push(...records.flatMap((record) => [...record.removedNodes]))
  })
  observer.observe(target, {childList: true, subtree: true})
  return () => {
    removed.push(...observer.takeRecords().flatMap((record) => [...record.removedNodes]))
    observer.disconnect()
    return removed
  }
}

it('keeps highlighted tokens mounted while a streamed fence extends its unfinished last line', async () => {
  const suffix = Math.random().toString(36).slice(2)
  const primer = `primed${suffix}`
  mountView(() => <Markdown content={['```typescript', `const ${primer} = 0`, '```'].join('\n')} />)
  await expect.element(page.getByText(primer, {exact: true})).toBeVisible()

  const settled = `settled${suffix}`
  const growing = `growing${suffix}`
  const [content, setContent] = createSignal(openFence([`const ${settled} = 1`, `const ${growing.slice(0, 4)}`]))
  const host = mountView(() => <Markdown content={content()} streaming />)
  await expect.element(page.getByText(settled, {exact: true})).toBeVisible()
  const settledToken = tokenSpan(host, settled)
  const removals = watchRemovals(host)

  setContent(openFence([`const ${settled} = 1`, `const ${growing}`]))

  await expect.element(page.getByText(growing, {exact: true})).toBeVisible()
  expect(removals().filter((node) => node.contains(settledToken))).toEqual([])
  expect(settledToken.isConnected).toBe(true)
})
