import {describe, it, expect} from 'vitest'
import {createSignal} from 'solid-js'
import {render} from '@solidjs/testing-library'
import {page} from 'vitest/browser'
import {Streamdown} from '../src/streamdown.js'
import '../src/styles.css'

const reply = 'No matches: the symbol is unused and safe to delete.'

describe('Streamdown settled reply', () => {
  it('drops word spans once streaming stops, even without a final text change', async () => {
    const [streaming, setStreaming] = createSignal(true)
    render(() => (
      <Streamdown animated={true} isAnimating={streaming()}>
        {reply}
      </Streamdown>
    ))
    const paragraph = page.getByRole('paragraph')
    await expect.element(paragraph).toContainHTML('data-sd-word')

    setStreaming(false)

    await expect.element(paragraph).not.toContainHTML('data-sd-word')
    const nodes = [...paragraph.element().childNodes]
    expect(nodes.map((node) => [node.nodeType, node.textContent])).toEqual([[Node.TEXT_NODE, reply]])
  })
})
