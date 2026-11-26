import {describe, expect, it} from 'vitest'
import {parseMarkdownIntoBlocks} from '../../src/parse-blocks.js'

describe('splitting a streaming reply into blocks', () => {
  it.each([
    ['two paragraphs', 'one\n\ntwo', ['one', '\n\n', 'two']],
    [
      'an HTML element across blank lines',
      '<div>\n\nfirst\n\nsecond\n\n</div>\n\nafter',
      ['<div>\n\nfirst\n\nsecond\n\n</div>', '\n\n', 'after'],
    ],
    [
      'a $$ math block across a blank line',
      'Before\n\n$$\nx = 1\n\ny = 2\n$$\n\nAfter',
      ['Before', '\n\n', '$$\nx = 1\n\ny = 2\n$$', '\n\n', 'After'],
    ],
    [
      'a footnoted reply',
      'See this[^1].\n\nMore text.\n\n[^1]: The note.',
      ['See this[^1].\n\nMore text.\n\n[^1]: The note.'],
    ],
  ])('splits %s', (_case, markdown, blocks) => {
    expect(parseMarkdownIntoBlocks(markdown)).toEqual(blocks)
  })
})
