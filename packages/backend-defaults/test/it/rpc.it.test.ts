import {describe, expect} from 'vitest'
import {test} from '../utils/engine-test.js'

describe('plugin rpc', () => {
  test('an outside client calls a registered method and each call sees the state the last one left', async ({
    createEngine,
  }) => {
    const engine = await createEngine({plugins: ['./test/fixtures/plugins/notes-rpc']})

    expect(await engine.rpc.call('notes', 'add', {text: 'Buy milk'})).toEqual({count: 1})
    expect(await engine.rpc.call('notes', 'add', {text: 'Call Ada'})).toEqual({count: 2})
  })

  test.for([
    {
      case: 'a declared error carries its type, message and data',
      rpc: 'notes',
      method: 'add',
      input: {text: 'a note far longer than twenty characters'},
      failure: {type: 'too_long', message: 'A note holds at most 20 characters', data: {limit: 20}},
    },
    {
      case: 'input the method schema refuses',
      rpc: 'notes',
      method: 'add',
      input: {text: 5},
      failure: {type: 'rpc.invalid_input', message: expect.any(String)},
    },
    {
      case: 'a method the rpc does not have',
      rpc: 'notes',
      method: 'remove',
      input: {},
      failure: {type: 'rpc.method_not_found', message: 'Unknown RPC method: notes.remove'},
    },
    {
      case: 'an rpc no plugin registered',
      rpc: 'nowhere',
      method: 'add',
      input: {},
      failure: {type: 'rpc.unavailable', message: 'RPC is unavailable: nowhere'},
    },
    {
      case: 'a handler that throws',
      rpc: 'notes',
      method: 'crash',
      input: {},
      failure: {type: 'rpc.internal', message: 'RPC call failed'},
    },
  ])('$case fails with that error', async ({rpc, method, input, failure}, {createEngine}) => {
    const engine = await createEngine({plugins: ['./test/fixtures/plugins/notes-rpc']})

    expect(await engine.rpc.failure(rpc, method, input)).toEqual(failure)
  })
})
