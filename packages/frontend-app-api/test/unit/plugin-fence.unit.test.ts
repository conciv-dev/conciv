import {describe, expect, it} from 'vitest'
import {fenceSelector} from '../../src/lib/plugin-fence'

describe('a plugin selector is fenced to the plugin area', () => {
  const area = ':where([data-conciv-plugin="recorder"],[data-conciv-plugin="recorder"] *)'
  const quoted = ':where([data-conciv-plugin="a\\"b"],[data-conciv-plugin="a\\"b"] *)'

  it.each([
    ['a plain class', 'recorder', '.hidden', `.hidden${area}`],
    ['a selector list', 'recorder', '.a, .b > .c', `.a${area}, .b > .c${area}`],
    ['a pseudo-element', 'recorder', '.x:hover::before', `.x:hover${area}::before`],
    ['a legacy pseudo-element', 'recorder', '*, :before', `*${area}, ${area}:before`],
    ['a dark variant', 'recorder', '.dark .dark\\:bg-red', `.dark .dark\\:bg-red${area}`],
    ['an escaped class', 'recorder', '.leading-\\[var\\(--a\\)\\]', `.leading-\\[var\\(--a\\)\\]${area}`],
    ['a plugin id that holds a quote', 'a"b', '.a', `.a${quoted}`],
  ])('%s', (_name, plugin, selector, fenced) => {
    expect(fenceSelector(selector, plugin)).toBe(fenced)
  })
})
