import {describe, expect, test} from 'vitest'
import {z} from 'zod'
import {withInitial} from './schema'

describe('persistence schemas', () => {
  test('initial state supplies nested defaults without hiding valid siblings', () => {
    const decode = withInitial(
      'appearance',
      z.object({
        enabled: z.boolean(),
        appearance: z.object({width: z.number(), font: z.string()}),
        variant: z.string().nullable().optional(),
      }),
      {enabled: true, appearance: {width: 240, font: 'default'}, variant: 'high'},
    )

    expect(decode({appearance: {width: 300}})).toEqual({
      enabled: true,
      appearance: {width: 300, font: 'default'},
      variant: 'high',
    })
    expect(decode({enabled: 'false', appearance: {width: 'wide', font: 'saved'}, variant: null})).toEqual({
      enabled: true,
      appearance: {width: 240, font: 'saved'},
      variant: null,
    })
    expect(decode({appearance: null})).toEqual({
      enabled: true,
      appearance: {width: 240, font: 'default'},
      variant: 'high',
    })
  })

  test('initial merging replaces arrays rather than merging indexes', () => {
    const decode = withInitial('items', z.object({amount: z.number(), items: z.array(z.string())}), {
      amount: 7,
      items: ['initial'],
    })

    expect(decode({amount: 12, items: []})).toEqual({amount: 12, items: []})
    expect(decode({amount: 'invalid', items: ['saved']})).toEqual({amount: 7, items: ['saved']})
  })

  test('defaults missing and invalid fields without discarding valid siblings', () => {
    const decode = withInitial('fields', z.object({enabled: z.boolean(), label: z.string(), amount: z.number()}), {
      enabled: true,
      label: 'default',
      amount: 7,
    })

    expect(decode({})).toEqual({enabled: true, label: 'default', amount: 7})
    expect(decode({enabled: 'false', label: 'saved', amount: 'invalid'})).toEqual({
      enabled: true,
      label: 'saved',
      amount: 7,
    })
    expect(decode({enabled: undefined, label: null, amount: 12})).toEqual({
      enabled: true,
      label: 'default',
      amount: 12,
    })
  })

  test('an invalid array entry replaces the whole array with the initial one', () => {
    const decode = withInitial('items', z.object({amount: z.number(), items: z.array(z.string())}), {
      amount: 7,
      items: ['initial'],
    })

    expect(decode({amount: 12, items: ['saved', 3]})).toEqual({amount: 12, items: ['initial']})
  })

  test('a record with one invalid entry keeps its valid entries', () => {
    const decode = withInitial('flags', z.object({label: z.string(), flags: z.record(z.string(), z.boolean())}), {
      label: 'default',
      flags: {},
    })

    expect(decode({label: 'saved', flags: {valid: true, invalid: 'true'}})).toEqual({
      label: 'saved',
      flags: {valid: true},
    })
  })

  test('a record entry named like an Object.prototype member is dropped alone when it fails', () => {
    const decode = withInitial('named', z.object({label: z.string(), flags: z.record(z.string(), z.boolean())}), {
      label: 'default',
      flags: {},
    })

    expect(decode({label: 'saved', flags: {valid: true, constructor: 'bad', toString: 'bad'}})).toEqual({
      label: 'saved',
      flags: {valid: true},
    })
  })

  test('a root-level issue gives the whole initial value', () => {
    const decode = withInitial('strict', z.strictObject({amount: z.number(), label: z.string()}), {
      amount: 7,
      label: 'default',
    })

    expect(decode({amount: 12, label: 'saved', removed: true})).toEqual({amount: 7, label: 'default'})
  })

  test('a schema that validates asynchronously throws a TypeError naming the store', () => {
    const decode = withInitial(
      'remote',
      z.object({amount: z.number()}).refine(async () => true),
      {amount: 7},
    )

    expect(() => decode({amount: 12})).toThrow(
      new TypeError('The store remote has a schema that validates asynchronously'),
    )
  })
})
