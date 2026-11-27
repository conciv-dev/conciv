import {spawn, type ChildProcessWithoutNullStreams} from 'node:child_process'
import {randomUUID} from 'node:crypto'
import {once} from 'node:events'
import {createRequire} from 'node:module'
import {createInterface} from 'node:readline'
import {z} from 'zod'
import {test as base} from '@conciv/backend-test-utils'
import {createMCPClient, type MCPClient} from '@tanstack/ai-mcp'
import {stdioTransport} from '@tanstack/ai-mcp/stdio'

export type TaskHub = {request: (method: string, params: Record<string, unknown>) => Promise<unknown>}

const TASK_CAPABLE_ENVELOPE = {
  'io.modelcontextprotocol/protocolVersion': '2026-07-28',
  'io.modelcontextprotocol/clientCapabilities': {extensions: {'io.modelcontextprotocol/tasks': {}}},
}

const AnswerSchema = z.object({
  id: z.string(),
  result: z.unknown().optional(),
  error: z.object({message: z.string()}).optional(),
})

function hubArgs(): string[] {
  return [createRequire(import.meta.url).resolve('@conciv/cli/bin'), 'mcp', 'serve', '--agent', 'claude']
}

function taskCapableHub(child: ChildProcessWithoutNullStreams): TaskHub {
  child.stderr.resume()
  const lines = createInterface({input: child.stdout})
  const exited = once(child, 'exit').then(([code]) => {
    throw new Error(`the hub exited (${String(code)}) before it answered`)
  })
  exited.catch(() => undefined)
  return {
    request: async (method, params) => {
      const id = randomUUID()
      const answered = new Promise<unknown>((resolve, reject) => {
        const read = (line: string): void => {
          const answer = AnswerSchema.safeParse(JSON.parse(line))
          if (!answer.success || answer.data.id !== id) return
          lines.off('line', read)
          const failure = answer.data.error
          if (failure !== undefined) {
            reject(new Error(`${method} failed: ${failure.message}`))
            return
          }
          resolve(answer.data.result)
        }
        lines.on('line', read)
      })
      child.stdin.write(
        `${JSON.stringify({jsonrpc: '2.0', id, method, params: {...params, _meta: TASK_CAPABLE_ENVELOPE}})}\n`,
      )
      return Promise.race([answered, exited])
    },
  }
}

export const test = base.extend<{
  hub: (home: string) => Promise<MCPClient>
  taskHub: (home: string) => TaskHub
}>({
  hub: async ({task: _task}, use) => {
    const clients: MCPClient[] = []
    await use(async (home) => {
      const client = await createMCPClient({
        transport: stdioTransport({
          command: process.execPath,
          args: hubArgs(),
          env: {CONCIV_HOME: home, HOME: home},
        }),
      })
      clients.push(client)
      return client
    })
    await Promise.all(clients.map((client) => client.close()))
  },
  taskHub: async ({task: _task}, use) => {
    const children: ChildProcessWithoutNullStreams[] = []
    await use((home) => {
      const child = spawn(process.execPath, hubArgs(), {
        env: {CONCIV_HOME: home, HOME: home, PATH: process.env.PATH ?? ''},
      })
      children.push(child)
      return taskCapableHub(child)
    })
    await Promise.all(
      children.map(async (child) => {
        if (child.exitCode !== null) return
        const exit = once(child, 'exit')
        child.stdin.end()
        await exit
      }),
    )
  },
})
