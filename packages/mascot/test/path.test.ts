import {describe, expect, it} from 'vitest'
import {measureEmitterRoom} from '../src/core/path.js'

describe('measureEmitterRoom', () => {
  it('full rise, no bend, ample headroom', () => {
    expect(measureEmitterRoom({x: 130, y: 100}, {top: 0, left: 0, right: 260})).toEqual({rise: 54, bend: 0})
  })
  it('squeezed top-left bends right by 1.4x the shortfall', () => {
    expect(measureEmitterRoom({x: 30, y: 28}, {top: 0, left: 0, right: 260})).toEqual({rise: 16, bend: 53.2})
  })
  it('squeezed top-right bends left', () => {
    expect(measureEmitterRoom({x: 230, y: 28}, {top: 0, left: 0, right: 260})).toEqual({rise: 16, bend: -53.2})
  })
  it('trivial squeeze stays straight', () => {
    expect(measureEmitterRoom({x: 130, y: 58}, {top: 0, left: 0, right: 260})).toEqual({rise: 46, bend: 0})
  })
})
