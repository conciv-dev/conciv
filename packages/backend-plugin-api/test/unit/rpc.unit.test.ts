import {Schema} from 'effect'
import {describe, expect, it} from 'vitest'
import * as Rpc from '@conciv/protocol/schema/rpc'

describe('defining an rpc contract', () => {
  it.each<[string, Rpc.ErrorMap]>([
    [
      'rpc.',
      {
        // @ts-expect-error a plugin written in plain JavaScript has no types to stop it naming an error "rpc."
        'rpc.': Schema.String,
      },
    ],
    [
      'rpc.timeout',
      {
        // @ts-expect-error a plugin written in plain JavaScript has no types to stop it naming an error "rpc.timeout"
        'rpc.timeout': Schema.String,
      },
    ],
    [
      'rpc.internal.failure',
      {
        // @ts-expect-error a plugin written in plain JavaScript has no types to stop it naming an error "rpc.internal.failure"
        'rpc.internal.failure': Schema.String,
      },
    ],
  ])('a method error named %s is refused as reserved', (name, errors) => {
    expect(() =>
      Rpc.define({id: 'reserved', methods: {read: {input: Schema.String, output: Schema.String, errors}}, events: {}}),
    ).toThrow(`RPC error names starting with "rpc." are reserved: ${name}`)
  })
})
