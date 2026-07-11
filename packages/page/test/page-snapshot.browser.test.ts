import {afterEach, describe, expect, it} from 'vitest'
import {buildSnapshot, describeElement, type Refs, type SnapNode} from '../src/page-snapshot.js'

const makeRefs = (): Refs => ({map: new Map(), n: 0})

function mount(html: string): HTMLElement {
  const host = document.createElement('div')
  host.innerHTML = html
  document.body.appendChild(host)
  return host
}

afterEach(() => {
  document.body.innerHTML = ''
})

const byRole = (nodes: SnapNode[], role: string): SnapNode | undefined => nodes.find((node) => node.role === role)

describe('buildSnapshot', () => {
  it('derives roles from tags, input types, and explicit role attributes', () => {
    const host = mount(`
      <a href="#">docs</a>
      <button>go</button>
      <select><option>x</option></select>
      <textarea></textarea>
      <nav></nav>
      <h2>title</h2>
      <input type="checkbox" />
      <input type="radio" />
      <input type="submit" />
      <input type="email" />
      <div role="tablist"></div>
    `)
    const nodes = buildSnapshot(host, makeRefs())
    const roles = nodes.map((node) => node.role)
    for (const expected of [
      'link',
      'button',
      'combobox',
      'textbox',
      'navigation',
      'heading',
      'checkbox',
      'radio',
      'tablist',
    ]) {
      expect(roles).toContain(expected)
    }
    expect(roles.filter((role) => role === 'button')).toHaveLength(2)
  })

  it('prefers aria-label, then the input label, then trimmed text for names', () => {
    const host = mount(`
      <button aria-label="  Close panel  ">×</button>
      <label for="fld">Email address</label><input id="fld" type="email" />
      <a href="#">  spaced
        out   text  </a>
    `)
    const nodes = buildSnapshot(host, makeRefs())
    expect(byRole(nodes, 'button')?.name).toBe('Close panel')
    expect(nodes.find((node) => node.role === 'textbox')?.name).toBe('Email address')
    expect(byRole(nodes, 'link')?.name).toBe('spaced out text')
  })

  it('truncates long text names at 80 characters', () => {
    const host = mount(`<button>${'y'.repeat(200)}</button>`)
    const nodes = buildSnapshot(host, makeRefs())
    expect(byRole(nodes, 'button')?.name).toHaveLength(80)
  })

  it('reports checked, disabled, and hidden state', () => {
    const host = mount(`
      <input type="checkbox" checked />
      <button disabled>d</button>
      <a href="#" style="display:none">gone</a>
      <input type="radio" />
    `)
    const nodes = buildSnapshot(host, makeRefs())
    expect(byRole(nodes, 'checkbox')?.state).toEqual(['checked'])
    expect(byRole(nodes, 'button')?.state).toEqual(['disabled'])
    expect(byRole(nodes, 'link')?.state).toEqual(['hidden'])
    expect(byRole(nodes, 'radio')?.state).toBeUndefined()
  })

  it('carries form control values and skips uninteresting elements', () => {
    const host = mount(`
      <div><p>prose</p></div>
      <input type="text" value="typed" />
      <textarea>drafted</textarea>
    `)
    const nodes = buildSnapshot(host, makeRefs())
    expect(nodes.map((node) => node.role).toSorted()).toEqual(['textbox', 'textbox'])
    expect(nodes.map((node) => node.value).toSorted()).toEqual(['drafted', 'typed'])
  })

  it('mints sequential live refs that dereference to the elements', () => {
    const refs = makeRefs()
    const host = mount('<button>a</button><a href="#">b</a>')
    const nodes = buildSnapshot(host, refs)
    expect(nodes.map((node) => node.ref)).toEqual(['v1', 'v2'])
    expect(refs.map.get('v1')?.deref()?.tagName).toBe('BUTTON')
    expect(refs.map.get('v2')?.deref()?.tagName).toBe('A')
  })
})

describe('describeElement', () => {
  it('reports tag, id, className, rect, and curated computed style', () => {
    const host = mount('<button id="go" class="primary big" style="color: rgb(1, 2, 3)">go</button>')
    const el = host.querySelector('button')
    expect(el).not.toBeNull()
    const described = el ? describeElement(el) : {}
    expect(described.tagName).toBe('button')
    expect(described.id).toBe('go')
    expect(described.className).toBe('primary big')
    expect(described.rect).toMatchObject({x: expect.any(Number), w: expect.any(Number)})
    expect(described.computedStyle).toMatchObject({display: expect.any(String)})
  })
})
