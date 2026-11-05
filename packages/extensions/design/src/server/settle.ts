import {setTimeout as delay} from 'node:timers/promises'
import type {BundlerBridge} from '@conciv/protocol/bundler-types'
import {isSessionId, type SessionId} from '@conciv/protocol/chat-types'
import {type DesignPage, type Store} from '../shared/defs.js'
import {TOLERANCES} from '../shared/tolerances.js'

export function watchSettled(input: {
  bundler: BundlerBridge | undefined
  store: Store
  page: DesignPage
  refresh: (input: {session: SessionId}) => Promise<unknown>
  touch: (input: {file: string}) => void
}): {dispose: () => void; quiet: () => Promise<void>} {
  const {bundler, store, page, refresh, touch} = input
  const state: {burst: Burst | null; flight: Promise<void>} = {burst: null, flight: Promise.resolve()}
  const settle = async (since: number): Promise<void> => {
    const sessions = new Set((await store.list()).map((record) => record.session).filter(isSessionId))
    await Promise.all(
      [...sessions].map(async (session) => {
        const landed = await page
          .ask({sessionId: session, name: SETTLE_TOOL, input: {timeout: SETTLE_WAIT_MS, since}})
          .then(applied, () => false)
        if (landed) await refresh({session}).catch(() => undefined)
      }),
    )
  }
  const fire = (burst: Burst): void => {
    state.burst = null
    const files = [...burst.files]
    state.flight = state.flight
      .then(() => (outsidePage({bundler, files}) ? undefined : settle(burst.since)))
      .catch(() => undefined)
      .finally(() => burst.settled.resolve())
  }
  const unsubscribe = bundler?.subscribe?.((diagnostic) => {
    if (diagnostic.kind !== 'hmr-update') return
    touch({file: diagnostic.file})
    const burst = state.burst ?? {
      timer: undefined,
      since: diagnostic.timestamp - TOLERANCES.runDebounceMs,
      files: new Set<string>(),
      settled: Promise.withResolvers<void>(),
    }
    state.burst = burst
    burst.files.add(diagnostic.file)
    clearTimeout(burst.timer)
    burst.timer = setTimeout(() => fire(burst), TOLERANCES.settleQuiet)
  })
  return {
    dispose: () => {
      clearTimeout(state.burst?.timer)
      unsubscribe?.()
    },
    quiet: () =>
      Promise.race([
        state.burst?.settled.promise ?? state.flight,
        delay(TOLERANCES.settleQuiet + SETTLE_WAIT_MS, undefined, {ref: false}),
      ]),
  }
}

type Burst = {
  timer: ReturnType<typeof setTimeout> | undefined
  since: number
  files: Set<string>
  settled: PromiseWithResolvers<void>
}

function outsidePage(input: {bundler: BundlerBridge | undefined; files: string[]}): boolean {
  const {bundler, files} = input
  if (bundler === undefined) return false
  return files.every((file) => bundler.moduleGraph(file).length === 0)
}

function applied(reply: unknown): boolean {
  return typeof reply === 'object' && reply !== null && 'applied' in reply && reply.applied === true
}

const SETTLE_TOOL = 'page_hmr'

const SETTLE_WAIT_MS = 5000
