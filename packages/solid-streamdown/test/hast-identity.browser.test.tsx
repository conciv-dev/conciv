import {describe, it, expect} from 'vitest'
import {createRoot, createSignal} from 'solid-js'
import {render} from '@solidjs/testing-library'
import {createHast, Streamdown, type HastBuildProps, type HastLikeNode} from '../src/streamdown.js'
import {createAnimatePlugin} from '../src/animate.js'

function assertDefined<T>(value: T | undefined, message: string): T {
  if (value === undefined) throw new Error(message)
  return value
}

function firstChild(node: HastLikeNode, message: string): HastLikeNode {
  return assertDefined(node.children[0], message)
}

describe('createHast', () => {
  it('keeps node identity stable for the unchanged prefix as streaming text grows, with animation on', () => {
    createRoot((dispose) => {
      const plugin = createAnimatePlugin()
      const [pipelineProps, setPipelineProps] = createSignal<HastBuildProps>({
        text: 'Hello world foo bar baz',
        animate: true,
        plugin,
        allowRawHtml: false,
        linkPrefixes: ['*'],
        imagePrefixes: ['*'],
      })

      const hast = createHast(pipelineProps)
      const firstParagraph = firstChild(hast, 'expected a paragraph')
      const firstWordSpan = firstChild(firstParagraph, 'expected a word span')
      const firstWordText = firstChild(firstWordSpan, 'expected word text')

      setPipelineProps((current) => ({...current, text: 'Hello world foo bar baz qux'}))

      const secondParagraph = firstChild(hast, 'expected a paragraph')
      const secondWordSpan = firstChild(secondParagraph, 'expected a word span')
      const secondWordText = firstChild(secondWordSpan, 'expected word text')

      expect(secondParagraph).toBe(firstParagraph)
      expect(secondWordSpan).toBe(firstWordSpan)
      expect(secondWordText).toBe(firstWordText)

      dispose()
    })
  })

  it('appends a new child node for newly streamed content without disturbing earlier siblings', () => {
    createRoot((dispose) => {
      const plugin = createAnimatePlugin()
      const [pipelineProps, setPipelineProps] = createSignal<HastBuildProps>({
        text: 'one two three',
        animate: true,
        plugin,
        allowRawHtml: false,
        linkPrefixes: ['*'],
        imagePrefixes: ['*'],
      })

      const hast = createHast(pipelineProps)
      const paragraph = firstChild(hast, 'expected a paragraph')
      const lengthBefore = paragraph.children.length
      const firstSpan = firstChild(paragraph, 'expected a word span')

      setPipelineProps((current) => ({...current, text: 'one two three four'}))

      const lengthAfter = paragraph.children.length
      expect(lengthAfter).toBeGreaterThan(lengthBefore)
      expect(firstChild(paragraph, 'expected a word span')).toBe(firstSpan)

      dispose()
    })
  })

  it('never rewrites a rendered span style once assigned, even once later content passes it', () => {
    createRoot((dispose) => {
      const plugin = createAnimatePlugin()
      const [pipelineProps, setPipelineProps] = createSignal<HastBuildProps>({
        text: 'one two three',
        animate: true,
        plugin,
        allowRawHtml: false,
        linkPrefixes: ['*'],
        imagePrefixes: ['*'],
      })

      const hast = createHast(pipelineProps)
      const paragraph = firstChild(hast, 'expected a paragraph')
      const lastSpan = assertDefined(paragraph.children.at(-1), 'expected a last word span')
      const styleWhenNew = lastSpan.properties.style

      for (const nextText of ['one two three four', 'one two three four five', 'one two three four five six']) {
        setPipelineProps((current) => ({...current, text: nextText}))
        expect(lastSpan.properties.style).toBe(styleWhenNew)
      }

      dispose()
    })
  })

  it('does not crash while structure-changing markdown streams in character by character', async () => {
    const full =
      'The quick brown fox jumps over the lazy dog and then some **bold text** appears with a [link](https://example.com) and `inline code` too, plus more words to pad the paragraph out nicely so there is a real settled prefix before the formatting constructs complete.'
    const [text, setText] = createSignal('')

    const {container} = render(() => (
      <Streamdown animated={true} isAnimating={true}>
        {text()}
      </Streamdown>
    ))

    for (let i = 1; i <= full.length; i++) {
      setText(full.slice(0, i))
      await new Promise((resolve) => setTimeout(resolve, 0))
    }

    expect(container.textContent).toContain('bold text')
  })

  it('does not crash while paragraphs, lists, and a blockquote merge and split character by character', async () => {
    const full =
      'First paragraph builds up some words here.\n\nSecond paragraph starts after a blank line gap.\n\n- one\n- two\n- three\n\n1. alpha\n2. beta\n\n> a blockquote line\n\nFinal **bold** closing paragraph with a [link](https://example.com) too.'
    const [text, setText] = createSignal('')

    const {container} = render(() => (
      <Streamdown animated={true} isAnimating={true}>
        {text()}
      </Streamdown>
    ))

    for (let i = 1; i <= full.length; i++) {
      setText(full.slice(0, i))
      await new Promise((resolve) => setTimeout(resolve, 0))
    }

    expect(container.textContent).toContain('Final')
  })
})
