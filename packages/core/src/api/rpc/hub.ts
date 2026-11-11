import {mkdir, stat, watch} from 'node:fs/promises'
import {homedir} from 'node:os'
import {join} from 'node:path'
import {isEqual} from 'es-toolkit'
import {z} from 'zod'
import {concivHome} from '@conciv/db'
import {detectHarnesses} from '@conciv/harness-init/detect'
import {createHubConnections} from '@conciv/harness-init/hub'
import {initContributions} from '@conciv/harness-init/registry'
import type {HubAgents} from '@conciv/protocol/chat-types'
import type {InitHarnessId} from '@conciv/protocol/harness-types'
import {logError} from '../../lib/debug.js'
import corePackage from '../../../package.json' with {type: 'json'}

const DetectionEnvSchema = z.object({
  PATH: z.string().catch(''),
  HOME: z.string().min(1).catch(homedir()),
})

const HOME_DB = 'home.db'

type HubConnections = ReturnType<typeof createHubConnections>

export function createHubInstaller(homeDir: string | undefined) {
  const home = (): string => concivHome({homeDir, env: process.env})
  const connections = (): HubConnections => createHubConnections(home())
  const connected = (): ReturnType<HubConnections['list']> => {
    try {
      return connections().list()
    } catch (error) {
      logError(`[core] the conciv home db could not be read: ${String(error)}`)
      return []
    }
  }
  const agents = (): HubAgents => {
    const present = connected()
    const installs = detectHarnesses(DetectionEnvSchema.parse(process.env)).flatMap(({id}) => {
      const hub = initContributions[id].hub
      if (hub === undefined || present.some((connection) => connection.harness === id)) return []
      return [{harnessId: id, name: hub.name}]
    })
    return {
      installs,
      connections: present.map((connection) => ({harnessId: connection.harness, name: connection.name})),
    }
  }
  return {
    async *agents(signal: AbortSignal | undefined): AsyncGenerator<HubAgents, void, void> {
      const folder = home()
      await mkdir(folder, {recursive: true, mode: 0o700})
      const changes = watch(folder, {signal})
      let written = await homeDbStamp(folder)
      let current = agents()
      yield current
      try {
        for await (const change of changes) {
          if (change.filename?.startsWith(HOME_DB) === false) continue
          const stamp = await homeDbStamp(folder)
          if (stamp === written) continue
          written = stamp
          const next = agents()
          if (isEqual(next, current)) continue
          current = next
          yield current
        }
      } catch (error) {
        if (signal?.aborted === true) return
        throw error
      }
    },
    connect: (harness: InitHarnessId) => connections().connect(harness, hubCommand(harness)),
    disconnect: (harness: InitHarnessId) => connections().disconnect(harness),
    generation: (): number | null => {
      const generation = connections().generation()
      if (generation === null)
        logError('[core] the conciv home db could not be read, so every outside Allow asks again')
      return generation
    },
    refusal: (client: string | null): string | null => connections().refusal(client),
  }
}

function hubCommand(harness: InitHarnessId): string[] {
  return ['npx', '-y', `@conciv/cli@${corePackage.version}`, 'mcp', 'serve', '--agent', harness]
}

async function homeDbStamp(folder: string): Promise<string> {
  const files = await Promise.all(
    [HOME_DB, `${HOME_DB}-wal`].map((file) =>
      stat(join(folder, file)).then(
        (found) => `${found.mtimeMs}:${found.size}`,
        (error: unknown) => {
          if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return 'absent'
          throw error
        },
      ),
    ),
  )
  return files.join('|')
}
