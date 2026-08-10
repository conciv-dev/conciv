import {expect, test} from 'vitest'
import {schemaFields, schemaParams} from '../src/tools/primitives/schema-params.js'

const schema = {
  type: 'object',
  properties: {seconds: {type: 'number'}, keyframes: {type: 'number'}, label: {type: 'string'}},
  required: ['seconds'],
}

test('renders required then optional params with types', () => {
  expect(schemaParams(schema)).toBe('seconds: number · keyframes?: number · label?: string')
})

test('empty or foreign input renders empty string', () => {
  expect(schemaParams({})).toBe('')
  expect(schemaParams(null)).toBe('')
  expect(schemaParams({properties: {}})).toBe('')
})

test('fields come back required-first with their declared type', () => {
  expect(schemaFields(schema)).toEqual([
    {name: 'seconds', type: 'number', required: true},
    {name: 'keyframes', type: 'number', required: false},
    {name: 'label', type: 'string', required: false},
  ])
})

test('a foreign schema yields no fields', () => {
  expect(schemaFields(null)).toEqual([])
  expect(schemaFields({properties: {}})).toEqual([])
})
