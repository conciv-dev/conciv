import {readFileSync} from 'node:fs'
import {dirname, join} from 'node:path'
import {z} from 'zod'
import {differenceBy, partition} from 'es-toolkit'
import {checkEngines, concivHome, type EngineRow} from '@conciv/db'
import {makeRpcClient} from '@conciv/contract'
import type {SessionId} from '@conciv/protocol/chat-types'
import {concivStateDir} from '@conciv/protocol/state-types'
import {userFailure} from './failure.js'
import {ENGINE_READ_MS} from './engine-read.js'

const DEFAULT_ENGINE_PORT = '5173'

const PROBE_MS = 300

const ServerStateSchema = z.object({
  port: z.number().int().min(1).max(65535),
  token: z.string().min(1).optional(),
})

type ServerState = z.infer<typeof ServerStateSchema> & {stateDir: string}

function recordedState(directory: string): ServerState | undefined {
  const stateDir = concivStateDir(directory)
  try {
    const parsed = ServerStateSchema.safeParse(JSON.parse(readFileSync(join(stateDir, 'server.json'), 'utf8')))
    return parsed.success ? {...parsed.data, stateDir} : undefined
  } catch {
    return undefined
  }
}

export function discoveredEngine(directory: string): ServerState | undefined {
  const state = recordedState(directory)
  if (state !== undefined) return state
  const parent = dirname(directory)
  if (parent === directory) return undefined
  return discoveredEngine(parent)
}

type EngineOrigin = {origin: string; outside: boolean}

type Checked = Awaited<ReturnType<typeof checkEngines>>

type Silent = Checked['unreachable']

type TabAnswer = {row: EngineRow; open: boolean; error: string | null}

const SILENT_HINT =
  'a dev server still starting answers once it is ready; run the command again, or restart the dev server if it stays silent.'

export async function engineOrigin(cwd: string, env: NodeJS.ProcessEnv, tab: SessionId | null): Promise<EngineOrigin> {
  const home = concivHome({env})
  if (tab !== null) return {origin: await tabOwner(home, tab), outside: true}
  const discovered = discoveredEngine(cwd)
  const port = env.CONCIV_PORT ?? discovered?.port
  const token = env.CONCIV_TOKEN ?? discovered?.token
  if (port !== undefined) return {origin: scopedOrigin(port, token), outside: false}
  const first = await checkEngines(home, {timeoutMs: PROBE_MS})
  if (first.live.length === 0 && first.unreachable.length === 0) {
    return {origin: scopedOrigin(DEFAULT_ENGINE_PORT, token), outside: false}
  }
  const checked = first.live.length > 0 ? first : await askAgain(home, first.unreachable)
  const latest = checked.live.at(-1)
  if (latest === undefined) {
    throw userFailure(`no conciv dev server answered: ${silence(checked.unreachable)}.`, {hint: SILENT_HINT})
  }
  return {origin: latest.apiBase, outside: true}
}

export function scopedOrigin(port: string | number, token: string | undefined): string {
  const origin = `http://127.0.0.1:${port}`
  return token === undefined ? origin : `${origin}/t/${token}`
}

function askAgain(home: string, silent: Silent): Promise<Checked> {
  return checkEngines(home, {timeoutMs: ENGINE_READ_MS, roots: silent.map((entry) => entry.root)})
}

function silence(silent: Silent): string {
  return silent.map((entry) => `${entry.root} did not answer (${entry.error})`).join('; ')
}

async function tabOwner(home: string, tab: SessionId): Promise<string> {
  const first = await checkEngines(home, {timeoutMs: PROBE_MS})
  if (first.live.length === 0 && first.unreachable.length === 0) {
    throw userFailure(
      `no conciv dev server is running; start one and open its page (conciv home folder read: ${home}).`,
      {hint: 'start the dev server of a project set up with conciv init, open its page, then run the command again.'},
    )
  }
  const answers = await tabAnswers(first.live, tab, PROBE_MS)
  const [settled, unsettled] = partition(answers, (answer) => answer.error === null)
  if (answers.some((answer) => answer.open) || (first.unreachable.length === 0 && unsettled.length === 0)) {
    return ownerAmong(tab, answers, first.unreachable)
  }
  const [second, retried] = await Promise.all([
    askAgain(home, first.unreachable),
    tabAnswers(
      unsettled.map((answer) => answer.row),
      tab,
      ENGINE_READ_MS,
    ),
  ])
  const later = await tabAnswers(
    differenceBy(second.live, first.live, (row) => row.id),
    tab,
    ENGINE_READ_MS,
  )
  return ownerAmong(tab, [...settled, ...retried, ...later], second.unreachable)
}

function tabAnswers(rows: EngineRow[], tab: SessionId, timeoutMs: number): Promise<TabAnswer[]> {
  return Promise.all(
    rows.map((row) =>
      holdsTab(row, tab, timeoutMs).then(
        (open) => ({row, open, error: null}),
        (error: unknown) => ({row, open: false, error: error instanceof Error ? error.message : String(error)}),
      ),
    ),
  )
}

function ownerAmong(tab: SessionId, answers: TabAnswer[], silent: Silent): string {
  const owners = answers.filter((answer) => answer.open).map((answer) => answer.row)
  const [owner, ...others] = owners
  if (owner !== undefined && others.length === 0) return owner.apiBase
  if (owner !== undefined) {
    const roots = owners.map((row) => row.root).join(', ')
    throw userFailure(`tab ${tab} is open in ${owners.length} running conciv dev servers: ${roots}.`, {
      hint: 'stop all but one of them, or reload the page so only one server holds the tab.',
    })
  }
  if (answers.length === 0) throw userFailure(`cannot find tab ${tab}: ${silence(silent)}.`, {hint: SILENT_HINT})
  const failed = [
    ...answers.flatMap((answer) => (answer.error === null ? [] : [{root: answer.row.root, error: answer.error}])),
    ...silent,
  ]
  const unanswered = failed.length === 0 ? '' : `; ${silence(failed)}`
  throw userFailure(`tab ${tab} is not open in any of the ${answers.length} running conciv dev servers${unanswered}.`, {
    hint: 'conciv tools tabs lists the open tabs; open the page again if it was closed.',
  })
}

async function holdsTab(row: EngineRow, tab: SessionId, timeoutMs: number): Promise<boolean> {
  return (await makeRpcClient(row.apiBase).tabs.get({sessionId: tab}, {signal: AbortSignal.timeout(timeoutMs)})).open
}
