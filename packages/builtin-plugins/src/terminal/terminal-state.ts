import {createMemo, untrack} from 'solid-js'
import {createStore} from 'solid-js/store'
import {ORPCError} from '@orpc/client'
import {createLatest, type MountedSession, type SetupContext} from '@conciv/plugin/experimental'
import type {terminalDeclarations} from './stores.js'

export const PANEL_KEY = 'terminal:terminal'

const BUSY_REFUSAL = 'The CLI is busy. Wait for it to finish, then try again.'
export const OPEN_FAILED = 'Couldn’t open the terminal.'
const RESTART_FAILED = 'Couldn’t restart the terminal.'

export type TerminalContext = SetupContext<typeof terminalDeclarations>

type LiveTerminal = {readonly key: string; readonly ptyId: string; readonly busy: () => boolean}

type TerminalRun = {
  generation: number
  restarting: boolean
  live: LiveTerminal | null
  failure: {key: string; message: string} | null
}

async function readMeta(ctx: TerminalContext, sessionId: string, signal: AbortSignal) {
  const session = untrack(() => ctx.sessions.current())
  if (session?.id !== sessionId) throw new Error(`the terminal read ${sessionId} after it was left`)
  const meta = await session.server.client.meta.models({sessionId}, {signal})
  return {sessionId, meta}
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
  const read = createLatest(readSessionId, (sessionId, signal) => readMeta(ctx, sessionId, signal))
  const [run, setRun] = createStore<TerminalRun>({generation: 0, restarting: false, live: null, failure: null})

  const meta = (sessionId: string) => (read.latest?.sessionId === sessionId ? read.latest.meta : undefined)
  const models = (sessionId: string) => meta(sessionId)?.models ?? []
  const key = (sessionId: string) => `${sessionId}:${run.generation}`
  const busy = (sessionId: string) => run.live?.key === key(sessionId) && run.live.busy()

  const locked = (sessionId: string) => run.restarting || busy(sessionId)

  const spawnModel = (sessionId: string) => {
    const picked = ctx.stores.prefs.value.model
    return picked !== null && models(sessionId).some((model) => model.id === picked) ? picked : undefined
  }

  const shownModel = (sessionId: string) => spawnModel(sessionId) ?? meta(sessionId)?.defaultModel ?? undefined

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

  return {
    supported: (sessionId: string) => meta(sessionId)?.harness.persistentPty,
    ready: (sessionId: string) => {
      const known = meta(sessionId)
      return known ? known.harness.persistentPty === true : read.error !== undefined
    },
    models,
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
      ctx.stores.prefs.set({model})
      void restart(session)
    },
  }
}

export type TerminalState = ReturnType<typeof createTerminalState>
