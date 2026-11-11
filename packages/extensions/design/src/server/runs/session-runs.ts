import {and, desc, eq, inArray, type SQL} from 'drizzle-orm'
import {z} from 'zod'
import type {RunStatus} from '@conciv/protocol/chat-event-types'
import type {TranscriptUsage} from '@conciv/protocol/harness-types'
import {tokenUsageToSnapshot, type TokenUsage} from '@conciv/protocol/usage-types'
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
        status: 'running',
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

  async function close(where: SQL | undefined, state: Closed): Promise<void> {
    const open = await orm
      .select({
        run: runs.run_id,
        session: runs.session,
        model: runs.model,
        harnessSessionId: runs.harness_session_id,
      })
      .from(runs)
      .where(and(where, eq(runs.status, RUNNING)))
    await Promise.all(
      open.map(async ({run, session, model, harnessSessionId}) => {
        const [last] = await orm
          .select({verdict: rounds.verdict})
          .from(rounds)
          .where(and(eq(rounds.run_id, run), inArray(rounds.state, JUDGED)))
          .orderBy(desc(rounds.seq))
          .limit(1)
        const verdict = VerdictSchema.parse(last?.verdict?.replaceAll(' ', '-') ?? null)
        const reads = session !== null && (state.usage === undefined || harnessSessionId !== null)
        const read = reads ? await input.transcript(session, harnessSessionId).catch(() => null) : null
        await orm
          .update(runs)
          .set(closedValues({state, verdict, model, harnessSessionId, read}))
          .where(and(eq(runs.run_id, run), eq(runs.status, RUNNING)))
      }),
    )
  }

  function closeSession(sessionId: string, state: Closed): Promise<void> {
    held.delete(sessionId)
    return close(eq(runs.session, sessionId), state)
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
    close: closeSession,
    end: async (sessionId: string, harnessSessionId?: string): Promise<void> => {
      const state = endedNow()
      await closeSession(sessionId, state)
      if (harnessSessionId === undefined) return
      held.forEach((entry, tab) => {
        if (entry.harnessSessionId === harnessSessionId) held.delete(tab)
      })
      await close(eq(runs.harness_session_id, harnessSessionId), state)
    },
    endAll: async (): Promise<void> => {
      const state = endedNow()
      await Promise.all([...held.keys()].map((sessionId) => closeSession(sessionId, state)))
    },
  }
}

function closedValues(input: {
  state: Closed
  verdict: z.output<typeof VerdictSchema>
  model: string | null
  harnessSessionId: string | null
  read: TranscriptUsage | null
}) {
  const {state, verdict, read} = input
  const usage = read?.usage ?? state.usage
  return {
    status: typeof state.status === 'function' ? state.status(verdict) : state.status,
    ended: state.ended,
    model: read?.model ?? input.model,
    usage: usage ?? null,
    cost: usage === undefined ? null : (tokenUsageToSnapshot(usage).totalCostUsd ?? read?.cost ?? null),
    harness_session_id: input.harnessSessionId ?? read?.nativeId ?? null,
    error: state.error?.message ?? null,
    error_code: errorCode({state, usage}),
    verdict,
  }
}

function errorCode(input: {state: Closed; usage: TokenUsage | undefined}): string | null {
  const {state, usage} = input
  if (state.error !== undefined) return state.error.code ?? null
  return usage === undefined ? NO_TRANSCRIPT : null
}

function endedNow(): Closed {
  return {status: (verdict) => (verdict === 'done' ? 'completed' : 'aborted'), ended: Date.now()}
}

type RunRequest = Pick<ToolRequest, 'sessionId' | 'agentId' | 'model' | 'harnessSessionId'>

type Closed = {
  status: RunStatus | ((verdict: z.output<typeof VerdictSchema>) => RunStatus)
  ended: number
  usage?: TokenUsage
  error?: {message: string; code?: string}
}

const RUNNING = 'running'

const JUDGED: ('measured' | 'broken')[] = ['measured', 'broken']

const NO_TRANSCRIPT = 'no-transcript'

const VerdictSchema = z.enum(RUN_VERDICTS).nullable().catch(null)
