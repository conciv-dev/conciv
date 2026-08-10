import {expect, test} from 'vitest'
import {z} from 'zod'
import {toChatTool} from '../../src/chat/runtime.js'

test('converts a registrable tool and executes with parsed args', async () => {
  const tool = toChatTool(
    {name: 'echo_tool', description: 'echoes', inputSchema: z.object({value: z.string()})},
    async (args) => ({echoed: args}),
  )
  expect(tool.name).toBe('echo_tool')
  const result = await tool.execute?.({value: 'hi'})
  expect(result).toEqual({echoed: {value: 'hi'}})
})
