import {expect, test} from 'vitest'
import {z} from 'zod'
import {buildChatTools, toChatTool} from '../src/api/chat/chat-tools.js'

test('converts a registrable tool and executes with parsed args', async () => {
  const tool = toChatTool(
    {name: 'echo_tool', description: 'echoes', inputSchema: z.object({value: z.string()})},
    async (args) => ({echoed: args}),
  )
  expect(tool.name).toBe('echo_tool')
  const result = await tool.execute?.({value: 'hi'})
  expect(result).toEqual({echoed: {value: 'hi'}})
})

test('buildChatTools yields conciv + extension tools bound to the session', async () => {
  const tools = buildChatTools(
    () => ({
      askUi: async () => ({answered: false, note: ''}),
      page: async () => ({ok: false as const, error: 'none'}),
      open: () => {},
    }),
    [
      {
        name: 'ext_tool',
        description: 'extension tool',
        inputSchema: z.object({}),
        execute: async (_input, request) => request,
      },
    ],
    () => 'opus',
    () => true,
  )('session-9')
  const names = tools.map((tool) => tool.name)
  expect(names).toContain('ext_tool')
  expect(names.length).toBeGreaterThan(1)
  const extension = tools.find((tool) => tool.name === 'ext_tool')
  await expect(extension?.execute?.({})).resolves.toEqual({sessionId: 'session-9', model: 'opus'})
})
