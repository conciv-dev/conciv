import {and, desc, eq} from 'drizzle-orm'
import {z} from 'zod'
import type {RunStatus} from '@conciv/protocol/chat-event-types'
import type {TranscriptUsage} from '@conciv/protocol/harness-types'
import {tokenUsageToSnapshot, type TokenUsage} from '@conciv/protocol/usage-types'
import type {ToolRequest} from '@conciv/extension'
import {RUN_VERDICTS} from '../../shared/run-verdicts.js'
import type {Arm} from '../../shared/arm.js'
import type {openStore} from './open-store.js'
import {storeTables} from './store-tables.js'
import {provenanceOf} from './commands/provenance.js'

export function createSessionRuns(input: {
  orm: ReturnType<typeof openStore>['orm']
  cwd: string
  extensionDir: string
  labels: {wave: string | null; lane: string | null; arm: Arm}
  harness: (sessionId: string) => string
  transcript: (sessionId: string, window: {from: number; to: number}) => Promise<TranscriptUsage | null>
}) {
  const {orm, cwd, extensionDir, labels} = input
  const {runs, rounds} = storeTables
  const held = new Map<string, Promise<number>>()
  const opened: {last: {sessionId: string; run: Promise<number>} | null} = {last: null}

  async function inserted(request: Pick<ToolRequest, 'sessionId' | 'agentId' | 'model'>): Promise<number> {
    const [row] = await orm
      .insert(runs)
      .values({
        session_id: request.sessionId,
        status: 'running',
        model: request.model,
        agent_id: request.agentId,
        harness: input.harness(request.sessionId),
        started: Date.now(),
        ...labels,
        ...(await provenanceOf({cwd, extensionDir})),
      })
      .returning({run: runs.run_id})
    if (row === undefined) throw new Error(`the runs store took no run for session ${request.sessionId}`)
    return row.run
  }

  async function close(sessionId: string, state: Closed): Promise<void> {
    held.delete(sessionId)
    const open = await orm
      .select({run: runs.run_id, started: runs.started, model: runs.model})
      .from(runs)
      .where(and(eq(runs.session_id, sessionId), eq(runs.status, RUNNING)))
    await Promise.all(
      open.map(async ({run, started, model}) => {
        const [last] = await orm
          .select({verdict: rounds.verdict})
          .from(rounds)
          .where(eq(rounds.run_id, run))
          .orderBy(desc(rounds.seq))
          .limit(1)
        const verdict = VerdictSchema.parse(last?.verdict?.replaceAll(' ', '-') ?? null)
        const read =
          state.usage === undefined
            ? await input.transcript(sessionId, {from: started, to: state.ended}).catch(() => null)
            : null
        const usage = state.usage ?? read?.usage
        await orm
          .update(runs)
          .set({
            status: typeof state.status === 'function' ? state.status(verdict) : state.status,
            ended: state.ended,
            model: model ?? read?.model ?? null,
            usage: usage ?? null,
            cost: usage === undefined ? null : (tokenUsageToSnapshot(usage).totalCostUsd ?? read?.cost ?? null),
            harness_session_id: read?.nativeId ?? null,
            error: state.error?.message ?? null,
            error_code: state.error?.code ?? (state.error === undefined && usage === undefined ? NO_TRANSCRIPT : null),
            verdict,
          })
          .where(and(eq(runs.run_id, run), eq(runs.status, RUNNING)))
      }),
    )
  }

  return {
    open: (request: Pick<ToolRequest, 'sessionId' | 'agentId' | 'model'>): Promise<number> => {
      const known = held.get(request.sessionId)
      if (known !== undefined) return known
      const opening = inserted(request)
      held.set(request.sessionId, opening)
      opened.last = {sessionId: request.sessionId, run: opening}
      opening.catch(() => held.delete(request.sessionId))
      return opening
    },
    of: async (sessionId: string): Promise<number | null> => (await held.get(sessionId)) ?? null,
    latest: async (): Promise<{sessionId: string; run: number} | null> => {
      const {last} = opened
      if (last === null || !held.has(last.sessionId)) return null
      return {sessionId: last.sessionId, run: await last.run}
    },
    close,
    end: (sessionId: string): Promise<void> => close(sessionId, endedNow()),
    endAll: async (): Promise<void> => {
      const state = endedNow()
      await Promise.all([...held.keys()].map((sessionId) => close(sessionId, state)))
    },
  }
}

function endedNow(): Closed {
  return {status: (verdict) => (verdict === 'done' ? 'completed' : 'aborted'), ended: Date.now()}
}

type Closed = {
  status: RunStatus | ((verdict: z.output<typeof VerdictSchema>) => RunStatus)
  ended: number
  usage?: TokenUsage
  error?: {message: string; code?: string}
}

const RUNNING = 'running'

const NO_TRANSCRIPT = 'no-transcript'

const VerdictSchema = z.enum(RUN_VERDICTS).nullable().catch(null)
