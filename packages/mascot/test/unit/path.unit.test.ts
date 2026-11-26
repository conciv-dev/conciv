import {describe, expect, test} from 'vitest'
import {detourAround, emitterCurvePoints, measureEmitterRoom, resolveCurveStyle} from '../../src/core/path.js'

describe('the emitter path', () => {
  test.each([
    [
      {x: 200, y: 300},
      {top: 0, left: 0, right: 400},
      {rise: 54, bend: 0},
    ],
    [
      {x: 200, y: 60},
      {top: 0, left: 0, right: 400},
      {rise: 48, bend: 0},
    ],
    [
      {x: 100, y: 32},
      {top: 0, left: 0, right: 400},
      {rise: 20, bend: 47.6},
    ],
    [
      {x: 360, y: 32},
      {top: 0, left: 0, right: 400},
      {rise: 20, bend: -47.6},
    ],
    [
      {x: 200, y: 10},
      {top: 0, left: 0, right: 400},
      {rise: 8, bend: 64.4},
    ],
    [
      {x: 30, y: 32},
      {top: 0, left: 0, right: 60},
      {rise: 20, bend: 18},
    ],
  ])('a tip at %o inside %o gets the room %o', (anchor, bounds, room) => {
    expect(measureEmitterRoom(anchor, bounds)).toEqual(room)
  })

  test.each([
    ['auto', {rise: 54, bend: 0}, 'straight'],
    ['auto', {rise: 20, bend: 47.6}, 'arc'],
    ['hook', {rise: 54, bend: 0}, 'hook'],
  ] as const)('the curve %s in the room %o draws as %s', (style, room, resolved) => {
    expect(resolveCurveStyle(style, room)).toBe(resolved)
  })

  test.each([
    ['arc', {rise: 54, bend: 30}, 0, 2, {x: 60, y: -108}],
    ['hook', {rise: 54, bend: 0}, 0, 1, {x: 0, y: -54}],
    ['fan', {rise: 54, bend: 40}, 0, 1, {x: 22, y: -46.44}],
    ['fan', {rise: 54, bend: 40}, 1, 1, {x: 30.8, y: -54}],
  ] as const)(
    'a %s curve in the room %o for digit %d at scale %d starts at the tip and ends at %o',
    (style, room, index, scale, end) => {
      const points = emitterCurvePoints(style, room, index, scale)
      const first = points.at(0)
      const last = points.at(-1)

      expect(first?.x).toBeCloseTo(0, 3)
      expect(first?.y).toBeCloseTo(0, 3)
      expect(last?.x).toBeCloseTo(end.x, 3)
      expect(last?.y).toBeCloseTo(end.y, 3)
    },
  )

  test.each([
    ['nothing is above the tip', {x: 100, y: 200}, undefined],
    ['the panel is beside the tip', {x: 100, y: 200}, {top: 100, left: 200, right: 300, bottom: 170}],
  ])('no detour when %s', (_case, start, obstacle) => {
    expect(detourAround(start, {top: 0, left: 0, right: 400}, obstacle, {reach: 8, clearance: 10})).toBeUndefined()
  })

  test.each([
    [
      'climbs past the nearer side of a panel above the tip',
      {x: 100, y: 200},
      {top: 100, left: 80, right: 160, bottom: 170},
      {x: -30, y: -128},
    ],
    [
      'runs along under a panel as wide as the page',
      {x: 60, y: 200},
      {top: 100, left: 5, right: 395, bottom: 170},
      {x: 75.6, y: -20},
    ],
    ['runs along under the top of the page', {x: 60, y: 30}, undefined, {x: 75.6, y: -20}],
  ])('the detour %s, never entering it', (_case, start, obstacle, end) => {
    const points = detourAround(start, {top: 0, left: 0, right: 400}, obstacle, {reach: 8, clearance: 10}) ?? []
    const absolute = points.map((point) => ({x: start.x + point.x, y: start.y + point.y}))
    const inside = absolute.filter(
      (point) =>
        obstacle !== undefined &&
        point.x > obstacle.left &&
        point.x < obstacle.right &&
        point.y > obstacle.top &&
        point.y < obstacle.bottom,
    )

    expect(points.at(0)).toEqual({x: 0, y: 0})
    expect(points.at(-1)?.x).toBeCloseTo(end.x, 6)
    expect(points.at(-1)?.y).toBeCloseTo(end.y, 6)
    expect(absolute.every((point) => point.y >= 0)).toBe(true)
    expect(inside).toEqual([])
  })
})
