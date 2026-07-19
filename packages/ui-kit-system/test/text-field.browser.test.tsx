import {render} from 'solid-js/web'
import {afterEach, describe, expect, it} from 'vitest'
import {TextArea} from '../src/text-field.js'

const NEWLINES2 = 'one\ntwo'
const NEWLINES3 = 'one\ntwo\nthree'
const NEWLINES5 = 'one\ntwo\nthree\nfour\nfive'

const disposers: (() => void)[] = []
const hosts: HTMLElement[] = []

function mount(width: string, ui: () => ReturnType<typeof TextArea>): {host: HTMLElement; area: HTMLTextAreaElement} {
  const host = document.createElement('div')
  host.style.width = width
  document.body.appendChild(host)
  hosts.push(host)
  disposers.push(render(ui, host))
  const area = host.querySelector('textarea')
  if (!area) throw new Error('TextArea did not render a textarea')
  area.style.width = '100%'
  return {host, area}
}

const settle = (): Promise<void> =>
  new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))

afterEach(() => {
  for (const dispose of disposers.splice(0)) dispose()
  for (const host of hosts.splice(0)) host.remove()
})

describe('TextArea autosize', () => {
  it('fits a single row on mount and reports the height it set', () => {
    const heights: number[] = []
    const {area} = mount('300px', () => <TextArea value="one" onHeightChange={(h) => heights.push(h)} />)
    expect(area.scrollHeight).toBe(area.clientHeight)
    expect(heights).toEqual([Number.parseFloat(area.style.height)])
  })

  it('grows to fit wrapped content without clipping it', () => {
    const {area} = mount('300px', () => <TextArea value={NEWLINES3} maxRows={5} />)
    expect(area.scrollHeight).toBe(area.clientHeight)
    expect(area.style.overflowY).toBe('hidden')
  })

  it('stops at maxRows and scrolls instead of clipping', () => {
    const short = mount('300px', () => <TextArea value={NEWLINES2} maxRows={2} />)
    const tall = mount('300px', () => <TextArea value={NEWLINES5} maxRows={2} />)
    expect(tall.area.clientHeight).toBe(short.area.clientHeight)
    expect(tall.area.style.overflowY).toBe('auto')
    expect(tall.area.scrollHeight).toBeGreaterThan(tall.area.clientHeight)
  })

  it('never drops below minRows', () => {
    const one = mount('300px', () => <TextArea value="" minRows={1} />)
    const three = mount('300px', () => <TextArea value="" minRows={3} />)
    expect(three.area.clientHeight).toBeGreaterThan(one.area.clientHeight)
    expect(three.area.style.overflowY).toBe('hidden')
  })

  it('refits when its width changes, leaving no dead space', async () => {
    const {host, area} = mount('160px', () => (
      <TextArea value="the quick brown fox jumps over the lazy dog" maxRows={9} />
    ))
    await settle()
    const narrowHeight = area.clientHeight

    host.style.width = '600px'
    await settle()
    expect(area.clientHeight).toBeLessThan(narrowHeight)
    expect(area.scrollHeight).toBe(area.clientHeight)

    host.style.width = '160px'
    await settle()
    expect(area.clientHeight).toBe(narrowHeight)
    expect(area.scrollHeight).toBe(area.clientHeight)
  })

  it('reports a height only when the height actually changes', async () => {
    const heights: number[] = []
    const {host} = mount('600px', () => <TextArea value="one" onHeightChange={(h) => heights.push(h)} />)
    await settle()

    host.style.width = '500px'
    await settle()
    expect(heights).toHaveLength(1)
  })
})
