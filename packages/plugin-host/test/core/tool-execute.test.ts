import {expect, test} from 'vitest'
import {Tool} from '../../src/core/tool.js'
import {execute} from '../../src/core/tool/runtime.js'
import {Agent} from '../../src/schema/agent.js'
import {Session} from '../../src/schema/session.js'
import {SessionMessage} from '../../src/schema/session-message.js'
import type {Info} from '../../src/schema/tool.js'
import {Effect, Schema} from 'effect'
import {z} from 'zod'

const context = {
  sessionID: Session.ID.make('ses_execute'),
  agent: Agent.ID.make('build'),
  messageID: SessionMessage.ID.make('msg_execute'),
  id: Tool.CallID.make('call_execute'),
  progress: () => Effect.void,
}

test('canonical execution distinguishes declared, model-only, and raw schema outputs', async () => {
  const declared: Info = {
    name: 'declared',
    description: 'Declared',
    input: z.object({value: z.string()}),
    output: z.object({value: z.string()}),
    execute: ({value}) => Effect.succeed({output: {value}}),
  }
  const modelOnlyInput = z.object({})
  const modelOnly = {
    name: 'model_only',
    description: 'Model only',
    input: modelOnlyInput,
    execute: () => Effect.succeed({content: 'visible only', metadata: {kind: 'model'}}),
  } satisfies Info<typeof modelOnlyInput, undefined>

  expect(await Effect.runPromise(execute(declared, {value: 'encoded'}, context))).toEqual({
    output: {value: 'encoded'},
    content: [{type: 'text', text: '{"value":"encoded"}'}],
  })
  expect(await Effect.runPromise(execute(modelOnly, {}, context))).toEqual({
    output: undefined,
    content: [{type: 'text', text: 'visible only'}],
    metadata: {kind: 'model'},
  })
})

test('declared outputs cannot bypass validation and raw outputs stay JSON-compatible', async () => {
  const missing: Info = {
    name: 'missing',
    description: 'Missing output',
    input: z.object({}),
    output: z.string(),
    execute: () => Effect.succeed({content: 'not an output'}),
  }

  expect((await Effect.runPromiseExit(execute(missing, {}, context))).toString()).toContain(
    'Tool did not return its declared output',
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
    input: z.object({}),
    execute: () => Effect.fail(makeForeignFailure({message: 'transport died'})) as never,
  }

  const error = await Effect.runPromise(execute(lying, {}, context).pipe(Effect.flip))
  expect(error._tag).toBe('Tool.Error')
  expect(error.message).toBe('transport died')
})
