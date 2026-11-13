import {expect, test} from 'vitest'
import {Effect} from 'effect'
import {z} from 'zod'
import {Agent} from '../../src/schema/agent.js'
import {Session} from '../../src/schema/session.js'
import {SessionMessage} from '../../src/schema/session-message.js'
import type {Info} from '../../src/schema/tool.js'
import {Tool} from '../../src/core/tool.js'
import {definition, execute} from '../../src/core/tool/runtime.js'

const context = {
  sessionID: Session.ID.make('ses_tool_schema'),
  agent: Agent.ID.make('build'),
  messageID: SessionMessage.ID.make('msg_tool_schema'),
  id: Tool.CallID.make('call_tool_schema'),
  progress: () => Effect.void,
} satisfies Tool.Context

test('tools are structural values', async () => {
  const config = {
    name: 'foreign',
    description: 'Foreign tool',
    input: z.object({value: z.string()}),
    output: z.object({ok: z.boolean()}),
    execute: () => Effect.succeed({output: {ok: true}}),
  }
  const tool: Info = config

  expect(definition(tool)).toEqual({
    type: 'tool',
    name: 'foreign',
    description: 'Foreign tool',
    inputSchema: {
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      type: 'object',
      properties: {value: {type: 'string'}},
      required: ['value'],
    },
    outputSchema: {
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      type: 'object',
      properties: {ok: {type: 'boolean'}},
      required: ['ok'],
      additionalProperties: false,
    },
  })
})

test('portable schemas validate and describe typed tools', async () => {
  const input = {
    '~standard': {
      version: 1,
      vendor: 'test',
      validate: (value: unknown) => {
        if (typeof value !== 'object' || value === null || !('count' in value) || typeof value.count !== 'string')
          return {issues: [{message: 'count must be numeric'}]}
        const count = Number(value.count)
        return Number.isFinite(count) ? {value: {count}} : {issues: [{message: 'count must be numeric'}]}
      },
      jsonSchema: {
        input: () => ({type: 'object', properties: {count: {type: 'string'}}}),
        output: () => ({type: 'object', properties: {count: {type: 'number'}}}),
      },
    },
  } as const
  const output = {
    '~standard': {
      version: 1,
      vendor: 'test',
      validate: (value: unknown) => ({value: String(value)}),
      jsonSchema: {
        input: () => ({type: 'number'}),
        output: () => ({type: 'string'}),
      },
    },
  } as const
  const tool: Info = {
    name: 'portable',
    description: 'Portable tool',
    input,
    output,
    execute: ({count}) => Effect.succeed({output: count + 1}),
  }

  expect(definition(tool)).toEqual({
    type: 'tool',
    name: 'portable',
    description: 'Portable tool',
    inputSchema: {type: 'object', properties: {count: {type: 'string'}}},
    outputSchema: {type: 'string'},
  })
  const result = await Effect.runPromise(execute(tool, {count: '41'}, context))
  expect(result.output).toBe('42')
})

test('Zod schemas validate, transform, and describe typed tools', async () => {
  const tool: Info = {
    name: 'zod',
    description: 'Zod tool',
    input: z.object({count: z.string().transform(Number)}),
    output: z.object({count: z.number()}),
    execute: ({count}) => Effect.succeed({output: {count: count + 1}}),
  }

  expect(definition(tool)).toEqual({
    type: 'tool',
    name: 'zod',
    description: 'Zod tool',
    inputSchema: {
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      type: 'object',
      properties: {count: {type: 'string'}},
      required: ['count'],
    },
    outputSchema: {
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      type: 'object',
      properties: {count: {type: 'number'}},
      required: ['count'],
      additionalProperties: false,
    },
  })
  expect(await Effect.runPromise(execute(tool, {count: '41'}, context))).toMatchObject({
    output: {count: 42},
  })
  expect(await Effect.runPromise(Effect.flip(execute(tool, {count: 41}, context)))).toEqual(
    Tool.makeError({
      message:
        'Invalid arguments for tool "zod":\n- count: Invalid input: expected string, received number\n\nArguments provided:\n{\n  "count": 41\n}\n\nUpdate the arguments and call the tool again.',
    }),
  )
})

test('portable schema failures become tool failures', async () => {
  const input = {
    '~standard': {
      version: 1,
      vendor: 'test',
      validate: (_value: unknown) => ({
        issues: [
          {path: ['value'], message: 'expected a string'},
          {path: [{key: 'nested'}, {key: 'count'}], message: 'expected a positive integer'},
        ],
      }),
      jsonSchema: {
        input: () => ({type: 'string'}),
        output: () => ({type: 'string'}),
      },
    },
  }

  const error = await Effect.runPromise(
    Effect.flip(
      execute(
        {
          name: 'invalid',
          description: 'Invalid',
          input,
          execute: () => Effect.succeed({content: 'unused'}),
        },
        1,
        context,
      ),
    ),
  )
  expect(error).toEqual(
    Tool.makeError({
      message:
        'Invalid arguments for tool "invalid":\n- value: expected a string\n- nested.count: expected a positive integer\n\nArguments provided:\n1\n\nUpdate the arguments and call the tool again.',
    }),
  )
})

test('input error prompts limit normalized issues', async () => {
  const input = {
    '~standard': {
      version: 1,
      vendor: 'test',
      validate: (_value: unknown) => ({
        issues: Array.from({length: 6}, (_, index) => ({message: `issue ${index + 1}`})),
      }),
      jsonSchema: {
        input: () => ({}),
        output: () => ({}),
      },
    },
  } as const
  const tool: Info = {
    name: 'limited',
    description: 'Limited issues',
    input,
    execute: () => Effect.succeed({content: 'unused'}),
  }

  expect(await Effect.runPromise(Effect.flip(execute(tool, {}, context)))).toEqual(
    Tool.makeError({
      message:
        'Invalid arguments for tool "limited":\n- root: issue 1\n- root: issue 2\n- root: issue 3\n- root: issue 4\n- root: issue 5\n- ...and 1 more issue\n\nArguments provided:\n{}\n\nUpdate the arguments and call the tool again.',
    }),
  )
})

test('canonical results carry metadata with typed output', async () => {
  const input = z.object({value: z.string()})
  const output = z.object({value: z.string(), internal: z.boolean()})
  const tool: Info = {
    name: 'annotated',
    description: 'Annotated tool',
    input,
    output,
    execute: ({value}) => Effect.succeed({output: {value, internal: true}, metadata: {value}, content: value}),
  }

  expect(await Effect.runPromise(tool.execute({value: 'out'}, context))).toEqual({
    output: {value: 'out', internal: true},
    metadata: {value: 'out'},
    content: 'out',
  })
})

test('missing external input schemas fall back to an empty schema', () => {
  const tool = {
    name: 'external',
    description: 'External tool',
    input: undefined,
    execute: () => Effect.succeed({content: 'unused'}),
  } as unknown as Info

  expect(definition(tool)).toEqual({
    type: 'tool',
    name: 'external',
    description: 'External tool',
    inputSchema: {},
  })
})
