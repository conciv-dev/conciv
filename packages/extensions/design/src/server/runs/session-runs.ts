import {and, desc, eq} from 'drizzle-orm'
import {z} from 'zod'
import type {RunStatus} from '@conciv/protocol/chat-event-types'
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
    close: async (sessionId: string, state: Closed): Promise<void> => {
      held.delete(sessionId)
      const open = await orm
        .select({run: runs.run_id})
        .from(runs)
        .where(and(eq(runs.session_id, sessionId), eq(runs.status, RUNNING)))
      await Promise.all(
        open.map(async ({run}) => {
          const [last] = await orm
            .select({verdict: rounds.verdict})
            .from(rounds)
            .where(eq(rounds.run_id, run))
            .orderBy(desc(rounds.seq))
            .limit(1)
          await orm
            .update(runs)
            .set({
              status: state.status,
              ended: state.ended,
              usage: state.usage ?? null,
              cost: state.usage === undefined ? null : (tokenUsageToSnapshot(state.usage).totalCostUsd ?? null),
              error: state.error?.message ?? null,
              error_code: state.error?.code ?? null,
              verdict: VerdictSchema.parse(last?.verdict?.replaceAll(' ', '-') ?? null),
            })
            .where(and(eq(runs.run_id, run), eq(runs.status, RUNNING)))
        }),
      )
    },
  }
}

type Closed = {
  status: RunStatus
  ended: number
  usage?: TokenUsage
  error?: {message: string; code?: string}
}

const RUNNING = 'running'

const VerdictSchema = z.enum(RUN_VERDICTS).nullable().catch(null)
