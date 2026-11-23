import {spawn, type ChildProcessByStdio} from 'node:child_process'
import {once} from 'node:events'
import {createRequire} from 'node:module'
import {createInterface} from 'node:readline'
import type {Readable, Writable} from 'node:stream'
import {test as base} from 'vitest'
import {z} from 'zod'
import {createMCPClient, type MCPClient} from '@tanstack/ai-mcp'
import {stdioTransport} from '@tanstack/ai-mcp/stdio'

const HUB_ARGS = [createRequire(import.meta.url).resolve('@conciv/cli/bin'), 'mcp', 'serve', '--agent', 'claude']

const TASKS_ENVELOPE = {
  'io.modelcontextprotocol/protocolVersion': '2026-07-28',
  'io.modelcontextprotocol/clientInfo': {name: 'hub-test', version: '1.0.0'},
  'io.modelcontextprotocol/clientCapabilities': {extensions: {'io.modelcontextprotocol/tasks': {}}},
}

const ReplySchema = z.object({id: z.number(), result: z.looseObject({})})

type TasksClient = {request: (method: string, params: Record<string, unknown>) => Promise<Record<string, unknown>>}

export const test = base.extend<{
  hub: (home: string) => Promise<MCPClient>
  tasksHub: (home: string) => TasksClient
}>({
  hub: async ({task: _task}, use) => {
    const clients: MCPClient[] = []
    await use(async (home) => {
      const client = await createMCPClient({
        transport: stdioTransport({command: process.execPath, args: HUB_ARGS, env: {CONCIV_HOME: home, HOME: home}}),
      })
      clients.push(client)
      return client
    })
    await Promise.all(clients.map((client) => client.close()))
  },
  tasksHub: async ({task: _task}, use) => {
    const children: ChildProcessByStdio<Writable, Readable, null>[] = []
    await use((home) => {
      const child = spawn(process.execPath, HUB_ARGS, {
        env: {...process.env, CONCIV_HOME: home, HOME: home},
        stdio: ['pipe', 'pipe', 'inherit'],
      })
      children.push(child)
      const waiting = new Map<number, (result: Record<string, unknown>) => void>()
      createInterface({input: child.stdout}).on('line', (line) => {
        const reply = ReplySchema.safeParse(JSON.parse(line))
        if (reply.success) waiting.get(reply.data.id)?.(reply.data.result)
      })
      const sent = {next: 1}
      return {
        request: (method, params) => {
          const id = sent.next++
          const replied = new Promise<Record<string, unknown>>((resolve) => waiting.set(id, resolve))
          child.stdin.write(
            `${JSON.stringify({jsonrpc: '2.0', id, method, params: {...params, _meta: TASKS_ENVELOPE}})}\n`,
          )
          return replied
        },
      }
    })
    await Promise.all(
      children.map(async (child) => {
        child.stdin.end()
        await once(child, 'exit')
      }),
    )
  },
})
