import type {InitHarnessId} from '@conciv/protocol/harness-types'
import cliManifest from '../package.json' with {type: 'json'}

export function serveArgv(agent: InitHarnessId): string[] {
  return ['npx', '-y', `@conciv/cli@${cliManifest.version}`, 'mcp', 'serve', '--agent', agent]
}
