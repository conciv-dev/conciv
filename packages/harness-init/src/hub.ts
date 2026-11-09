import {execFile} from 'node:child_process'
import {z} from 'zod'
import {
  endHubOperation,
  hubConnections,
  lastHubRevocation,
  readHomeDb,
  recordHubConnection,
  removeHubConnection,
  takeHubOperation,
  withHomeDb,
  type HubOperation,
} from '@conciv/db'
import {INIT_HARNESS_IDS, type InitHarnessId} from '@conciv/protocol/harness-types'
import {initContributions} from './registry.js'

const RUN_TIMEOUT_MS = 30_000
const LEASE_CEILING_MS = 10 * 60_000
const BUSY = 'busy'
const ALREADY_EXISTS = /already exists/i
const ALREADY_REMOVED = /not found|no mcp server|no such|does not exist/i
const HarnessIdSchema = z.enum(INIT_HARNESS_IDS)

type HubOutcome = {ok: true; note?: string} | {ok: false; message: string}

type HubConnection = {harness: InitHarnessId; name: string; connectedAt: number}

type RunOutcome = {ok: boolean; output: string; message: string}

type Run = (argv: string[], timeout: number) => Promise<RunOutcome>

type Hub = {remove?: string[]}

export function createHubConnections(home: string, run: Run = runFile) {
  const list = (): HubConnection[] =>
    (readHomeDb(home, hubConnections) ?? []).flatMap((row) => {
      const parsed = HarnessIdSchema.safeParse(row.harness)
      const hub = parsed.success ? initContributions[parsed.data].hub : undefined
      if (!parsed.success || hub === undefined) return []
      return [{harness: parsed.data, name: hub.name, connectedAt: row.connectedAt}]
    })
  return {
    list,
    generation: (): number | null => {
      try {
        return readHomeDb(home, lastHubRevocation) ?? 0
      } catch {
        return null
      }
    },
    connect: async (harness: InitHarnessId, command: string[]): Promise<HubOutcome> => {
      const hub = initContributions[harness].hub
      if (hub === undefined) return {ok: false, message: `${harness} cannot connect to the conciv hub`}
      const generation = readHomeDb(home, lastHubRevocation) ?? 0
      const install = () =>
        installHub(hub, hub.add(command, {CONCIV_HOME: home}), run, () =>
          recordSince(home, harness, hub.name, generation),
        )
      const outcome = await underLease(home, harness, install)
      return outcome === BUSY ? {ok: false, message: `${busy(hub.name)}; try again in a moment`} : outcome
    },
    disconnect: async (harness: InitHarnessId): Promise<HubOutcome> => {
      const hub = initContributions[harness].hub
      if (hub === undefined) return {ok: false, message: `${harness} cannot connect to the conciv hub`}
      const forgotten = forget(home, harness)
      if (!forgotten.ok) return forgotten
      const remove = hub.remove
      if (remove === undefined) {
        return {
          ok: true,
          note: `${hub.name} keeps its conciv-hub entry in opencode.json; conciv refuses it until you reconnect.`,
        }
      }
      const outcome = await underLease(home, harness, () => uninstallHub(hub.name, remove, run))
      if (outcome !== BUSY) return outcome
      return {
        ok: true,
        note: `${busy(hub.name)}, so its conciv-hub entry stays for now; conciv refuses it until you reconnect.`,
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

async function installHub(hub: Hub, add: string[], run: Run, record: () => HubOutcome): Promise<HubOutcome> {
  const added = await run(add, RUN_TIMEOUT_MS)
  if (added.ok) return record()
  if (!ALREADY_EXISTS.test(added.output)) return {ok: false, message: added.message}
  if (hub.remove === undefined) return record()
  const removed = await run(hub.remove, RUN_TIMEOUT_MS)
  if (!removed.ok) return {ok: false, message: removed.message}
  const replaced = await run(add, RUN_TIMEOUT_MS)
  if (!replaced.ok) return {ok: false, message: replaced.message}
  return record()
}

async function uninstallHub(name: string, remove: string[], run: Run): Promise<HubOutcome> {
  const removed = await run(remove, RUN_TIMEOUT_MS)
  if (removed.ok || ALREADY_REMOVED.test(removed.output)) return {ok: true}
  return {
    ok: true,
    note: `${name} could not remove its conciv-hub entry (${removed.message}); conciv refuses it until you reconnect.`,
  }
}

async function underLease(
  home: string,
  harness: InitHarnessId,
  change: () => Promise<HubOutcome>,
): Promise<HubOutcome | typeof BUSY> {
  const operation = {harness, pid: process.pid, startedAt: Date.now()}
  const taken = leaseOf(home, operation)
  if (!taken.ok) return taken.outcome
  try {
    return await change()
  } finally {
    withHomeDb(home, (db) => endHubOperation(db, operation))
  }
}

function leaseOf(home: string, operation: HubOperation): {ok: true} | {ok: false; outcome: HubOutcome | typeof BUSY} {
  try {
    if (withHomeDb(home, (db) => takeHubOperation(db, operation, staleFor(operation.startedAt)))) return {ok: true}
    return {ok: false, outcome: BUSY}
  } catch (error) {
    return {ok: false, outcome: {ok: false, message: `conciv could not reach its home db: ${String(error)}`}}
  }
}

function staleFor(now: number): (held: HubOperation) => boolean {
  return (held) => !alive(held.pid) || now - held.startedAt > LEASE_CEILING_MS
}

function alive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    return error instanceof Error && 'code' in error && error.code === 'EPERM'
  }
}

function busy(name: string): string {
  return `${name} is still being (dis)connected`
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

function runFile(argv: string[], timeout: number): Promise<RunOutcome> {
  const [bin, ...args] = argv
  if (bin === undefined) return Promise.resolve({ok: false, output: '', message: 'the harness gave no command to run'})
  return new Promise((resolve) => {
    execFile(bin, args, {timeout, env: process.env}, (error, stdout, stderr) => {
      const message = stderr.trim() || stdout.trim() || (error?.message ?? '')
      resolve({ok: error === null, output: `${stdout}\n${stderr}`, message})
    })
  })
}

function recordSince(home: string, harness: InitHarnessId, name: string, generation: number): HubOutcome {
  try {
    if (withHomeDb(home, (db) => recordHubConnection(db, harness, Date.now(), generation))) return {ok: true}
    return {ok: false, message: `${name} was disconnected while connecting; connect again`}
  } catch (error) {
    return {ok: false, message: `conciv could not record the connection: ${String(error)}`}
  }
}

function forget(home: string, harness: InitHarnessId): HubOutcome {
  try {
    withHomeDb(home, (db) => removeHubConnection(db, harness))
    return {ok: true}
  } catch (error) {
    return {ok: false, message: `conciv could not forget the connection: ${String(error)}`}
  }
}
