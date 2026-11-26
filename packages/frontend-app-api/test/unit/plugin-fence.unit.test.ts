import {describe, expect, it} from 'vitest'
import {fenceSelector} from '../../src/lib/plugin-fence'

describe('a plugin selector is fenced to the plugin area', () => {
  const area = ':where([data-conciv-plugin="recorder"],[data-conciv-plugin="recorder"] *)'

  it.each([
    ['a plain class', '.hidden', `.hidden${area}`],
    ['a selector list', '.a, .b > .c', `.a${area}, .b > .c${area}`],
    ['a pseudo-element', '.x:hover::before', `.x:hover${area}::before`],
    ['a legacy pseudo-element', '*, :before', `*${area}, ${area}:before`],
    ['a dark variant', '.dark .dark\\:bg-red', `.dark .dark\\:bg-red${area}`],
    ['an escaped class', '.leading-\\[var\\(--a\\)\\]', `.leading-\\[var\\(--a\\)\\]${area}`],
  ])('%s', (_name, selector, fenced) => {
    expect(fenceSelector(selector, 'recorder')).toBe(fenced)
  })

  it('quotes a plugin id that holds a quote', () => {
    expect(fenceSelector('.a', 'a"b')).toBe('.a:where([data-conciv-plugin="a\\"b"],[data-conciv-plugin="a\\"b"] *)')
  })
})
