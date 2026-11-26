import {describe, expect} from 'vitest'
import {z} from 'zod'
import {defineTool} from '@conciv/types/chat-tool-types'
import {test} from '../utils/ai-test.js'
import {codeModeTools} from '../../src/ai/code-mode.js'
import {makeMaker} from '@conciv/protocol/schema/identifier'

describe('the agent runs its own program', () => {
  test('a program that loops, calls a tool for each plant and logs gets its returned value and its logs back, and a capability that takes a secret-looking parameter is refused and never runs', async ({
    driver,
  }) => {
    const stock: Record<string, number> = {fern: 3, palm: 5}
    const shelfCount = defineTool({
      name: 'shelf_count',
      description: 'Count the pots of one plant on the shelf',
      inputSchema: z.object({plant: z.string()}),
      outputSchema: z.object({count: z.number()}),
    }).server(async ({plant}) => ({count: stock[plant] ?? 0}))
    const coded = codeModeTools(
      driver,
      [shelfCount],
      null,
      (value) => value,
      {
        errors: false,
        provider: false,
        output: false,
        middleware: false,
        tools: false,
        agentLoop: false,
        config: false,
        request: false,
        sandbox: false,
      },
      undefined,
      makeMaker(),
    )

    const result = await coded?.execute.execute?.({
      typescriptCode: [
        "const plants = ['fern', 'palm']",
        'const counts = await Promise.all(plants.map((plant) => external_shelf_count({plant})))',
        "console.log('counted', counts.length)",
        'return counts.reduce((total, each) => total + each.count, 0)',
      ].join('\n'),
    })

    expect(result).toMatchObject({success: true, result: 8, logs: ['counted 2']})

    const opened: string[] = []
    const vaultOpen = defineTool({
      name: 'vault_open',
      description: 'Open the vault with a key',
      inputSchema: z.object({apiKey: z.string()}),
      outputSchema: z.object({open: z.boolean()}),
    }).server(async ({apiKey}) => {
      opened.push(apiKey)
      return {open: true}
    })
    const guarded = codeModeTools(
      driver,
      [vaultOpen],
      null,
      (value) => value,
      {
        errors: false,
        provider: false,
        output: false,
        middleware: false,
        tools: false,
        agentLoop: false,
        config: false,
        request: false,
        sandbox: false,
      },
      undefined,
      makeMaker(),
    )

    const refused = await guarded?.execute.execute?.({
      typescriptCode: "return await external_vault_open({apiKey: 'k-1'})",
    })

    expect(refused).toMatchObject({
      success: false,
      error: {
        message: expect.stringContaining(
          '"vault_open" takes "apiKey", which looks like a secret, so code mode refuses to run it',
        ),
      },
    })
    expect(opened).toEqual([])
  })
})

describe('limits', () => {
  test.for([
    {
      limit: 'time',
      timeoutMs: 200,
      program: 'while (true) {}',
      error: {name: 'TimeoutError', message: 'Code execution timed out'},
    },
    {
      limit: 'memory',
      timeoutMs: undefined,
      program: "let text = 'x'\nwhile (true) text += text",
      error: {name: 'MemoryLimitError', message: 'Code execution exceeded memory limit'},
    },
  ])(
    'a program past its $limit limit is stopped and the agent gets the reason',
    async ({timeoutMs, program, error}, {driver}) => {
      const shelfCount = defineTool({
        name: 'shelf_count',
        description: 'Count the pots of one plant on the shelf',
        inputSchema: z.object({plant: z.string()}),
        outputSchema: z.object({count: z.number()}),
      }).server(async () => ({count: 0}))
      const coded = codeModeTools(
        driver,
        [shelfCount],
        null,
        (value) => value,
        {
          errors: false,
          provider: false,
          output: false,
          middleware: false,
          tools: false,
          agentLoop: false,
          config: false,
          request: false,
          sandbox: false,
        },
        undefined,
        makeMaker(),
        timeoutMs,
      )

      const result = await coded?.execute.execute?.({typescriptCode: program})

      expect(result).toMatchObject({success: false, error})
    },
  )
})
