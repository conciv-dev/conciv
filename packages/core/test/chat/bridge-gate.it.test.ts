import {expect, test} from 'vitest'
import {z} from 'zod'
import {Client} from '@modelcontextprotocol/sdk/client/index.js'
import {StreamableHTTPClientTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import {toolDefinition} from '@tanstack/ai'
import type {ProvisionedBridge} from '@tanstack/ai-sandbox'
import {gateProvisioner} from '../../src/chat/gate.js'

async function callBridgeTool(bridge: ProvisionedBridge, name: string, args: unknown): Promise<string> {
  const client = new Client({name: 'bridge-gate-test', version: '0.0.0'})
  const transport = new StreamableHTTPClientTransport(new URL(bridge.url), {
    requestInit: {headers: {authorization: `Bearer ${bridge.token}`}},
  })
  await client.connect(transport)
  try {
    const result = await client.callTool({name, arguments: args as Record<string, unknown>})
    const content = Array.isArray(result.content) ? result.content : []
    const first = content[0]
    return first && first.type === 'text' ? first.text : JSON.stringify(result)
  } finally {
    await client.close()
  }
}

const settle = (ms: number, value: string): Promise<string> =>
  new Promise((resolve) => setTimeout(() => resolve(value), ms))

test('permission tool blocks until gate decides, then allows', async () => {
  let release: (d: 'allow' | 'deny') => void = () => {}
  let markGateAsked: () => void = () => {}
  const gateAsked = new Promise<void>((resolve) => (markGateAsked = resolve))
  const gate = {
    decide: () =>
      new Promise<'allow' | 'deny'>((resolve) => {
        release = resolve
        markGateAsked()
      }),
  }
  const bridge = await gateProvisioner(gate, 'session-1').provision([], {
    provider: 'local-process',
    permission: {toolName: 'approval_prompt', resolve: () => ({behavior: 'deny', message: 'unused upstream resolver'})},
  })
  const call = callBridgeTool(bridge, 'approval_prompt', {tool_name: 'Bash', input: {command: 'rm -rf /'}})
  await expect(Promise.race([call, settle(300, 'pending')])).resolves.toBe('pending')
  await gateAsked
  release('allow')
  expect(JSON.parse(await call)).toEqual({behavior: 'allow', updatedInput: {command: 'rm -rf /'}})
  await bridge.close()
})

test('permission tool denies when the gate denies', async () => {
  const gate = {decide: async () => 'deny' as const}
  const bridge = await gateProvisioner(gate, 'session-2').provision([], {
    provider: 'local-process',
    permission: {toolName: 'approval_prompt', resolve: () => ({behavior: 'allow'})},
  })
  const result = JSON.parse(await callBridgeTool(bridge, 'approval_prompt', {tool_name: 'Bash', input: {}}))
  expect(result.behavior).toBe('deny')
  await bridge.close()
})

test('bridged tool calls route through the gate before executing', async () => {
  const decided: string[] = []
  let ran = 0
  const gate = {
    decide: async (toolName: string) => {
      decided.push(toolName)
      return toolName === 'blocked_tool' ? ('deny' as const) : ('allow' as const)
    },
  }
  const echo = toolDefinition({
    name: 'echo_tool',
    description: 'echoes',
    inputSchema: z.object({value: z.string()}),
  }).server(async (args) => {
    ran += 1
    return {echoed: args.value}
  })
  const blocked = toolDefinition({
    name: 'blocked_tool',
    description: 'never runs',
    inputSchema: z.object({}),
  }).server(async () => {
    ran += 1
    return {}
  })
  const bridge = await gateProvisioner(gate, 'session-3').provision([echo, blocked], {provider: 'local-process'})
  const ok = await callBridgeTool(bridge, 'echo_tool', {value: 'hi'})
  expect(JSON.parse(ok)).toEqual({echoed: 'hi'})
  const denied = await callBridgeTool(bridge, 'blocked_tool', {})
  expect(denied).toContain('denied')
  expect(decided).toEqual(['echo_tool', 'blocked_tool'])
  expect(ran).toBe(1)
  await bridge.close()
})
