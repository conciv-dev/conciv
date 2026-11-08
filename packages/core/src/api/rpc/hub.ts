import {execFile} from 'node:child_process'
import {homedir} from 'node:os'
import {z} from 'zod'
import {concivHome, hubConnections, recordHubConnection, removeHubConnection, withHomeDb} from '@conciv/db'
import {getHarness} from '@conciv/harness'
import {detectHarnesses} from '@conciv/harness-init/detect'
import {initContributions} from '@conciv/harness-init/registry'
import {INIT_HARNESS_IDS, type InitHarnessId} from '@conciv/protocol/harness-types'
import {logError} from '../../lib/debug.js'
import corePackage from '../../../package.json' with {type: 'json'}

const HUB_COMMAND = ['npx', '-y', `@conciv/cli@${corePackage.version}`, 'mcp']
const INSTALL_TIMEOUT_MS = 30_000
const ALREADY_EXISTS = /already exists/i
const ALREADY_REMOVED = /not found|no mcp server|no such|does not exist/i
const HarnessIdSchema = z.enum(INIT_HARNESS_IDS)

const DetectionEnvSchema = z.object({
  PATH: z.string().catch(''),
  HOME: z.string().min(1).catch(homedir()),
})

type ConnectOutcome = {ok: true} | {ok: false; message: string}

type RunOutcome = {ok: boolean; output: string; message: string}

export function createHubInstaller(homeDir: string | undefined) {
  const home = (): string => concivHome({homeDir, env: process.env})
  return {
    installs: (): Array<{harnessId: InitHarnessId; name: string}> => {
      const connected = readConnections(home())
      return detectHarnesses(DetectionEnvSchema.parse(process.env))
        .filter(({id}) => initContributions[id].hub !== undefined && !connected.includes(id))
        .map(({id}) => ({harnessId: id, name: displayName(id)}))
    },
    connections: (): Array<{harnessId: InitHarnessId; name: string; canDisconnect: boolean}> =>
      readConnections(home())
        .flatMap((id) => {
          const parsed = HarnessIdSchema.safeParse(id)
          return parsed.success ? [parsed.data] : []
        })
        .map((id) => ({
          harnessId: id,
          name: displayName(id),
          canDisconnect: initContributions[id].hub?.remove !== undefined,
        })),
    connect: async (harness: InitHarnessId): Promise<ConnectOutcome> => {
      const hub = initContributions[harness].hub
      if (hub === undefined) return {ok: false, message: `${harness} cannot connect to the conciv hub`}
      const add = hub.add(HUB_COMMAND, {CONCIV_HOME: home()})
      const added = await run(add)
      if (added.ok) return record(harness, home())
      if (!ALREADY_EXISTS.test(added.output)) return {ok: false, message: added.message}
      if (hub.remove === undefined) return record(harness, home())
      const replaced = await replace(hub.remove, add)
      if (!replaced.ok) return {ok: false, message: replaced.message}
      return record(harness, home())
    },
    disconnect: async (harness: InitHarnessId): Promise<ConnectOutcome> => {
      const remove = initContributions[harness].hub?.remove
      if (remove === undefined) return {ok: false, message: `${harness} cannot disconnect from the conciv hub`}
      const removed = await run(remove)
      if (!removed.ok && !ALREADY_REMOVED.test(removed.output)) return {ok: false, message: removed.message}
      return forget(harness, home())
    },
  }
}

function displayName(id: InitHarnessId): string {
  return getHarness(id)?.displayName ?? id
}

function readConnections(home: string): string[] {
  try {
    return withHomeDb(home, hubConnections)
  } catch (error) {
    logError(`[core] the conciv home db could not be read: ${String(error)}`)
    return []
  }
}

async function replace(remove: string[], add: string[]): Promise<RunOutcome> {
  const removed = await run(remove)
  if (!removed.ok) return removed
  return run(add)
}

function run(argv: string[]): Promise<RunOutcome> {
  const [bin, ...args] = argv
  if (bin === undefined) return Promise.resolve({ok: false, output: '', message: 'the harness gave no command to run'})
  return new Promise((resolve) => {
    execFile(bin, args, {timeout: INSTALL_TIMEOUT_MS, env: process.env}, (error, stdout, stderr) => {
      const message = stderr.trim() || stdout.trim() || (error?.message ?? '')
      resolve({ok: error === null, output: `${stdout}\n${stderr}`, message})
    })
  })
}

function record(harness: InitHarnessId, home: string): ConnectOutcome {
  try {
    withHomeDb(home, (db) => recordHubConnection(db, harness, Date.now()))
    return {ok: true}
  } catch (error) {
    return {ok: false, message: `conciv could not record the connection: ${String(error)}`}
  }
}

function forget(harness: InitHarnessId, home: string): ConnectOutcome {
  try {
    withHomeDb(home, (db) => removeHubConnection(db, harness))
    return {ok: true}
  } catch (error) {
    return {ok: false, message: `conciv could not forget the connection: ${String(error)}`}
  }
}
