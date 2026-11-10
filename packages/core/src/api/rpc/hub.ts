import {homedir} from 'node:os'
import {z} from 'zod'
import {concivHome} from '@conciv/db'
import {detectHarnesses} from '@conciv/harness-init/detect'
import {createHubConnections} from '@conciv/harness-init/hub'
import {initContributions} from '@conciv/harness-init/registry'
import type {InitHarnessId} from '@conciv/protocol/harness-types'
import {logError} from '../../lib/debug.js'
import corePackage from '../../../package.json' with {type: 'json'}

const DetectionEnvSchema = z.object({
  PATH: z.string().catch(''),
  HOME: z.string().min(1).catch(homedir()),
})

type HubConnections = ReturnType<typeof createHubConnections>

export function createHubInstaller(homeDir: string | undefined) {
  const connections = (): HubConnections => createHubConnections(concivHome({homeDir, env: process.env}))
  const connected = (): ReturnType<HubConnections['list']> => {
    try {
      return connections().list()
    } catch (error) {
      logError(`[core] the conciv home db could not be read: ${String(error)}`)
      return []
    }
  }
  return {
    installs: (): Array<{harnessId: InitHarnessId; name: string}> => {
      const present = connected()
      return detectHarnesses(DetectionEnvSchema.parse(process.env)).flatMap(({id}) => {
        const hub = initContributions[id].hub
        if (hub === undefined || present.some((connection) => connection.harness === id)) return []
        return [{harnessId: id, name: hub.name}]
      })
    },
    connections: (): Array<{harnessId: InitHarnessId; name: string}> =>
      connected().map((connection) => ({harnessId: connection.harness, name: connection.name})),
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
