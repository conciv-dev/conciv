import {describe, it, expect} from 'vitest'
import {createSignal} from 'solid-js'
import {render} from '@solidjs/testing-library'
import {page} from 'vitest/browser'
import {Streamdown} from '../src/streamdown.js'
import '../src/styles.css'

const answer = [
  'Streaming answers should read like calm prose rather than a flickering slideshow, so every word that has already',
  'landed on screen must stay exactly where it is while the rest of the reply arrives. The renderer keeps **settled',
  'words fully visible** even as new chunks are appended, and inline spans such as `createStore(nodes)` keep their',
  'own place beside the surrounding sentence without restarting any fade.',
  '\n\nA second paragraph then begins after a blank line, carrying more **bold emphasis** and another `reconcile`',
  'call so the block boundary is exercised too, and it closes with a few plain words to finish the stream.',
].join(' ')

const chunkSizes = [44, 52, 47, 58, 41, 55, 49, 60, 43, 57, 46, 53, 40, 59]

function chunkEnds(text: string): number[] {
  const ends: number[] = []
  let position = 0
  let index = 0
  while (position < text.length) {
    const target = position + (chunkSizes[index % chunkSizes.length] ?? 50)
    const boundary = text.slice(target).search(/\s/)
    position = boundary === -1 || target >= text.length ? text.length : target + boundary
    ends.push(position)
    index += 1
  }
  return ends
}

function trailingWord(prefix: string): RegExp {
  const word = /([A-Za-z0-9]+)[^A-Za-z0-9]*$/.exec(prefix)?.[1] ?? ''
  return new RegExp(`${word}[^A-Za-z0-9]*$`)
}

type SpanState = {animation: Animation | undefined; animated: boolean}

function snapshot(root: Element): Map<Element, SpanState> {
  return new Map(
    [...root.querySelectorAll('span')].map((span) => [
      span,
      {animation: span.getAnimations()[0], animated: span.hasAttribute('data-sd-animate')},
    ]),
  )
}

function textOffset(root: Element, span: Element): number {
  const range = document.createRange()
  range.setStart(root, 0)
  range.setEndBefore(span)
  return range.toString().length
}

describe('Streamdown streamed words', () => {
  it('never remounts or restarts the fade of a word that already rendered', async () => {
    const ends = chunkEnds(answer)
    const first = answer.slice(0, ends[0])
    const [text, setText] = createSignal(first)
    const {container} = render(() => (
      <Streamdown animated={true} isAnimating={true}>
        {text()}
      </Streamdown>
    ))
    const root = container.querySelector('.sd-root')
    if (!root) throw new Error('expected the streamdown root')
    const rootLocator = page.elementLocator(root)
    await expect.element(rootLocator).toMatchTextContent(trailingWord(first))
    expect([...root.querySelectorAll('[data-sd-animate]')].map((span) => span.textContent)).toEqual([])

    for (const end of ends.slice(1)) {
      const before = snapshot(root)
      const previousLength = root.textContent.length
      const next = answer.slice(0, end)
      setText(next)
      await expect.element(rootLocator).toMatchTextContent(trailingWord(next))

      const after = snapshot(root)
      const lost = [...before.keys()].filter((span) => !span.isConnected || !after.has(span))
      expect(lost.map((span) => span.textContent)).toEqual([])

      const restarted = [...before].filter(([span, state]) => span.getAnimations()[0] !== state.animation)
      expect(restarted.map(([span]) => span.textContent)).toEqual([])

      const reflagged = [...before].filter(([span, state]) => span.hasAttribute('data-sd-animate') !== state.animated)
      expect(reflagged.map(([span]) => span.textContent)).toEqual([])

      const fresh = [...after.keys()].filter((span) => !before.has(span))
      const early = fresh.filter(
        (span) => span.hasAttribute('data-sd-animate') && textOffset(root, span) < previousLength,
      )
      expect(early.map((span) => span.textContent)).toEqual([])
      expect(fresh.filter((span) => !span.hasAttribute('data-sd-animate')).map((span) => span.textContent)).toEqual([])
    }

    await expect.element(rootLocator).toMatchTextContent(/finish the stream\.$/)
    expect(root.querySelectorAll('p')).toHaveLength(2)
  })
})
