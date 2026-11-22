import {createRequire} from 'node:module'
import {test as base} from 'vitest'
import {createMCPClient, type MCPClient} from '@tanstack/ai-mcp'
import {stdioTransport} from '@tanstack/ai-mcp/stdio'

export const test = base.extend<{
  hub: (home: string) => Promise<MCPClient>
}>({
  hub: async ({task: _task}, use) => {
    const clients: MCPClient[] = []
    await use(async (home) => {
      const client = await createMCPClient({
        transport: stdioTransport({
          command: process.execPath,
          args: [createRequire(import.meta.url).resolve('@conciv/cli/bin'), 'mcp', 'serve', '--agent', 'claude'],
          env: {CONCIV_HOME: home, HOME: home},
        }),
      })
      clients.push(client)
      return client
    })
    await Promise.all(clients.map((client) => client.close()))
  },
})
