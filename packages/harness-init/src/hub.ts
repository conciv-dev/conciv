import {execFile} from 'node:child_process'
import {z} from 'zod'
import {
  hubConnections,
  lastHubRevocation,
  readHomeDb,
  recordHubConnection,
  removeHubConnection,
  withHomeDb,
} from '@conciv/db'
import {INIT_HARNESS_IDS, type InitHarnessId} from '@conciv/protocol/harness-types'
import {initContributions} from './registry.js'

const RUN_TIMEOUT_MS = 30_000
const ALREADY_EXISTS = /already exists/i
const ALREADY_REMOVED = /not found|no mcp server|no such|does not exist/i
const HarnessIdSchema = z.enum(INIT_HARNESS_IDS)

type HubOutcome = {ok: true; note?: string} | {ok: false; message: string}

type HubConnection = {harness: InitHarnessId; name: string; connectedAt: number}

type RunOutcome = {ok: boolean; output: string; message: string}

export function createHubConnections(home: string, run: (argv: string[]) => Promise<RunOutcome> = runFile) {
  const list = (): HubConnection[] =>
    (readHomeDb(home, hubConnections) ?? []).flatMap((row) => {
      const parsed = HarnessIdSchema.safeParse(row.harness)
      const hub = parsed.success ? initContributions[parsed.data].hub : undefined
      if (!parsed.success || hub === undefined) return []
      return [{harness: parsed.data, name: hub.name, connectedAt: row.connectedAt}]
    })
  return {
    list,
    revokedAt: (): number => readHomeDb(home, lastHubRevocation) ?? 0,
    connect: async (harness: InitHarnessId, command: string[]): Promise<HubOutcome> => {
      const hub = initContributions[harness].hub
      if (hub === undefined) return {ok: false, message: `${harness} cannot connect to the conciv hub`}
      const add = hub.add(command, {CONCIV_HOME: home})
      const added = await run(add)
      if (added.ok) return record(home, harness)
      if (!ALREADY_EXISTS.test(added.output)) return {ok: false, message: added.message}
      if (hub.remove === undefined) return record(home, harness)
      const removed = await run(hub.remove)
      if (!removed.ok) return {ok: false, message: removed.message}
      const replaced = await run(add)
      if (!replaced.ok) return {ok: false, message: replaced.message}
      return record(home, harness)
    },
    disconnect: async (harness: InitHarnessId): Promise<HubOutcome> => {
      const hub = initContributions[harness].hub
      if (hub === undefined) return {ok: false, message: `${harness} cannot connect to the conciv hub`}
      const forgotten = forget(home, harness)
      if (!forgotten.ok) return forgotten
      if (hub.remove === undefined) {
        return {
          ok: true,
          note: `${hub.name} keeps its conciv-hub entry in opencode.json; conciv refuses it until you reconnect.`,
        }
      }
      const removed = await run(hub.remove)
      if (removed.ok || ALREADY_REMOVED.test(removed.output)) return {ok: true}
      return {
        ok: true,
        note: `${hub.name} could not remove its conciv-hub entry (${removed.message}); conciv refuses it until you reconnect.`,
      }
    },
    refusal: (client: string | null): string | null => {
      const parsed = HarnessIdSchema.safeParse(client)
      if (!parsed.success) return null
      const hub = initContributions[parsed.data].hub
      if (hub === undefined) return null
      const known = readable(list)
      if (!known.ok) return `conciv could not read its home folder ${home} to check ${hub.name}: ${known.message}`
      if (known.connections.some((connection) => connection.harness === parsed.data)) return null
      return `${hub.name} is disconnected from conciv; reconnect it from the conciv widget or run \`conciv mcp connect ${parsed.data}\``
    },
  }
}

function readable(
  list: () => HubConnection[],
): {ok: true; connections: HubConnection[]} | {ok: false; message: string} {
  try {
    return {ok: true, connections: list()}
  } catch (error) {
    return {ok: false, message: String(error)}
  }
}

function runFile(argv: string[]): Promise<RunOutcome> {
  const [bin, ...args] = argv
  if (bin === undefined) return Promise.resolve({ok: false, output: '', message: 'the harness gave no command to run'})
  return new Promise((resolve) => {
    execFile(bin, args, {timeout: RUN_TIMEOUT_MS, env: process.env}, (error, stdout, stderr) => {
      const message = stderr.trim() || stdout.trim() || (error?.message ?? '')
      resolve({ok: error === null, output: `${stdout}\n${stderr}`, message})
    })
  })
}

function record(home: string, harness: InitHarnessId): HubOutcome {
  try {
    withHomeDb(home, (db) => recordHubConnection(db, harness, Date.now()))
    return {ok: true}
  } catch (error) {
    return {ok: false, message: `conciv could not record the connection: ${String(error)}`}
  }
}

function forget(home: string, harness: InitHarnessId): HubOutcome {
  try {
    withHomeDb(home, (db) => removeHubConnection(db, harness, Date.now()))
    return {ok: true}
  } catch (error) {
    return {ok: false, message: `conciv could not forget the connection: ${String(error)}`}
  }
}
