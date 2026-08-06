import {describe, expect, test} from 'vitest'
import {z} from 'zod'
import {resolveSchemaRefs} from '../../src/chat/resolve-schema-refs.js'

describe('resolveSchemaRefs', () => {
  test('inlines a legitimately reused reference at every occurrence', () => {
    const point = z.object({x: z.number(), y: z.number()}).meta({id: 'Point'})
    const line = z.object({from: point, to: point})
    const emitted = z.toJSONSchema(line, {io: 'input'})
    expect(JSON.stringify(emitted)).toContain('$ref')
    const resolved = resolveSchemaRefs(emitted)
    const text = JSON.stringify(resolved)
    expect(text).not.toContain('$ref')
    expect(text).not.toContain('$defs')
    const parsed = z
      .object({
        properties: z.object({
          from: z.object({properties: z.object({x: z.unknown(), y: z.unknown()})}).loose(),
          to: z.object({properties: z.object({x: z.unknown(), y: z.unknown()})}).loose(),
        }),
      })
      .loose()
      .parse(resolved)
    expect(parsed.properties.from.properties).toBeDefined()
    expect(parsed.properties.to.properties).toBeDefined()
  })

  test('breaks a real cycle instead of hanging, and only at the re-entry point', () => {
    const node = z.object({
      name: z.string(),
      get children() {
        return z.array(node)
      },
    })
    const wrapper = z.object({head: node, tail: node})
    const emitted = z.toJSONSchema(wrapper, {io: 'input'})
    const resolved = resolveSchemaRefs(emitted)
    const text = JSON.stringify(resolved)
    expect(text).not.toContain('$ref')
    const parsed = z
      .object({
        properties: z.object({
          head: z.object({properties: z.object({name: z.unknown()})}).loose(),
          tail: z.object({properties: z.object({name: z.unknown()})}).loose(),
        }),
      })
      .loose()
      .parse(resolved)
    expect(parsed.properties.head.properties.name).toBeDefined()
    expect(parsed.properties.tail.properties.name).toBeDefined()
  })

  test('decodes escaped json-pointer tokens in reference targets', () => {
    const schema = {
      type: 'object',
      properties: {value: {$ref: '#/$defs/a~1b~0c'}},
      $defs: {'a/b~c': {type: 'string'}},
    }
    const resolved = resolveSchemaRefs(schema)
    expect(resolved).toEqual({type: 'object', properties: {value: {type: 'string'}}})
  })

  test('a pointer token with a bare percent resolves literally instead of throwing', () => {
    const schema = {
      type: 'object',
      properties: {value: {$ref: '#/$defs/100%'}},
      $defs: {'100%': {type: 'string'}},
    }
    const resolved = resolveSchemaRefs(schema)
    expect(resolved).toEqual({type: 'object', properties: {value: {type: 'string'}}})
  })

  test('leaves an unresolvable reference as unknown-shaped instead of throwing', () => {
    const schema = {type: 'object', properties: {value: {$ref: '#/$defs/missing'}}}
    const resolved = resolveSchemaRefs(schema)
    expect(JSON.stringify(resolved)).not.toContain('$ref')
  })
})
