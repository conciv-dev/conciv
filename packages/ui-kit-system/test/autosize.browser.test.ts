import {afterEach, describe, expect, it} from 'vitest'
import {fitHeight, measureTextArea} from '../src/autosize.js'

const containers: HTMLElement[] = []

function mount(css: string, value: string): HTMLTextAreaElement {
  const host = document.createElement('div')
  host.style.width = '300px'
  document.body.appendChild(host)
  containers.push(host)
  const area = document.createElement('textarea')
  area.style.cssText = `box-sizing:border-box;width:100%;resize:none;${css}`
  area.value = value
  host.appendChild(area)
  return area
}

afterEach(() => {
  for (const host of containers.splice(0)) host.remove()
})

describe('fitHeight', () => {
  const metrics = {rowHeight: 20, padding: 16, border: 2, borderBox: true}

  it('clamps to minRows when the content is shorter', () => {
    expect(fitHeight(20, metrics, 2, 5)).toEqual({height: 58, overflowY: 'hidden'})
  })

  it('grows with the content between the bounds', () => {
    expect(fitHeight(76, metrics, 1, 5)).toEqual({height: 78, overflowY: 'hidden'})
  })

  it('clamps to maxRows and scrolls once the content exceeds it', () => {
    expect(fitHeight(200, metrics, 1, 5)).toEqual({height: 118, overflowY: 'auto'})
  })

  it('subtracts padding instead of adding border under content-box', () => {
    const contentBox = {...metrics, borderBox: false}
    expect(fitHeight(76, contentBox, 1, 5)).toEqual({height: 60, overflowY: 'hidden'})
  })
})

describe('measureTextArea', () => {
  it('reports the padding, border and box model of the element', () => {
    const area = mount('padding:8px 12px;border:1px solid black;font:13px/20px monospace', '')
    const metrics = measureTextArea(area)
    expect(metrics).toMatchObject({padding: 16, border: 2, borderBox: true, rowHeight: 20})
  })

  it('measures a real row when line-height is normal', () => {
    const area = mount('padding:0;border:0;font:13px monospace;line-height:normal', '')
    const reference = mount('padding:0;border:0;font:13px monospace;line-height:normal', 'x')
    reference.rows = 1
    reference.style.height = 'auto'
    expect(measureTextArea(area).rowHeight).toBeCloseTo(reference.scrollHeight, 0)
    expect(measureTextArea(area).rowHeight).not.toBe(20)
  })
})

describe('TextArea sizing end to end', () => {
  it('never clips its content and honours maxRows with line-height normal', () => {
    const css = 'padding:8px 12px;border:1px solid black;font:13px monospace;line-height:normal'
    const area = mount(css, 'one\ntwo\nthree\nfour\nfive\nsix')
    const metrics = measureTextArea(area)
    const {height, overflowY} = fitHeight(area.scrollHeight, metrics, 1, 2)
    area.style.height = `${height}px`
    area.style.overflowY = overflowY

    const twoRows = mount(css, 'one\ntwo')
    twoRows.style.height = 'auto'
    const {height: twoRowHeight} = fitHeight(twoRows.scrollHeight, measureTextArea(twoRows), 1, 2)

    expect(height).toBeCloseTo(twoRowHeight, 0)
    expect(overflowY).toBe('auto')
  })

  it('fits exactly, leaving no dead space, when the content is under maxRows', () => {
    const area = mount('padding:8px 12px;border:1px solid black;font:13px/20px monospace', 'one\ntwo\nthree')
    const {height} = fitHeight(area.scrollHeight, measureTextArea(area), 1, 5)
    area.style.height = `${height}px`
    expect(area.scrollHeight).toBe(area.clientHeight)
  })
})
