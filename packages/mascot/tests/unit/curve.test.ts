import {describe, expect, it} from 'vitest'
import {
  curveControlPoints,
  emitterCurvePoints,
  type EmitterPoint,
  type EmitterRoom,
  resolveCurveStyle,
} from '../../src/core/path.js'

const AMPLE: EmitterRoom = {rise: 54, bend: 0}
const LEFT_SQUEEZED: EmitterRoom = {rise: 16, bend: 53.2}
const RIGHT_SQUEEZED: EmitterRoom = {rise: 16, bend: -53.2}
const TIE: EmitterRoom = {rise: 16, bend: 53.2}

const VERTICAL_AMPLE: EmitterPoint[] = [
  {x: 0, y: 0},
  {x: 0, y: -27},
  {x: 0, y: -54},
]

function expectPoints(label: string, actual: EmitterPoint[], expected: EmitterPoint[]): void {
  expect(actual.length, `${label}: point count`).toBe(expected.length)
  expected.forEach((point, index) => {
    expect(actual[index]?.x, `${label}: point ${index} x`).toBeCloseTo(point.x, 9)
    expect(actual[index]?.y, `${label}: point ${index} y`).toBeCloseTo(point.y, 9)
  })
}

const distance = (from: EmitterPoint, to: EmitterPoint): number => Math.hypot(to.x - from.x, to.y - from.y)

const spans = (points: EmitterPoint[]): number[] =>
  points.slice(1).map((point, index) => distance(points[index] ?? point, point))

describe('resolveCurveStyle', () => {
  it('leaves an explicit style alone', () => {
    expect(resolveCurveStyle('arc', AMPLE)).toBe('arc')
    expect(resolveCurveStyle('hook', LEFT_SQUEEZED)).toBe('hook')
    expect(resolveCurveStyle('fan', RIGHT_SQUEEZED)).toBe('fan')
    expect(resolveCurveStyle('straight', LEFT_SQUEEZED)).toBe('straight')
  })
  it('auto rises straight when the room is ample', () => {
    expect(resolveCurveStyle('auto', AMPLE)).toBe('straight')
  })
  it('auto arcs when the room is squeezed on either side', () => {
    expect(resolveCurveStyle('auto', LEFT_SQUEEZED)).toBe('arc')
    expect(resolveCurveStyle('auto', RIGHT_SQUEEZED)).toBe('arc')
  })
})

describe('curveControlPoints', () => {
  it('arc leaves the tip vertically then eases into the open side', () => {
    expectPoints('arc, left-squeezed', curveControlPoints('arc', LEFT_SQUEEZED, 0), [
      {x: 0, y: 0},
      {x: 0, y: -7.2},
      {x: 23.94, y: -14.4},
      {x: 53.2, y: -16},
    ])
  })
  it('arc mirrors onto the left when the right side is squeezed', () => {
    expectPoints('arc, right-squeezed', curveControlPoints('arc', RIGHT_SQUEEZED, 0), [
      {x: 0, y: 0},
      {x: 0, y: -7.2},
      {x: -23.94, y: -14.4},
      {x: -53.2, y: -16},
    ])
  })
  it('a tie in side room bends the arc right, matching the measured bend sign', () => {
    expectPoints('arc, tie', curveControlPoints('arc', TIE, 0), [
      {x: 0, y: 0},
      {x: 0, y: -7.2},
      {x: 23.94, y: -14.4},
      {x: 53.2, y: -16},
    ])
  })
  it('hook climbs the antenna axis, turns the corner, then runs sideways', () => {
    expectPoints('hook, left-squeezed', curveControlPoints('hook', LEFT_SQUEEZED, 0), [
      {x: 0, y: 0},
      {x: 0, y: -11.52},
      {x: 18.088, y: -16},
      {x: 53.2, y: -14.08},
    ])
  })
  it('fan gives each digit its own lane and lift', () => {
    expectPoints('fan, digit 0', curveControlPoints('fan', LEFT_SQUEEZED, 0), [
      {x: 0, y: 0},
      {x: 0, y: -6.192},
      {x: 11.704, y: -11.696},
      {x: 29.26, y: -13.76},
    ])
    expectPoints('fan, digit 1', curveControlPoints('fan', LEFT_SQUEEZED, 1), [
      {x: 0, y: 0},
      {x: 0, y: -7.2},
      {x: 16.3856, y: -13.6},
      {x: 40.964, y: -16},
    ])
    expectPoints('fan, digit 4', curveControlPoints('fan', LEFT_SQUEEZED, 4), [
      {x: 0, y: 0},
      {x: 0, y: -6.192},
      {x: 30.4304, y: -11.696},
      {x: 76.076, y: -13.76},
    ])
  })
  it('every style degenerates to a plain vertical rise when the room needs no bend', () => {
    expectPoints('arc, ample', curveControlPoints('arc', AMPLE, 0), VERTICAL_AMPLE)
    expectPoints('hook, ample', curveControlPoints('hook', AMPLE, 0), VERTICAL_AMPLE)
    expectPoints('fan, ample', curveControlPoints('fan', AMPLE, 3), VERTICAL_AMPLE)
  })
})

describe('emitterCurvePoints', () => {
  it('starts on the tip and ends on the terminal control point', () => {
    const points = emitterCurvePoints('arc', LEFT_SQUEEZED, 0, 1)
    expect(points[0]?.x, 'first sample x').toBeCloseTo(0, 6)
    expect(points[0]?.y, 'first sample y').toBeCloseTo(0, 6)
    expect(points[points.length - 1]?.x, 'last sample x').toBeCloseTo(53.2, 3)
    expect(points[points.length - 1]?.y, 'last sample y').toBeCloseTo(-16, 3)
  })
  it('resamples the curve at even arc length so progress maps to distance', () => {
    const measured = spans(emitterCurvePoints('hook', LEFT_SQUEEZED, 0, 1))
    expect(Math.max(...measured) / Math.min(...measured), 'longest span over shortest span').toBeLessThan(1.05)
  })
  it('multiplies the whole curve by the antenna scale factor', () => {
    const reference = emitterCurvePoints('arc', LEFT_SQUEEZED, 0, 1)
    const tripled = emitterCurvePoints('arc', LEFT_SQUEEZED, 0, 3)
    expect(tripled.length, 'sample count is scale independent').toBe(reference.length)
    reference.forEach((point, index) => {
      expect(tripled[index]?.x, `scaled sample ${index} x`).toBeCloseTo(point.x * 3, 9)
      expect(tripled[index]?.y, `scaled sample ${index} y`).toBeCloseTo(point.y * 3, 9)
    })
  })
})
