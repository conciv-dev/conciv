import {execFile} from 'node:child_process'
import {homedir} from 'node:os'
import {z} from 'zod'
import {concivHome, hubConnections, recordHubConnection, withHomeDb} from '@conciv/db'
import {getHarness} from '@conciv/harness'
import {detectHarnesses} from '@conciv/harness-init/detect'
import {initContributions} from '@conciv/harness-init/registry'
import type {InitHarnessId} from '@conciv/protocol/harness-types'
import {logError} from '../../lib/debug.js'
import corePackage from '../../../package.json' with {type: 'json'}

const HUB_COMMAND = ['npx', '-y', `@conciv/cli@${corePackage.version}`, 'mcp']
const INSTALL_TIMEOUT_MS = 30_000
const ALREADY_EXISTS = /already exists/i

const DetectionEnvSchema = z.object({
  PATH: z.string().catch(''),
  HOME: z.string().min(1).catch(homedir()),
})

type ConnectOutcome = {ok: true} | {ok: false; message: string}

export function createHubInstaller() {
  return {
    installs: (): Array<{harnessId: InitHarnessId; name: string}> => {
      const connected = readConnections(process.env)
      return detectHarnesses(DetectionEnvSchema.parse(process.env))
        .filter(({id}) => initContributions[id].hub !== undefined && !connected.includes(id))
        .map(({id}) => ({harnessId: id, name: getHarness(id)?.displayName ?? id}))
    },
    connect: async (harness: InitHarnessId): Promise<ConnectOutcome> => {
      const argv = initContributions[harness].hub?.add(HUB_COMMAND) ?? []
      const [bin, ...args] = argv
      if (bin === undefined) return {ok: false, message: `${harness} cannot connect to the conciv hub`}
      const ran = await run(bin, args, process.env)
      if (!ran.ok && !ALREADY_EXISTS.test(ran.output)) return {ok: false, message: ran.message}
      return record(harness, process.env)
    },
  }
}

function readConnections(env: NodeJS.ProcessEnv): string[] {
  try {
    return withHomeDb(concivHome({env}), hubConnections)
  } catch (error) {
    logError(`[core] the conciv home db could not be read: ${String(error)}`)
    return []
  }
}

function run(
  bin: string,
  args: string[],
  env: NodeJS.ProcessEnv,
): Promise<{ok: boolean; output: string; message: string}> {
  return new Promise((resolve) => {
    execFile(bin, args, {timeout: INSTALL_TIMEOUT_MS, env}, (error, stdout, stderr) => {
      const message = stderr.trim() || stdout.trim() || (error?.message ?? '')
      resolve({ok: error === null, output: `${stdout}\n${stderr}`, message})
    })
  })
}

function record(harness: InitHarnessId, env: NodeJS.ProcessEnv): ConnectOutcome {
  try {
    withHomeDb(concivHome({env}), (db) => recordHubConnection(db, harness, Date.now()))
    return {ok: true}
  } catch (error) {
    return {ok: false, message: `conciv could not record the connection: ${String(error)}`}
  }
}
