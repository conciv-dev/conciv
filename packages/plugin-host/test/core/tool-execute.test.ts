import {expect, test} from 'vitest'
import {Tool} from '../../src/core/tool.js'
import {execute} from '../../src/core/tool/runtime.js'
import {Agent} from '../../src/schema/agent.js'
import {Session} from '../../src/schema/session.js'
import {SessionMessage} from '../../src/schema/session-message.js'
import type {Info} from '../../src/schema/tool.js'
import {Effect, Schema} from 'effect'

const context = {
  sessionId: Session.Id.make('conciv_execute'),
  agent: Agent.Id.make('build'),
  messageId: SessionMessage.Id.make('msg_execute'),
  id: Tool.CallId.make('call_execute'),
  progress: () => Effect.void,
}

test('canonical execution distinguishes declared, model-only, and raw schema outputs', async () => {
  const declared: Info = {
    name: 'declared',
    description: 'Declared',
    input: Schema.Struct({value: Schema.String}),
    output: Schema.Struct({value: Schema.String}),
    execute: ({value}) => Effect.succeed({output: {value}}),
  }
  const modelOnlyInput = Schema.Struct({})
  const modelOnly = {
    name: 'model_only',
    description: 'Model only',
    input: modelOnlyInput,
    execute: () => Effect.succeed({content: 'visible only', metadata: {kind: 'model'}}),
  } satisfies Info<typeof modelOnlyInput, undefined>
  const raw: Info = {
    name: 'raw',
    description: 'Raw',
    input: {},
    output: {},
    execute: (input) => Effect.succeed({output: input, content: 'raw'}),
  }

  expect(await Effect.runPromise(execute(declared, {value: 'encoded'}, context))).toEqual({
    output: {value: 'encoded'},
    content: [{type: 'text', text: '{"value":"encoded"}'}],
  })
  expect(await Effect.runPromise(execute(modelOnly, {}, context))).toEqual({
    output: undefined,
    content: [{type: 'text', text: 'visible only'}],
    metadata: {kind: 'model'},
  })
  expect(await Effect.runPromise(execute(raw, {unchecked: true}, context))).toEqual({
    output: {unchecked: true},
    content: [{type: 'text', text: 'raw'}],
  })
})

test('declared outputs cannot bypass validation and raw outputs stay JSON-compatible', async () => {
  const missing: Info = {
    name: 'missing',
    description: 'Missing output',
    input: Schema.Struct({}),
    output: Schema.String,
    execute: () => Effect.succeed({content: 'not an output'}),
  }
  const invalid: Info = {
    name: 'invalid',
    description: 'Invalid raw output',
    input: {},
    output: {},
    execute: () => Effect.succeed({output: 1n, content: 'not JSON'}),
  }

  expect((await Effect.runPromiseExit(execute(missing, {}, context))).toString()).toContain(
    'Tool did not return its declared output',
  )
  expect((await Effect.runPromiseExit(execute(invalid, {}, context))).toString()).toContain(
    'Tool returned a non-JSON value',
  )
})

test('foreign typed failures settle as Tool.Error at the untrusted boundary', async () => {
  const ForeignFailure = Schema.TaggedStruct('Plugin.ForeignFailure', {
    message: Schema.String,
  })
  const makeForeignFailure = (fields: Omit<typeof ForeignFailure.Type, '_tag'>) =>
    Object.assign(new globalThis.Error(fields.message), ForeignFailure.make(fields), {name: 'Plugin.ForeignFailure'})
  const lying: Info = {
    name: 'lying',
    description: 'Fails with a non-Tool.Error typed failure',
    input: Schema.Struct({}),
    execute: () => Effect.fail(makeForeignFailure({message: 'transport died'})) as never,
  }

  const error = await Effect.runPromise(execute(lying, {}, context).pipe(Effect.flip))
  expect(error._tag).toBe('Tool.Error')
  expect(error.message).toBe('transport died')
})
