import {describe, expect} from 'vitest'
import {createEngine} from '@conciv/plugin-testkit'
import {test} from '../../../test/engine-test.js'

describe('plugin rpc', () => {
  test('a method answers, a declared failure gives its type and message, and a crash is an internal failure', async () => {
    const engine = await createEngine({plugins: ['./test/fixtures/plugins/desk']})

    expect(await engine.rpc.call('desk', 'echo', {text: 'Hello'})).toEqual({text: 'Hello'})
    expect(await engine.rpc.failure('desk', 'lock', {})).toMatchObject({
      type: 'LOCKED',
      message: 'The desk is locked',
      data: {reason: 'night shift'},
    })
    expect(await engine.rpc.failure('desk', 'crash', {})).toMatchObject({
      type: 'rpc.internal',
      message: 'RPC call failed',
    })
  })
})

describe('outside agents', () => {
  test('an outside agent that is disconnected from conciv is refused', async () => {
    const engine = await createEngine({plugins: ['./test/fixtures/plugins/desk']})

    expect(await engine.outside({client: 'codex'}).call('desk_echo', {text: 'Hello'})).toMatchObject({
      isError: true,
      content: [{type: 'text', text: expect.stringContaining('Codex is disconnected from conciv')}],
    })
  })

  test('with project access a call into a session waits until the user allows it', async () => {
    const engine = await createEngine({plugins: ['./test/fixtures/plugins/desk'], hubAccess: 'project'})

    const called = engine.outside({tab: engine.session.id}).call('desk_echo', {text: 'Hello'})
    await engine.session.approve()

    expect(await called).toEqual({
      content: [expect.objectContaining({type: 'text', text: expect.stringContaining('Hello')})],
    })
  })

  test('with open access a call into a session runs without asking, and a call with no session runs too', async () => {
    const engine = await createEngine({plugins: ['./test/fixtures/plugins/desk'], hubAccess: 'open'})

    expect(await engine.outside({tab: engine.session.id}).call('desk_echo', {text: 'Hello'})).toEqual({
      content: [expect.objectContaining({type: 'text', text: expect.stringContaining('Hello')})],
    })
    expect(await engine.outside().call('desk_echo', {text: 'Hello'})).toEqual({
      content: [expect.objectContaining({type: 'text', text: expect.stringContaining('Hello')})],
    })
  })
})

describe('harness listing', () => {
  test('the harness menu lists every harness of the engine with its models, the default first', async ({connect}) => {
    const engine = await createEngine(
      {},
      {
        harnesses: [
          {id: 'claude', models: [{id: 'opus', name: 'Opus 5.5'}]},
          {id: 'codex', models: [{id: 'gpt-5.6-sol', name: 'GPT 5.6 Sol'}]},
        ],
      },
    )

    await expect(connect(engine).meta.harnesses()).resolves.toMatchObject({
      defaultHarness: 'claude',
      harnesses: [
        {id: 'claude', models: [expect.objectContaining({id: 'opus'})], modelsFailed: false},
        {id: 'codex', models: [expect.objectContaining({id: 'gpt-5.6-sol'})], modelsFailed: false},
      ],
    })
  })
})

describe('tool registry', () => {
  test('a call naming no registered tool is refused with UNKNOWN_TOOL', async ({connect}) => {
    const engine = await createEngine({plugins: ['./test/fixtures/plugins/desk']})
    const rpc = connect(engine)

    await expect(rpc.registry.call({name: 'desk_missing', input: {}})).rejects.toMatchObject({
      code: 'UNKNOWN_TOOL',
      message: 'no registered tool answers to that name',
    })
  })
})
