import {describe, expect, it} from 'vitest'
import {hashAt, scanElements} from '../src/anchor/oxc-capture.js'

const source = [
  'function Card() {',
  '  return (',
  '    <div class="card">',
  '      <button aria-label="Save">Save</button>',
  '    </div>',
  '  )',
  '}',
  '',
].join('\n')

describe('scanElements', () => {
  it('fingerprints every JSX element with tag + component + a non-empty hash', () => {
    const elements = scanElements(source)
    const tags = elements.map((element) => element.tag)
    expect(tags).toContain('div')
    expect(tags).toContain('button')
    expect(elements.every((element) => element.component === 'Card')).toBe(true)
    expect(elements.every((element) => element.hash.length > 0)).toBe(true)
  })

  it('gives nested and outer elements different ancestor salts', () => {
    const elements = scanElements(source)
    const div = elements.find((element) => element.tag === 'div')
    const button = elements.find((element) => element.tag === 'button')
    expect(div?.salt).not.toBe(button?.salt)
  })
})

describe('hashAt', () => {
  it('matches the structural hash scanElements computed for the same element', () => {
    const button = scanElements(source).find((element) => element.tag === 'button')
    if (!button) throw new Error('button fingerprint missing')
    const at = hashAt(source, button.line, button.column)
    expect(at.hash).toBe(button.hash)
    expect(at.component).toBe('Card')
    expect(at.snippet).toContain('Save')
  })

  it('keeps the structural hash stable when the element only moves position', () => {
    const moved = `\n// shifted down by two lines\n${source}`
    const original = scanElements(source).find((element) => element.tag === 'button')
    const shifted = scanElements(moved).find((element) => element.tag === 'button')
    if (!original || !shifted) throw new Error('button fingerprint missing')
    expect(shifted.hash).toBe(original.hash)
    expect(shifted.line).not.toBe(original.line)
  })
})
