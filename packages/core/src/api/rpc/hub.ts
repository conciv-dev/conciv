import {homedir} from 'node:os'
import {Config, Effect} from 'effect'
import {detectHarnesses} from '@conciv/harness-init/detect'
import {createHubConnections, makeChildRun} from '@conciv/harness-init/hub'
import {initContributions} from '@conciv/harness-init/registry'
import type {HubAgents} from '@conciv/protocol/chat-types'
import type {InitHarnessId} from '@conciv/protocol/harness-types'
import {logError} from '../../lib/debug.js'
import {homeDbReads} from '../../lib/home-db-watch.js'
import corePackage from '../../../package.json' with {type: 'json'}

const DetectionEnvConfig = Config.all({
  PATH: Config.String('PATH').pipe(Config.withDefault('')),
  HOME: Config.NonEmptyString('HOME').pipe(Config.orElse(() => Config.succeed(homedir()))),
})

type HubConnections = ReturnType<typeof createHubConnections>

export const makeHubInstaller = Effect.fn('core.hub.makeInstaller')(function* (
  home: string,
  childEnv: NodeJS.ProcessEnv,
) {
  const detectionEnv = yield* DetectionEnvConfig
  return createHubInstaller(home, detectionEnv, childEnv)
})

export function createHubInstaller(
  home: string,
  detectionEnv: {PATH: string; HOME: string},
  childEnv: NodeJS.ProcessEnv,
) {
  const connections = (): HubConnections => createHubConnections(home, makeChildRun(childEnv))
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
    const installs = detectHarnesses(detectionEnv).flatMap(({id}) => {
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
    agents: (signal: AbortSignal | undefined): AsyncGenerator<HubAgents, void, void> =>
      homeDbReads(home, signal, agents),
    connect: (harness: InitHarnessId) => connections().connect(harness, hubCommand(harness)),
    disconnect: (harness: InitHarnessId) => connections().disconnect(harness),
    refusal: (client: string | null): string | null => connections().refusal(client),
  }
}

function hubCommand(harness: InitHarnessId): string[] {
  return ['npx', '-y', `@conciv/cli@${corePackage.version}`, 'mcp', 'serve', '--agent', harness]
}
