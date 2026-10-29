import 'virtual:uno.css'
import {createSignal} from 'solid-js'
import {expect, it} from 'vitest'
import {page} from 'vitest/browser'
import {Markdown} from '../src/styled/markdown.js'
import {mountView} from './mount-view.js'

function fence(lines: Array<string>): string {
  return ['```typescript', ...lines, '```'].join('\n')
}

function textNodeOf(host: HTMLElement, text: string): Text {
  const walker = document.createTreeWalker(host, NodeFilter.SHOW_TEXT)
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (node instanceof Text && node.data.trim() === text) return node
  }
  throw new Error(`expected a text node for ${text}`)
}

it('keeps a selection inside a highlighted fence while the fence keeps streaming', async () => {
  const marker = `selected${Math.random().toString(36).slice(2)}`
  const laterMarker = `arrived${Math.random().toString(36).slice(2)}`
  const lineOne = `const ${marker} = 1`
  const [content, setContent] = createSignal(fence([lineOne]))
  const host = mountView(() => <Markdown content={content()} streaming />)

  await expect.element(page.getByText(marker, {exact: true})).toBeVisible()
  const selected = textNodeOf(host, marker)
  document.getSelection()?.setBaseAndExtent(selected, 0, selected, selected.length)
  const selectedText = document.getSelection()?.toString()

  setContent(fence([lineOne, `const ${laterMarker} = 2`]))

  await expect.element(page.getByText(laterMarker, {exact: true})).toBeVisible()
  expect(selectedText).toContain(marker)
  expect(document.getSelection()?.toString()).toBe(selectedText)
})
