import {describe, it, expect} from 'vitest'
import {createSignal} from 'solid-js'
import {render} from '@solidjs/testing-library'
import {Streamdown} from '../src/streamdown.js'

describe('Streamdown structural streaming', () => {
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
