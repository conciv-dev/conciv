import {describe, it, expect} from 'vitest'
import type {Root} from 'hast'
import {parseMarkdownIntoBlocks} from '../src/parse-blocks.js'
import {createAnimatePlugin} from '../src/animate.js'

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

function paragraph(text: string): Root {
  return {
    type: 'root',
    children: [{type: 'element', tagName: 'p', properties: {}, children: [{type: 'text', value: text}]}],
  }
}
function runPlugin(plugin: ReturnType<typeof createAnimatePlugin>, tree: Root): Root {
  const transform = (plugin.rehypePlugin as () => (t: Root) => void)()
  transform(tree)
  return tree
}
function textAndSpans(tree: Root): Array<{value: string; animated: boolean; duration?: string}> {
  const p = tree.children[0]
  if (p?.type !== 'element') return []
  const parts: Array<{value: string; animated: boolean; duration?: string}> = []
  for (const c of p.children) {
    if (c.type === 'text') {
      parts.push({value: c.value, animated: false})
      continue
    }
    if (c.type !== 'element' || !c.properties?.['data-sd-animate']) continue
    const text = c.children[0]
    const style = String(c.properties.style ?? '')
    const duration = /--sd-duration:([^;]+)/.exec(style)?.[1]
    parts.push({value: text?.type === 'text' ? text.value : '', animated: true, duration})
  }
  return parts
}
function spans(tree: Root): Array<{value: string; animated: boolean; duration?: string}> {
  return textAndSpans(tree).filter((c) => c.animated)
}

describe('createAnimatePlugin', () => {
  it('wraps each word of a text node in a fade span', () => {
    const plugin = createAnimatePlugin()
    const out = runPlugin(plugin, paragraph('hello world'))
    expect(spans(out).map((s) => s.value)).toEqual(['hello', 'world'])
  })

  it('counts rendered characters for the next-render diff', () => {
    const plugin = createAnimatePlugin()
    runPlugin(plugin, paragraph('hello world'))
    expect(plugin.getLastRenderCharCount()).toBe('hello world'.length)
  })

  it('sets duration=0ms for already-shown chars and animates new chars', () => {
    const plugin = createAnimatePlugin()
    plugin.setPrevContentLength('hello '.length)
    const out = runPlugin(plugin, paragraph('hello world'))
    expect(textAndSpans(out)).toEqual([
      {value: 'hello', animated: true, duration: '0ms'},
      {value: ' ', animated: false},
      {value: 'world', animated: true, duration: '150ms'},
    ])
  })
})
