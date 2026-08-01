import {afterEach, describe, expect, it} from 'vitest'
import {elementSnippet, groundGrabText} from '../src/react-grab/grab-text.js'

const hosts: HTMLElement[] = []

afterEach(() => {
  for (const host of hosts.splice(0)) host.remove()
})

function mount(html: string): HTMLElement {
  const host = document.createElement('div')
  host.innerHTML = html
  document.body.appendChild(host)
  hosts.push(host)
  const first = host.firstElementChild
  if (!(first instanceof HTMLElement)) throw new Error('fixture did not render an element')
  return first
}

describe('elementSnippet', () => {
  it('writes the opening tag with salient attributes and the trimmed text', () => {
    const button = mount('<button id="try-cta" class="btn primary">  Try it live: connect your agent\n</button>')
    expect(elementSnippet(button)).toBe(
      '<button id="try-cta" class="btn primary">Try it live: connect your agent</button>',
    )
  })

  it('keeps role and aria-label and drops every other attribute', () => {
    const el = mount('<div role="dialog" aria-label="Connect" data-conciv-source="src/a.tsx:1:2" title="x">Hi</div>')
    expect(elementSnippet(el)).toBe('<div role="dialog" aria-label="Connect">Hi</div>')
  })

  it('omits the closing tag for a void element and for an empty one', () => {
    expect(elementSnippet(mount('<input id="email" />'))).toBe('<input id="email">')
    expect(elementSnippet(mount('<div class="spacer"></div>'))).toBe('<div class="spacer">')
  })

  it('truncates long text to eighty characters', () => {
    const long = 'x'.repeat(200)
    const snippet = elementSnippet(mount(`<p>${long}</p>`))
    expect(snippet).toBe(`<p>${'x'.repeat(80)}…</p>`)
  })
})

describe('groundGrabText', () => {
  it('composes snippet plus the full data-conciv-source path', () => {
    const button = mount(
      '<button id="try-cta" data-conciv-source="src/components/landing/hero.tsx:42:5">Try it live: connect your agent</button>',
    )
    const grounded = groundGrabText(button, 'minified-fallback')
    expect(grounded.source).toEqual({file: 'src/components/landing/hero.tsx', line: 42, column: 5})
    expect(grounded.text).toBe(
      '<button id="try-cta">Try it live: connect your agent</button> at src/components/landing/hero.tsx:42:5',
    )
  })

  it('reads the attribute off the nearest annotated ancestor', () => {
    const wrapper = mount('<section data-conciv-source="src/page.tsx:7:1"><span>Deep</span></section>')
    const span = wrapper.querySelector('span')
    if (!span) throw new Error('fixture span missing')
    expect(groundGrabText(span, 'fallback').text).toBe('<span>Deep</span> at src/page.tsx:7:1')
  })

  it('passes the react-grab text through untouched when no attribute resolves', () => {
    const el = mount('<div class="unannotated">Nothing</div>')
    const grounded = groundGrabText(el, '<Kx> in chunk-QWERTY.js')
    expect(grounded.source).toBeNull()
    expect(grounded.text).toBe('<Kx> in chunk-QWERTY.js')
  })
})
