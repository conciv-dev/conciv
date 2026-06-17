import {describe, it, expect} from 'vitest'
import {z} from 'zod'
import {parseInput, resultText, stripReadLineNumbers, toolGlyph} from '../src/util.js'
import {callPart, resultPart} from '../src/fixtures.js'

const Schema = z.object({command: z.string()})

describe('parseInput', () => {
  it('returns typed data for valid input', () => {
    const out = parseInput(Schema, callPart({input: {command: 'ls'}}))
    expect(out?.command).toBe('ls')
  })

  it('returns undefined for partial/invalid input (streaming)', () => {
    expect(parseInput(Schema, callPart({input: undefined}))).toBeUndefined()
    expect(parseInput(Schema, callPart({input: {command: 5}}))).toBeUndefined()
  })
})

describe('resultText', () => {
  it('reads string content and stringifies array content', () => {
    expect(resultText(resultPart('hi'))).toBe('hi')
    expect(resultText(undefined)).toBe('')
  })
})

describe('stripReadLineNumbers', () => {
  // claude Read's real format is "<lineno>\t<content>" (TAB), verified against claude 2.x — NOT an
  // arrow. Leaving the numbers in leaks them into the highlighted code as a second gutter column.
  it('strips the real <lineno>\\t prefix (single + multi-digit, padded)', () => {
    expect(stripReadLineNumbers('1\tline one\n2\tline two\n3\t')).toBe('line one\nline two\n')
    expect(stripReadLineNumbers('  7\tconst x = 1\n 17\treturn x')).toBe('const x = 1\nreturn x')
  })
  it('leaves real source lines untouched', () => {
    expect(stripReadLineNumbers('no prefix here')).toBe('no prefix here')
    expect(stripReadLineNumbers('')).toBe('')
  })
})

describe('toolGlyph', () => {
  it('error wins, then done on output/result, else spin', () => {
    expect(toolGlyph(callPart(), resultPart('x', {state: 'error'}))).toBe('error')
    expect(toolGlyph(callPart(), resultPart('x', {state: 'complete'}))).toBe('done')
    expect(toolGlyph(callPart({output: {ok: true}}), undefined)).toBe('done')
    expect(toolGlyph(callPart({state: 'input-streaming', input: undefined}), undefined)).toBe('spin')
  })
})
