import {describe, it, expect} from 'vitest'
import {parseMarkdownIntoBlocks} from '../src/parse-blocks.js'

describe('parseMarkdownIntoBlocks', () => {
  it('splits top-level blocks (paragraph, heading, code) into separate strings', () => {
    const content = parseMarkdownIntoBlocks('# Title\n\nA paragraph.\n\n```ts\nconst x = 1\n```\n').filter((b) =>
      b.trim(),
    )
    expect(content).toHaveLength(3)
    expect(content[0]).toContain('# Title')
    expect(content[1]).toBe('A paragraph.')
    expect(content[2]).toContain('```ts')
  })

  it('keeps a footnoted document as one block (refs + defs must stay in one tree)', () => {
    const blocks = parseMarkdownIntoBlocks('Text with a note.[^1]\n\n[^1]: the note\n')
    expect(blocks).toHaveLength(1)
  })

  it('merges an unclosed math block with its continuation', () => {
    const blocks = parseMarkdownIntoBlocks('$$\nx = 1\n$$\n\nafter\n')
    expect(blocks.some((b) => b.includes('$$') && b.includes('x = 1'))).toBe(true)
  })

  it('only the last block changes as text grows (the streaming invariant)', () => {
    const a = parseMarkdownIntoBlocks('# Title\n\nfirst para\n\nsecond pa')
    const b = parseMarkdownIntoBlocks('# Title\n\nfirst para\n\nsecond para done')

    expect(b.slice(0, -1)).toEqual(a.slice(0, -1))
    expect(b.at(-1)).not.toBe(a.at(-1))
  })
})
