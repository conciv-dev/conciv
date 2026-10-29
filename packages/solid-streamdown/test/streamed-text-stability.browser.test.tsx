import {describe, it, expect} from 'vitest'
import {createSignal} from 'solid-js'
import {render} from '@solidjs/testing-library'
import {page} from 'vitest/browser'
import {Streamdown} from '../src/streamdown.js'

const chunks = [
  'The quick brown',
  'The quick brown fox jum',
  'The quick brown fox jumps over',
  'The quick brown fox jumps over the lazy dog',
]

function renderedNodes(paragraph: Element): Node[] {
  return [
    ...paragraph.childNodes,
    ...[...paragraph.querySelectorAll('[data-sd-word]')].flatMap((span) => [...span.childNodes]),
  ]
}

describe('Streamdown streamed paragraph', () => {
  it('keeps already rendered word spans and text nodes in place as later chunks arrive', async () => {
    const [text, setText] = createSignal(chunks[0] ?? '')
    const {container} = render(() => (
      <Streamdown animated={true} isAnimating={true}>
        {text()}
      </Streamdown>
    ))

    await expect.element(page.getByText('brown')).toBeInTheDocument()
    const paragraph = container.querySelector('p')
    if (!paragraph) throw new Error('expected a paragraph')
    const settledNodes = renderedNodes(paragraph)

    const removed: Node[] = []
    const observer = new MutationObserver((records) => {
      removed.push(...records.flatMap((record) => [...record.removedNodes]))
    })
    observer.observe(paragraph, {childList: true, subtree: true})

    for (const chunk of chunks.slice(1)) setText(chunk)

    await expect.element(page.getByText('dog')).toBeInTheDocument()
    removed.push(...observer.takeRecords().flatMap((record) => [...record.removedNodes]))
    observer.disconnect()

    const currentNodes = new Set(renderedNodes(paragraph))
    expect(settledNodes.filter((node) => !currentNodes.has(node))).toEqual([])
    expect(removed.filter((node) => settledNodes.includes(node))).toEqual([])
  })
})
