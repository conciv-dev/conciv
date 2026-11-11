import {and, desc, eq, inArray} from 'drizzle-orm'
import {z} from 'zod'
import type {TranscriptUsage} from '@conciv/protocol/harness-types'
import {tokenUsageToSnapshot} from '@conciv/protocol/usage-types'
import type {ToolRequest} from '@conciv/extension'
import {RUN_VERDICTS} from '../../shared/run-verdicts.js'
import type {openStore} from './open-store.js'
import {storeTables} from './store-tables.js'
import {provenanceOf} from './commands/provenance.js'

export function createSessionRuns(input: {
  orm: ReturnType<typeof openStore>['orm']
  cwd: string
  extensionDir: string
  harness: (sessionId: string) => string
  transcript: (sessionId: string, harnessSessionId: string | null) => Promise<TranscriptUsage | null>
}) {
  const {orm, cwd, extensionDir} = input
  const {runs, rounds} = storeTables
  const held = new Map<string, {harnessSessionId: string | null; run: Promise<number>}>()
  const opened: {last: {sessionId: string; run: Promise<number>} | null} = {last: null}

  async function inserted(request: RunRequest): Promise<number> {
    const external = request.harnessSessionId !== undefined
    const [row] = await orm
      .insert(runs)
      .values({
        session: request.sessionId,
        model: external ? null : request.model,
        agent_id: request.agentId,
        harness: input.harness(request.sessionId),
        harness_session_id: request.harnessSessionId ?? null,
        started: Date.now(),
        ...(await provenanceOf({cwd, extensionDir})),
      })
      .returning({run: runs.run_id})
    if (row === undefined) throw new Error(`the runs store took no run for session ${request.sessionId}`)
    return row.run
  }

  async function refreshed(sessionId: string, run: number): Promise<void> {
    const [row] = await orm.select({harnessSessionId: runs.harness_session_id}).from(runs).where(eq(runs.run_id, run))
    if (row === undefined) return
    const [last] = await orm
      .select({verdict: rounds.verdict})
      .from(rounds)
      .where(and(eq(rounds.run_id, run), inArray(rounds.state, JUDGED)))
      .orderBy(desc(rounds.seq))
      .limit(1)
    const read = await input.transcript(sessionId, row.harnessSessionId).catch(() => null)
    await orm
      .update(runs)
      .set({
        last_at: Date.now(),
        verdict: VerdictSchema.parse(last?.verdict?.replaceAll(' ', '-') ?? null),
        ...transcriptValues({read, harnessSessionId: row.harnessSessionId}),
      })
      .where(eq(runs.run_id, run))
  }

  return {
    open: (request: RunRequest): Promise<number> => {
      const harnessSessionId = request.harnessSessionId ?? null
      const known = held.get(request.sessionId)
      if (known !== undefined && known.harnessSessionId === harnessSessionId) return known.run
      const opening = inserted(request)
      held.set(request.sessionId, {harnessSessionId, run: opening})
      opened.last = {sessionId: request.sessionId, run: opening}
      opening.catch(() => held.delete(request.sessionId))
      return opening
    },
    of: async (sessionId: string): Promise<number | null> => (await held.get(sessionId)?.run) ?? null,
    latest: async (): Promise<{sessionId: string; run: number} | null> => {
      const {last} = opened
      if (last === null || !held.has(last.sessionId)) return null
      return {sessionId: last.sessionId, run: await last.run}
    },
    refresh: async (sessionId: string): Promise<void> => {
      const known = held.get(sessionId)
      if (known === undefined) return
      await refreshed(sessionId, await known.run)
    },
  }
}

function transcriptValues(input: {read: TranscriptUsage | null; harnessSessionId: string | null}) {
  const {read} = input
  if (read === null) return {error_code: NO_TRANSCRIPT}
  return {
    model: read.model,
    usage: read.usage,
    cost: tokenUsageToSnapshot(read.usage).totalCostUsd ?? read.cost ?? null,
    harness_session_id: input.harnessSessionId ?? read.nativeId,
    error_code: null,
  }
}

type RunRequest = Pick<ToolRequest, 'sessionId' | 'agentId' | 'model' | 'harnessSessionId'>

const JUDGED: ('measured' | 'broken')[] = ['measured', 'broken']

const NO_TRANSCRIPT = 'no-transcript'

const VerdictSchema = z.enum(RUN_VERDICTS).nullable().catch(null)
