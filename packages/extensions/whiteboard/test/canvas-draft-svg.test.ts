import {expect, test} from 'vitest'
import {draftToSvg} from '../src/tool/canvas/draft-svg.js'

test('serializes rectangle, ellipse, line points and text', () => {
  const {svg} = draftToSvg([
    {
      type: 'rectangle',
      x: 10,
      y: 10,
      width: 40,
      height: 20,
      strokeColor: '#111',
      backgroundColor: '#eee',
      strokeWidth: 2,
    },
    {type: 'ellipse', x: 60, y: 10, width: 30, height: 30, strokeColor: '#222', backgroundColor: 'transparent'},
    {
      type: 'line',
      x: 5,
      y: 5,
      points: [
        [0, 0],
        [10, 10],
        [20, 0],
      ],
      strokeColor: '#333',
    },
    {type: 'text', x: 12, y: 40, text: 'hi', fontSize: 16, strokeColor: '#444'},
  ])
  expect(svg).toContain('<svg')
  expect(svg).toContain("<rect x='10' y='10' width='40' height='20'")
  expect(svg).toContain("<ellipse cx='75' cy='25'")
  expect(svg).toContain("<polyline points='5,5 15,15 25,5'")
  expect(svg).toContain('>hi</text>')
})

test('freedraw serializes like line', () => {
  const {svg} = draftToSvg([
    {
      type: 'freedraw',
      x: 0,
      y: 0,
      points: [
        [0, 0],
        [5, 5],
      ],
      strokeColor: '#000',
    },
  ])
  expect(svg).toContain("<polyline points='0,0 5,5'")
})

test('empty draft yields an empty svg canvas with base size', () => {
  const {svg, width, height} = draftToSvg([])
  expect(svg).toContain('<svg')
  expect(width).toBe(440)
  expect(height).toBe(340)
})

test('escapes text with markup characters', () => {
  const {svg} = draftToSvg([{type: 'text', x: 0, y: 20, text: "a<b>&'c", fontSize: 16}])
  expect(svg).toContain('a&lt;b&gt;&amp;&apos;c')
  expect(svg).not.toContain('a<b>')
})

test('a huge point count does not overflow the stack', () => {
  const points = Array.from({length: 50_000}, (_value, index) => [index, index % 100])
  const {svg, width, height} = draftToSvg([{type: 'line', x: 0, y: 0, points, strokeColor: '#000'}])
  expect(svg).toContain('<polyline')
  expect(Number.isFinite(width)).toBe(true)
  expect(Number.isFinite(height)).toBe(true)
})
