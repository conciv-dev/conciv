import {describe, it, expect} from 'vitest'
import {z} from 'zod'
import {parseInput, resultText, toolGlyph} from '../src/util.js'
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

describe('toolGlyph', () => {
  it('error wins, then done on output/result, else spin', () => {
    expect(toolGlyph(callPart(), resultPart('x', {state: 'error'}))).toBe('error')
    expect(toolGlyph(callPart(), resultPart('x', {state: 'complete'}))).toBe('done')
    expect(toolGlyph(callPart({output: {ok: true}}), undefined)).toBe('done')
    expect(toolGlyph(callPart({state: 'input-streaming', input: undefined}), undefined)).toBe('spin')
  })
})
