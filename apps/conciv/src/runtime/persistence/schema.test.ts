import {describe, expect, test} from 'vitest'
import type {StandardSchemaV1} from '@standard-schema/spec'
import {z} from 'zod'
import type {StoreType} from '@conciv/plugin/experimental'
import {assertStoreDefinition, assertStoreWrite, withInitial} from './schema'

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

  test('initial merging preserves field codecs and replaces arrays rather than merging indexes', () => {
    const current = z.object({
      amount: z.codec(z.string(), z.number(), {decode: Number, encode: String}),
      items: z.array(z.string()),
    })
    const encode = (value: z.output<typeof current>) => z.encode(current, value)

    const decode = withInitial('codec', current, {amount: 7, items: ['initial']}, encode)
    expect(decode({amount: '12', items: []})).toEqual({amount: 12, items: []})
    expect(decode({amount: 'invalid', items: ['saved']})).toEqual({amount: 7, items: ['saved']})
    expect(encode(decode({}))).toEqual({amount: '7', items: ['initial']})
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

  test('a store that would not read back its initial value is refused when defined', () => {
    const amount = z.codec(z.string(), z.number(), {decode: Number, encode: String})
    const amounts = z.object({amount, items: z.array(z.string())})
    const labels = z.object({label: z.string().transform((label) => `${label}!`)})

    expect(() => assertStoreDefinition('plugin.acme.amounts', amounts, {amount: 7, items: []})).toThrow(
      new Error(
        'The store plugin.acme.amounts is refused: it does not read back what it writes at amount; a converting schema needs an encode',
      ),
    )
    expect(() => assertStoreDefinition('plugin.acme.labels', labels, {label: 'saved'})).toThrow(
      new Error(
        'The store plugin.acme.labels is refused: it does not read back what it writes at label; a converting schema needs an encode',
      ),
    )
    expect(() =>
      assertStoreDefinition('plugin.acme.plain', z.object({label: z.string()}), {label: 'saved'}),
    ).not.toThrow()
    expect(() =>
      assertStoreDefinition('plugin.acme.encoded', amounts, {amount: 7, items: []}, (value) =>
        z.encode(amounts, value),
      ),
    ).not.toThrow()
    expect(() =>
      assertStoreDefinition(
        'plugin.acme.remote',
        z.object({amount: z.number()}).refine(async () => true),
        {
          amount: 7,
        },
      ),
    ).toThrow(new TypeError('The store plugin.acme.remote has a schema that validates asynchronously'))
  })

  test('a store whose initial holds an undefined optional field is accepted when defined', () => {
    const labelled = z.object({
      label: z.string(),
      variant: z.string().optional(),
      style: z.object({tone: z.string().optional()}),
    })
    const shouted = z.object({label: z.string().transform((label) => `${label}!`), variant: z.string().optional()})

    expect(() =>
      assertStoreDefinition('plugin.acme.labelled', labelled, {
        label: 'x',
        variant: undefined,
        style: {tone: undefined},
      }),
    ).not.toThrow()
    expect(() => assertStoreDefinition('plugin.acme.shouted', shouted, {label: 'x', variant: undefined})).toThrow(
      new Error(
        'The store plugin.acme.shouted is refused: it does not read back what it writes at label; a converting schema needs an encode',
      ),
    )
  })

  test('an undefined field of an object inside an array counts as absent, an undefined array element is still a difference', () => {
    const items = z.object({items: z.array(z.object({a: z.number(), b: z.number().optional()}))})
    const slots = z.object({slots: z.array(z.number().optional().nullable())})

    expect(() => assertStoreDefinition('plugin.acme.items', items, {items: [{a: 1, b: undefined}]})).not.toThrow()
    expect(() => assertStoreDefinition('plugin.acme.slots', slots, {slots: [1, undefined]})).toThrow(
      new Error(
        'The store plugin.acme.slots is refused: it does not read back what it writes at slots; a converting schema needs an encode',
      ),
    )
  })

  test('a write the store would not read back is refused when the definition could not show it', () => {
    const amount = z.codec(z.string(), z.number(), {decode: Number, encode: String})
    const records = z.object({amounts: z.record(z.string(), amount)})
    const optional = z.object({amount: amount.optional()})
    const lists = z.object({amounts: z.array(amount)})
    const doubled = z.object({count: z.number().transform((count) => count * 2)})

    expect(() => assertStoreDefinition('plugin.acme.records', records, {amounts: {}})).not.toThrow()
    expect(() => assertStoreWrite('plugin.acme.records', records, {amounts: {saved: 12}})).toThrow(
      new Error(
        'The store plugin.acme.records refused a write: it does not read back what it writes at amounts.saved; a converting schema needs an encode',
      ),
    )
    expect(() => assertStoreDefinition('plugin.acme.optional', optional, {})).not.toThrow()
    expect(() => assertStoreWrite('plugin.acme.optional', optional, {amount: 12})).toThrow(
      new Error(
        'The store plugin.acme.optional refused a write: it does not read back what it writes at amount; a converting schema needs an encode',
      ),
    )
    expect(() => assertStoreDefinition('plugin.acme.lists', lists, {amounts: []})).not.toThrow()
    expect(() => assertStoreWrite('plugin.acme.lists', lists, {amounts: [12]})).toThrow(
      new Error(
        'The store plugin.acme.lists refused a write: it does not read back what it writes at amounts.0; a converting schema needs an encode',
      ),
    )
    expect(() => assertStoreDefinition('plugin.acme.doubled', doubled, {count: 0})).not.toThrow()
    expect(() => assertStoreWrite('plugin.acme.doubled', doubled, {count: 3})).toThrow(
      new Error(
        'The store plugin.acme.doubled refused a write: it does not read back what it writes at count; a converting schema needs an encode',
      ),
    )
    expect(() =>
      assertStoreWrite('plugin.acme.lists', lists, {amounts: [12]}, (value) => z.encode(lists, value)),
    ).not.toThrow()
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

describe('store value type', () => {
  test('typecheck assertion, bites under tsc only: a generic schema output assigns to its store value', () => {
    const storeValue = <S extends StandardSchemaV1<unknown, object>>(
      value: StandardSchemaV1.InferOutput<S>,
    ): StoreType<S> => value
    const schema = z.object({tags: z.array(z.string())})

    expect(storeValue<typeof schema>({tags: ['a']})).toEqual({tags: ['a']})
  })
})
