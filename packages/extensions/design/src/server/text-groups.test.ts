import {describe, expect, it} from 'vitest'
import type {Box, LiveComponent, Raster, TextRun} from '../shared/types.js'
import {ciede2000} from './comparators/ciede2000.js'
import {trimToInk} from './comparators/paddle.js'
import {glyphCoreColor} from './deltas/colors.js'
import {groupText} from './text-groups.js'

const WHITE = [255, 255, 255] as const
const BLACK = [0, 0, 0] as const
const RED = [220, 30, 30] as const

type Ink = {box: Box; rgb: readonly [number, number, number]; phase?: number}

function painted(input: {inks: Ink[]}): Raster {
  const width = 200
  const height = 100
  const data = new Uint8Array(width * height * 4)
  Array.from({length: width * height}, (_, index) => index).forEach((index) => {
    const x = index % width
    const y = (index - x) / width
    const ink = input.inks.find(
      ({box, phase}) =>
        (x + 8 - (phase ?? 0)) % 8 < 3 && x >= box.x && x < box.x + box.w && y >= box.y && y < box.y + box.h,
    )
    data.set([...(ink?.rgb ?? WHITE), 255], index * 4)
  })
  return {width, height, data}
}

function component(input: {glyphs: {text: string; boxes: Box[]}[]; x?: number}): LiveComponent {
  return {
    source: {file: 'src/App.tsx', line: 1, column: input.x ?? 1},
    tag: 'span',
    text: '',
    box: {x: 0, y: 0, w: 200, h: 100},
    textBox: null,
    glyphs: input.glyphs,
    axis: null,
    styles: {background: '#ffffff', color: '#000000', fontSize: 16, lineHeight: 20, fontWeight: 400, radius: 0},
    index: 1,
    children: [],
  }
}

function inkInside(box: Box): Box {
  return {x: box.x + 2, y: box.y + 4, w: box.w - 4, h: box.h - 8}
}

function grouped(input: {components: LiveComponent[]; runs: TextRun[]; targetInks?: Ink[]; liveInks?: Ink[]}) {
  const liveBoxes = input.components.flatMap((c) => c.glyphs.flatMap((glyph) => glyph.boxes))
  const live = painted({inks: input.liveInks ?? liveBoxes.map((box) => ({box: inkInside(box), rgb: BLACK}))})
  const inked = input.runs.map((run) => ({...run, box: inkInside(run.box)}))
  const target = painted({inks: input.targetInks ?? inked.map((run) => ({box: run.box, rgb: BLACK}))})
  const runs = inked.map((run) => ({...run, box: trimToInk({raster: target, box: run.box})}))
  return groupText({components: input.components, runs, live, target, color: ciede2000})
}

describe('groupText', () => {
  it('returns nothing when the target has no runs', () => {
    const first = component({glyphs: [{text: 'Export', boxes: [{x: 10, y: 10, w: 60, h: 20}]}]})
    expect(grouped({components: [first], runs: []})).toEqual({groups: [], agreeing: []})
  })

  it('joins two lines of one node in reading order', () => {
    const line1 = {x: 10, y: 10, w: 60, h: 20}
    const line2 = {x: 10, y: 40, w: 60, h: 20}
    const wrapped = component({glyphs: [{text: 'Hello World', boxes: [line1, line2]}]})
    const runs = [
      {text: 'World', box: line2},
      {text: 'Hello', box: line1},
    ]
    const {groups} = grouped({components: [wrapped], runs})
    expect(groups).toHaveLength(1)
    expect(groups[0]).toMatchObject({liveText: 'Hello World', targetText: 'Hello World', agrees: true})
  })

  it('joins one node read as two OCR boxes', () => {
    const search = component({glyphs: [{text: 'Search invoices', boxes: [{x: 10, y: 10, w: 140, h: 20}]}]})
    const runs = [
      {text: 'invoices', box: {x: 80, y: 10, w: 70, h: 20}},
      {text: 'Search', box: {x: 10, y: 10, w: 64, h: 20}},
    ]
    const {groups, agreeing} = grouped({components: [search], runs})
    expect(groups.map((group) => [group.targetText, group.agrees])).toEqual([['Search invoices', true]])
    expect(agreeing).toHaveLength(3)
  })

  it('joins two nodes read as one OCR box and gives the group to the first', () => {
    const exportButton = component({glyphs: [{text: 'Export', boxes: [{x: 10, y: 10, w: 60, h: 20}]}], x: 1})
    const createButton = component({glyphs: [{text: 'Create', boxes: [{x: 80, y: 10, w: 60, h: 20}]}], x: 2})
    const runs = [{text: 'Export Create', box: {x: 10, y: 10, w: 130, h: 20}}]
    const {groups} = grouped({components: [createButton, exportButton], runs})
    expect(groups).toHaveLength(1)
    expect(groups[0]?.owner).toBe(exportButton)
    expect(groups[0]).toMatchObject({liveText: 'Export Create', agrees: true})
  })

  it('forms no group from text that only one side has', () => {
    const lonely = component({glyphs: [{text: 'Draft', boxes: [{x: 10, y: 10, w: 60, h: 20}]}]})
    const runs = [{text: 'Total', box: {x: 10, y: 60, w: 60, h: 20}}]
    expect(grouped({components: [lonely], runs})).toEqual({groups: [], agreeing: []})
  })

  it('ignores whitespace and case', () => {
    const label = component({glyphs: [{text: ' Sign  in ', boxes: [{x: 10, y: 10, w: 60, h: 20}]}]})
    const runs = [{text: 'SIGN IN', box: {x: 10, y: 10, w: 60, h: 20}}]
    expect(grouped({components: [label], runs}).groups[0]?.agrees).toBe(true)
  })

  it('trims a wide live box to its ink before comparing the place', () => {
    const word = {x: 20, y: 15, w: 60, h: 20}
    const field = component({glyphs: [{text: 'Search', boxes: [{x: 5, y: 5, w: 190, h: 40}]}]})
    const runs = [{text: 'Search', box: word}]
    const liveInks = [{box: inkInside(word), rgb: BLACK}]
    expect(grouped({components: [field], runs, liveInks}).groups[0]?.agrees).toBe(true)
  })

  it('disagrees on a different string', () => {
    const label = component({glyphs: [{text: 'Export', boxes: [{x: 10, y: 10, w: 60, h: 20}]}]})
    const runs = [{text: 'Expert', box: {x: 10, y: 10, w: 60, h: 20}}]
    const {groups, agreeing} = grouped({components: [label], runs})
    expect(groups[0]).toMatchObject({liveText: 'Export', targetText: 'Expert', agrees: false})
    expect(agreeing).toEqual([])
  })

  it('disagrees on a different ink color', () => {
    const box = {x: 10, y: 10, w: 60, h: 20}
    const label = component({glyphs: [{text: 'Export', boxes: [box]}]})
    const runs = [{text: 'Export', box}]
    const {groups} = grouped({components: [label], runs, targetInks: [{box: inkInside(box), rgb: RED}]})
    expect(groups[0]?.agrees).toBe(false)
  })

  it('disagrees on ink moved further than the geometry tolerance', () => {
    const label = component({glyphs: [{text: 'Export', boxes: [{x: 10, y: 10, w: 60, h: 20}]}]})
    const moved = {x: 14, y: 10, w: 60, h: 20}
    const runs = [{text: 'Export', box: moved}]
    const targetInks = [{box: inkInside(moved), rgb: BLACK, phase: 4}]
    expect(grouped({components: [label], runs, targetInks}).groups[0]?.agrees).toBe(false)
  })
})

function withInk(input: {ink: Box | null}): Raster {
  const width = 40
  const height = 20
  const data = new Uint8Array(width * height * 4)
  Array.from({length: width * height}, (_, index) => index).forEach((index) => {
    const x = index % width
    const y = (index - x) / width
    const {ink} = input
    const inside = ink !== null && x >= ink.x && x < ink.x + ink.w && y >= ink.y && y < ink.y + ink.h
    data.set(inside ? [0, 0, 0, 255] : [255, 255, 255, 255], index * 4)
  })
  return {width, height, data}
}

describe('trimToInk', () => {
  it('shrinks a box to the ink inside it', () => {
    const raster = withInk({ink: {x: 12, y: 5, w: 8, h: 4}})
    expect(trimToInk({raster, box: {x: 10, y: 3, w: 20, h: 10}})).toEqual({x: 12, y: 5, w: 8, h: 4})
  })

  it('keeps a box with no ink', () => {
    const box = {x: 10, y: 3, w: 20, h: 10}
    expect(trimToInk({raster: withInk({ink: null}), box})).toEqual(box)
  })

  it('keeps a box under two pixels on a side', () => {
    const box = {x: 12, y: 5, w: 1, h: 10}
    expect(trimToInk({raster: withInk({ink: {x: 12, y: 5, w: 8, h: 4}}), box})).toEqual(box)
  })
})

describe('glyphCoreColor', () => {
  it('finds no ink on a flat tile', () => {
    const box = {x: 0, y: 0, w: 16, h: 16}
    const raster = {width: 16, height: 16, data: new Uint8Array(16 * 16 * 4).fill(200)}
    expect(glyphCoreColor({raster, box, glyphs: [box], background: '#c8c8c8', color: ciede2000})).toBeNull()
  })
})
