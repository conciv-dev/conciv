import {readFile} from 'node:fs/promises'
import {dirname, join} from 'node:path'
import {z} from 'zod'
import {differenceBy, partition} from 'es-toolkit'
import {checkEngines, concivHome} from '@conciv/db'
import type {SessionId} from '@conciv/types/chat-types'
import {concivStateDir} from '@conciv/types/state-types'
import {userFailure} from './failure.js'
import {askAgain, askTabs, ENGINE_READ_MS, PROBE_MS, silence, type Silent, type TabAsk} from './engine-read.js'

const DEFAULT_ENGINE_PORT = '5173'

const ServerStateSchema = z.object({
  port: z.number().int().min(1).max(65535),
  token: z.string().min(1).optional(),
})

type ServerState = z.infer<typeof ServerStateSchema> & {stateDir: string}

async function recordedState(directory: string): Promise<ServerState | undefined> {
  const stateDir = concivStateDir(directory)
  try {
    const parsed = ServerStateSchema.safeParse(JSON.parse(await readFile(join(stateDir, 'server.json'), 'utf8')))
    return parsed.success ? {...parsed.data, stateDir} : undefined
  } catch {
    return undefined
  }
}

export async function discoveredEngine(directory: string): Promise<ServerState | undefined> {
  const state = await recordedState(directory)
  if (state !== undefined) return state
  const parent = dirname(directory)
  if (parent === directory) return undefined
  return discoveredEngine(parent)
}

type EngineAddress = {origin: string; token: string | undefined}

type EngineOrigin = EngineAddress & {outside: boolean}

const SILENT_HINT =
  'a dev server still starting answers once it is ready; run the command again, or restart the dev server if it stays silent.'

export async function engineOrigin(cwd: string, env: NodeJS.ProcessEnv, tab: SessionId | null): Promise<EngineOrigin> {
  const home = concivHome({env})
  if (tab !== null) return {...(await tabOwner(home, tab)), outside: true}
  const discovered = await discoveredEngine(cwd)
  const port = env.CONCIV_PORT ?? discovered?.port
  const token = env.CONCIV_TOKEN ?? discovered?.token
  if (port !== undefined) return {...scopedOrigin(port, token), outside: false}
  const first = await checkEngines(home, {timeoutMs: PROBE_MS})
  if (first.live.length === 0 && first.unreachable.length === 0) {
    return {...scopedOrigin(DEFAULT_ENGINE_PORT, token), outside: false}
  }
  const checked = first.live.length > 0 ? first : await askAgain(home, first.unreachable)
  const latest = checked.live.at(-1)
  if (latest === undefined) {
    throw userFailure(`no conciv dev server answered: ${silence(checked.unreachable)}.`, {hint: SILENT_HINT})
  }
  return {origin: latest.apiBase, token: latest.token, outside: true}
}

export function scopedOrigin(port: string | number, token: string | undefined): EngineAddress {
  return {origin: `http://127.0.0.1:${port}`, token}
}

async function tabOwner(home: string, tab: SessionId): Promise<EngineAddress> {
  const first = await checkEngines(home, {timeoutMs: PROBE_MS})
  if (first.live.length === 0 && first.unreachable.length === 0) {
    throw userFailure(
      `no conciv dev server is running; start one and open its page (conciv home folder read: ${home}).`,
      {hint: 'start the dev server of a project set up with conciv init, open its page, then run the command again.'},
    )
  }
  const answers = await askTabs(first.live, tab, PROBE_MS)
  const [settled, unsettled] = partition(answers, (answer) => answer.answer !== null)
  if (answers.some(isOpen) || (first.unreachable.length === 0 && unsettled.length === 0)) {
    return ownerAmong(tab, answers, first.unreachable)
  }
  const [second, retried] = await Promise.all([
    askAgain(home, first.unreachable),
    askTabs(
      unsettled.map((answer) => answer.row),
      tab,
      ENGINE_READ_MS,
    ),
  ])
  const later = await askTabs(
    differenceBy(second.live, first.live, (row) => row.id),
    tab,
    ENGINE_READ_MS,
  )
  return ownerAmong(tab, [...settled, ...retried, ...later], second.unreachable)
}

function isOpen(asked: TabAsk): boolean {
  return asked.answer?.open === true
}

function ownerAmong(tab: SessionId, answers: TabAsk[], silent: Silent): EngineAddress {
  const owners = answers.filter(isOpen).map((answer) => answer.row)
  const [owner, ...others] = owners
  if (owner !== undefined && others.length === 0) return {origin: owner.apiBase, token: owner.token}
  if (owner !== undefined) {
    const roots = owners.map((row) => row.root).join(', ')
    throw userFailure(`tab ${tab} is open in ${owners.length} running conciv dev servers: ${roots}.`, {
      hint: 'stop all but one of them, or reload the page so only one server holds the tab.',
    })
  }
  if (answers.length === 0) throw userFailure(`cannot find tab ${tab}: ${silence(silent)}.`, {hint: SILENT_HINT})
  const failed = [
    ...answers.flatMap((answer) =>
      answer.answer === null ? [{root: answer.row.root, error: failureText(answer.failure)}] : [],
    ),
    ...silent,
  ]
  const unanswered = failed.length === 0 ? '' : `; ${silence(failed)}`
  throw userFailure(`tab ${tab} is not open in any of the ${answers.length} running conciv dev servers${unanswered}.`, {
    hint: 'conciv tools tabs lists the open tabs; open the page again if it was closed.',
  })
}

function failureText(failure: unknown): string {
  return failure instanceof Error ? failure.message : String(failure)
}
