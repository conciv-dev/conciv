import {describe, expect, test} from 'vitest'
import {buildDocument, projectDocument, type LoweringNode} from '../src/lowering.js'

const paragraph = (...content: LoweringNode[]): LoweringNode =>
  content.length ? {type: 'paragraph', content} : {type: 'paragraph'}
const text = (value: string): LoweringNode => ({type: 'text', text: value})
const chip = (char: string, id: string, label: string): LoweringNode => ({
  type: 'mention',
  attrs: {id, label, mentionSuggestionChar: char},
})
const doc = (...blocks: LoweringNode[]): LoweringNode => ({type: 'doc', content: blocks})

describe('buildDocument', () => {
  test('markup characters survive verbatim, never HTML-parsed', () => {
    expect(buildDocument('<div>&amp;</div>')).toEqual(doc(paragraph(text('<div>&amp;</div>'))))
  })
})

describe('projectDocument', () => {
  test('chips lower to sigil plus item id, never label', () => {
    expect(projectDocument(doc(paragraph(text('hi '), chip('@', 'ai:Opus', 'Opus'))))).toBe('hi @ai:Opus')
  })

  test('slash chips lower to sigil plus id even when the label already carries the sigil', () => {
    expect(projectDocument(doc(paragraph(chip('/', 'help', '/help'), text(' now'))))).toBe('/help now')
  })

  test('adjacent chips lower back to back', () => {
    expect(projectDocument(doc(paragraph(chip('/', 'a', '/a'), chip('@', 'b', 'b'))))).toBe('/a@b')
  })
})

describe('idempotence', () => {
  const adversarial = [
    '',
    '\n',
    'a\n\nb',
    '\n\nleading blank lines',
    'trailing spaces   ',
    '  leading spaces',
    'tab\tseparated\tcells',
    '**markdown** _stays_ `verbatim`',
    '<script>alert("x")</script>',
    '/help not a chip @user not a chip',
    'line one\nline two\nline three\n',
    'emoji 🎉 and combining é',
    ':type[label]{payload="x"}',
  ]

  test.each(adversarial)('project(build(%j)) === input', (input) => {
    expect(projectDocument(buildDocument(input))).toBe(input)
  })
})
