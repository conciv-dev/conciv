import {afterEach, describe, expect, it} from 'vitest'
import {captureElement} from '../src/react-grab/capture-element.js'

afterEach(() => {
  document.body.innerHTML = ''
  document.head.querySelectorAll('style[data-test-capture]').forEach((node) => node.remove())
})

function mountStyled(): HTMLElement {
  const style = document.createElement('style')
  style.setAttribute('data-test-capture', '')
  style.textContent = '.badge::before{content:"★";color:rgb(255, 0, 0)}'
  document.head.appendChild(style)
  const host = document.createElement('div')
  host.innerHTML = `
    <section id="card" class="badge" style="position:fixed;margin:24px;color:rgb(0, 128, 0)">
      <span id="label" style="font-weight:700">tagged</span>
    </section>
  `
  document.body.appendChild(host)
  const section = host.querySelector('section')
  if (!section) throw new Error('fixture missing')
  return section instanceof HTMLElement ? section : host
}

function rebuild(html: string): HTMLElement {
  const host = document.createElement('div')
  host.innerHTML = html
  return host
}

describe('captureElement', () => {
  it('captures the clone as markup carrying the inlined styles', async () => {
    const el = mountStyled()
    const preview = await captureElement(el)
    expect(preview.width).toBeGreaterThan(0)
    expect(preview.html.startsWith('<div')).toBe(true)
    expect(preview.html).toContain('tagged')
    const rebuilt = rebuild(preview.html)
    const clone = rebuilt.querySelector('section')
    expect(clone).not.toBeNull()
    expect(clone instanceof HTMLElement ? clone.style.color : '').toBe('rgb(0, 128, 0)')
    const child = rebuilt.querySelector('span')
    expect(child instanceof HTMLElement ? child.style.fontWeight : '').toBe('700')
  })

  it('captures pseudo-element rules into a scoped stylesheet', async () => {
    const el = mountStyled()
    const preview = await captureElement(el)
    const rebuilt = rebuild(preview.html)
    const sheet = rebuilt.querySelector('style')?.textContent ?? ''
    expect(sheet).toContain('::before')
    expect(sheet).toContain('content:"★"')
    const clone = rebuilt.querySelector('section')
    expect([...(clone?.classList ?? [])].some((cls) => cls.startsWith('pw-grab-pseudo-'))).toBe(true)
  })

  it('strips ids and neutralizes the root layout', async () => {
    const el = mountStyled()
    const preview = await captureElement(el)
    const rebuilt = rebuild(preview.html)
    expect(rebuilt.querySelector('[id]')).toBeNull()
    const clone = rebuilt.querySelector('section')
    expect(clone instanceof HTMLElement ? clone.style.position : '').toBe('static')
    expect(clone instanceof HTMLElement ? clone.style.margin : '').toBe('0px')
  })
})
