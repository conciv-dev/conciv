import {describe, expect, test} from 'vitest'
import {cappedValue, RESULT_CAP_CHARS} from '../../src/lib/result-cap.js'

describe('cappedValue', () => {
  test('returns the fallback object instead of a value containing a bigint', () => {
    const value = {amount: 10n}
    const result = cappedValue(value, 'bigint case')
    expect(result).not.toBe(value)
    expect(result).toMatchObject({error: 'value could not be serialized'})
  })

  test('returns the fallback object instead of a circular value', () => {
    const value: Record<string, unknown> = {name: 'loop'}
    value.self = value
    const result = cappedValue(value, 'circular case')
    expect(result).not.toBe(value)
    expect(result).toMatchObject({error: 'value could not be serialized'})
  })

  test('caps a normal oversized value with the truncation payload', () => {
    const value = {text: 'x'.repeat(RESULT_CAP_CHARS + 1)}
    const result = cappedValue(value, 'oversized case')
    expect(result).toMatchObject({truncated: true})
  })

  test('passes a normal small value through unchanged', () => {
    const value = {ok: true}
    const result = cappedValue(value, 'small case')
    expect(result).toBe(value)
  })
})
