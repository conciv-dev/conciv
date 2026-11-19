import {createMemo, untrack} from 'solid-js'
import {createStore} from 'solid-js/store'
import {ORPCError} from '@orpc/client'
import {createTanstackQueryUtils, useQuery} from '@conciv/client'
import {createKeyed, type MountedSession, type SetupContext} from '@conciv/plugin/experimental'
import type {terminalDeclarations} from './stores.js'

export const PANEL_KEY = 'terminal:terminal'

const BUSY_REFUSAL = 'The CLI is busy. Wait for it to finish, then try again.'
export const OPEN_FAILED = 'Couldn’t open the terminal.'
const RESTART_FAILED = 'Couldn’t restart the terminal.'

export type TerminalContext = SetupContext<typeof terminalDeclarations>

type LiveTerminal = {
  readonly key: string
  readonly ptyId: string
  readonly model: string | undefined
  readonly busy: () => boolean
}

type TerminalRun = {
  generation: number
  restarting: boolean
  live: LiveTerminal | null
  failure: {key: string; message: string} | null
}

function readModels(ctx: TerminalContext, input: {sessionId: string}, options: {signal?: AbortSignal} = {}) {
  const session = untrack(() => ctx.sessions.current())
  if (!session || session.id !== input.sessionId)
    throw new Error(`the terminal read ${input.sessionId} after it was left`)
  return session.server.client.meta.models(input, options)
}

async function removeLive(session: MountedSession, live: LiveTerminal | null): Promise<void> {
  if (!live) return
  await session.server.client.experimental.persistentPty.remove({ptyId: live.ptyId}).catch((cause: unknown) => {
    if (cause instanceof ORPCError && cause.code === 'PTY_NOT_FOUND') return
    throw cause
  })
}

function restartMessage(cause: unknown): string {
  return cause instanceof ORPCError && cause.code === 'BUSY' ? BUSY_REFUSAL : RESTART_FAILED
}

export function createTerminalState(ctx: TerminalContext) {
  const readSessionId = createMemo((previous: string | undefined) => ctx.sessions.current()?.id ?? previous)
  const metaUtils = createTanstackQueryUtils(
    {models: (input: {sessionId: string}, options?: {signal?: AbortSignal}) => readModels(ctx, input, options)},
    {path: ['meta']},
  )
  const read = useQuery(() => ({
    ...metaUtils.models.queryOptions({input: {sessionId: readSessionId() ?? ''}}),
    enabled: readSessionId() !== undefined,
    retry: false,
    refetchOnWindowFocus: false,
  }))
  const [run, setRun] = createStore<TerminalRun>({generation: 0, restarting: false, live: null, failure: null})

  const meta = (sessionId: string) => (readSessionId() === sessionId && !read.isPending ? read.data : undefined)
  const models = (sessionId: string) => meta(sessionId)?.models ?? []
  const key = (sessionId: string) => `${sessionId}:${run.generation}`
  const busy = (sessionId: string) => run.live?.key === key(sessionId) && run.live.busy()

  const locked = (sessionId: string) => run.restarting || busy(sessionId)

  const spawnModel = (sessionId: string) => {
    const listed = (model: string | null | undefined): model is string =>
      typeof model === 'string' && models(sessionId).some((entry) => entry.id === model)
    const picked = [ctx.stores.prefs.value.sessions[sessionId], ctx.stores.prefs.value.model].find(listed)
    return picked ?? meta(sessionId)?.defaultModel ?? undefined
  }

  const shownModel = (sessionId: string) => {
    const live = run.live?.key === key(sessionId) && !run.restarting ? run.live : null
    return live ? live.model : spawnModel(sessionId)
  }

  const restart = async (session: MountedSession): Promise<void> => {
    if (run.restarting) return
    setRun('restarting', true)
    const live = run.live?.key === key(session.id) ? run.live : null
    await removeLive(session, live).then(
      () => setRun({generation: run.generation + 1, failure: null}),
      (cause: unknown) => {
        console.error('[terminal] removing the session terminal failed', cause)
        ctx.toast.show({title: restartMessage(cause), variant: 'error'})
      },
    )
    setRun('restarting', false)
  }

  createKeyed(
    () => {
      const session = ctx.sessions.current()
      const live = run.live
      if (!session || live?.key !== key(session.id) || meta(session.id) === undefined) return undefined
      if (locked(session.id)) return undefined
      const model = spawnModel(session.id)
      return model === live.model ? undefined : {session, key: live.key, model}
    },
    (behind) => void restart(behind.session),
    {equals: (previous, next) => previous.key === next.key && previous.model === next.model},
  )

  return {
    supported: (sessionId: string) => meta(sessionId)?.harness.persistentPty,
    ready: (sessionId: string) => {
      const known = meta(sessionId)
      return known ? known.harness.persistentPty === true : read.errorUpdateCount > 0
    },
    meta,
    modelsFailed: (sessionId: string) => meta(sessionId) === undefined && read.isError,
    modelsLoading: (sessionId: string) => meta(sessionId) === undefined && !read.isError,
    reloadModels: () => void read.refetch(),
    spawnModel,
    shownModel,
    key,
    busy,
    locked,
    failure: (sessionId: string) => (run.failure?.key === key(sessionId) ? run.failure.message : null),
    opened: (live: LiveTerminal) => setRun('live', live),
    closed: (terminalKey: string) => {
      if (run.live?.key === terminalKey) setRun('live', null)
    },
    fail: (terminalKey: string, message: string) => setRun('failure', {key: terminalKey, message}),
    retry: () => setRun({generation: run.generation + 1, failure: null}),
    restart,
    pick: (session: MountedSession, model: string) => {
      if (locked(session.id) || model === shownModel(session.id)) return
      ctx.stores.prefs.update((prefs) => {
        prefs.model = model
        prefs.sessions[session.id] = model
      })
      void restart(session)
    },
  }
}

export type TerminalState = ReturnType<typeof createTerminalState>
