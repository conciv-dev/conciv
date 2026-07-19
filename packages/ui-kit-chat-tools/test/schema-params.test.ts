import {expect, test} from 'vitest'
import {schemaParams} from '../src/primitives/tools/schema-params.js'

test('renders required then optional params with types', () => {
  const schema = {
    type: 'object',
    properties: {seconds: {type: 'number'}, keyframes: {type: 'number'}, label: {type: 'string'}},
    required: ['seconds'],
  }
  expect(schemaParams(schema)).toBe('seconds: number · keyframes?: number · label?: string')
})

test('empty or foreign input renders empty string', () => {
  expect(schemaParams({})).toBe('')
  expect(schemaParams(null)).toBe('')
  expect(schemaParams({properties: {}})).toBe('')
})
