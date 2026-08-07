import {describe, expect, test} from 'vitest'
import {offsetToPosition, positionToOffset, projectDocument, type LoweringNode} from '../src/lowering.js'

const paragraph = (...content: LoweringNode[]): LoweringNode =>
  content.length ? {type: 'paragraph', content} : {type: 'paragraph'}
const text = (value: string): LoweringNode => ({type: 'text', text: value})
const chip = (char: string, id: string, label: string): LoweringNode => ({
  type: 'mention',
  attrs: {id, label, mentionSuggestionChar: char},
})
const doc = (...blocks: LoweringNode[]): LoweringNode => ({type: 'doc', content: blocks})

describe('offsetToPosition', () => {
  test('empty document maps offset 0 inside the first paragraph', () => {
    expect(offsetToPosition(doc(paragraph()), 0)).toBe(1)
  })

  test('plain text maps one to one', () => {
    const single = doc(paragraph(text('ab')))
    expect(offsetToPosition(single, 0)).toBe(1)
    expect(offsetToPosition(single, 1)).toBe(2)
    expect(offsetToPosition(single, 2)).toBe(3)
  })

  test('newline costs one offset and two positions', () => {
    const two = doc(paragraph(text('a')), paragraph(text('b')))
    expect(offsetToPosition(two, 1)).toBe(2)
    expect(offsetToPosition(two, 2)).toBe(4)
    expect(offsetToPosition(two, 3)).toBe(5)
  })

  test('offsets inside a chip clamp to the chip boundary', () => {
    const withChip = doc(paragraph(text('hi '), chip('/', 'help', '/help'), text(' x')))
    expect(projectDocument(withChip)).toBe('hi /help x')
    expect(offsetToPosition(withChip, 3)).toBe(4)
    expect(offsetToPosition(withChip, 4)).toBe(5)
    expect(offsetToPosition(withChip, 7)).toBe(5)
    expect(offsetToPosition(withChip, 8)).toBe(5)
    expect(offsetToPosition(withChip, 9)).toBe(6)
  })

  test('out of range offsets clamp like a textarea', () => {
    const single = doc(paragraph(text('ab')))
    expect(offsetToPosition(single, -5)).toBe(1)
    expect(offsetToPosition(single, 99)).toBe(3)
  })
})

describe('positionToOffset', () => {
  test('positions map back across paragraphs', () => {
    const two = doc(paragraph(text('a')), paragraph(text('b')))
    expect(positionToOffset(two, 1)).toBe(0)
    expect(positionToOffset(two, 2)).toBe(1)
    expect(positionToOffset(two, 4)).toBe(2)
    expect(positionToOffset(two, 5)).toBe(3)
  })

  test('chip boundaries map to the lowered text edges', () => {
    const withChip = doc(paragraph(text('hi '), chip('/', 'help', '/help'), text(' x')))
    expect(positionToOffset(withChip, 4)).toBe(3)
    expect(positionToOffset(withChip, 5)).toBe(8)
  })

  test('out of range positions clamp to the projection bounds', () => {
    const single = doc(paragraph(text('ab')))
    expect(positionToOffset(single, 0)).toBe(0)
    expect(positionToOffset(single, 99)).toBe(2)
  })
})

describe('round trip', () => {
  test('every offset survives the round trip up to chip clamping', () => {
    const sample = doc(
      paragraph(text('hi '), chip('/', 'help', '/help'), text(' there')),
      paragraph(),
      paragraph(chip('@', 'ai:Opus', 'Opus'), text(' ok')),
    )
    const projection = projectDocument(sample)
    for (let offset = 0; offset <= projection.length; offset += 1) {
      const round = positionToOffset(sample, offsetToPosition(sample, offset))
      const clamped = offsetToPosition(sample, round)
      expect(clamped).toBe(offsetToPosition(sample, offset))
    }
  })
})
