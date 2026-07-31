import {createSignal, createEffect, onCleanup, type Accessor} from 'solid-js'
import {useMutation, useQuery, type QueryClient} from '@tanstack/solid-query'
import type {LiveSession, RpcClient} from '@conciv/contract'
import type {QueryUtils} from '@conciv/client'
import {errorMessageFor} from '../../chat/send-errors.js'
import type {Notify} from '../../chat/notify.js'
import {
  CLOSED,
  dialogIsOpen,
  stepOnAdoptFailed,
  stepOnAdopted,
  stepOnBack,
  stepOnKeepWaiting,
  stepOnLeave,
  stepOnOpen,
  type Adopted,
  type ConnectStep,
} from './connect-steps.js'
import {
  candidateTitle,
  connectFailed,
  HAND_BACK_LABEL,
  HANDED_BACK,
  isStale,
  nowFollowing,
  STILL_CONNECTED,
  UNDO_LABEL,
} from './connect-copy.js'

const HAND_BACK_KEY = 'hand-back'
const FRESH_MS = 3_000
const KEEP_MS = 5 * 60_000
const POLL_MS = 4_000
const DIAL_IN_POLL_MS = 1_500
const TICK_MS = 1_000

export type ConnectFlowDeps = {
  utils: QueryUtils
  rpc: RpcClient
  queryClient: QueryClient
  harnessName: () => string
  sessionId: () => string
  navigate: (sessionId: string) => void
  notify: Notify
  invalidateSessions: () => void
}

export type ConnectFlow = {
  step: Accessor<ConnectStep>
  candidates: Accessor<LiveSession[] | undefined>
  loading: Accessor<boolean>
  refreshing: Accessor<boolean>
  failure: Accessor<string | null>
  stale: Accessor<boolean>
  checkedAt: Accessor<number>
  connectingId: Accessor<string | null>
  dialledIn: Accessor<boolean>
  contactLost: Accessor<boolean>
  busy: Accessor<boolean>
  start: () => void
  prefetch: () => void
  close: () => void
  pick: (session: LiveSession) => void
  retry: () => void
  refresh: () => void
  back: () => void
  done: () => void
  keepWaiting: () => void
  handBack: () => void
}

function reasonOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export function useConnectFlow(deps: ConnectFlowDeps): ConnectFlow {
  const [requested, setRequested] = createSignal(false)
  const [step, setStep] = createSignal<ConnectStep>(CLOSED)
  const [adopted, setAdopted] = createSignal<Adopted | null>(null)
  const [epoch, setEpoch] = createSignal(0)
  const [flight, setFlight] = createSignal(0)
  const [undecided, setUndecided] = createSignal(false)
  const [connected, setConnected] = createSignal(false)
  const [now, setNow] = createSignal(Date.now())

  const tick = setInterval(() => {
    if (requested()) setNow(Date.now())
  }, TICK_MS)
  onCleanup(() => clearInterval(tick))

  const detach = useMutation(() => ({
    mutationFn: (concivSessionId: string) => deps.rpc.sessions.attachDetach({sessionId: concivSessionId}),
    onSuccess: () => {
      deps.invalidateSessions()
      void deps.queryClient.invalidateQueries({queryKey: deps.utils.sessions.attachCandidates.key()})
      deps.notify(HANDED_BACK, {key: HAND_BACK_KEY, tone: 'success'})
    },
    onError: (_error: unknown, concivSessionId: string) => {
      deps.notify(STILL_CONNECTED, {
        key: HAND_BACK_KEY,
        tone: 'danger',
        action: {label: HAND_BACK_LABEL, run: () => detach.mutate(concivSessionId)},
      })
    },
  }))

  const announceAdopted = (session: Adopted): void => {
    deps.notify(nowFollowing(session.title), {
      key: `following-${session.concivSessionId}`,
      tone: 'success',
      action: {label: UNDO_LABEL, run: () => detach.mutate(session.concivSessionId)},
    })
  }

  const commit = (session: Adopted): void => {
    deps.navigate(session.concivSessionId)
    announceAdopted(session)
  }

  const shut = (): void => {
    setEpoch((count) => count + 1)
    setUndecided(false)
    setRequested(false)
    setStep(CLOSED)
  }

  const finish = (session: Adopted): void => {
    shut()
    commit(session)
  }

  const connectCommand = useMutation(() => ({
    mutationFn: (sessionId: string) => deps.rpc.sessions.connectCommand({sessionId}),
  }))

  const offerSnippet = async (detail: string, session: LiveSession): Promise<void> => {
    const fallback = await connectCommand.mutateAsync(deps.sessionId()).catch(() => null)
    setStep(stepOnAdoptFailed({message: detail, sessionId: session.sessionId}, fallback?.command ?? null))
  }

  const adopt = useMutation(() => ({
    mutationFn: (session: LiveSession) =>
      deps.rpc.sessions.attachAdopt({
        harnessSessionId: session.sessionId,
        pid: session.pid,
        force: session.relation === 'descendant',
      }),
    onSuccess: (result: {sessionId: string; reloadCommand: string}, session: LiveSession) => {
      const next: Adopted = {
        concivSessionId: result.sessionId,
        harnessSessionId: session.sessionId,
        title: candidateTitle(session),
        reloadCommand: result.reloadCommand,
      }
      setAdopted(next)
      deps.invalidateSessions()
      void deps.queryClient.invalidateQueries({queryKey: deps.utils.sessions.attachCandidates.key()})
      if (flight() !== epoch()) {
        announceAdopted(next)
        return
      }
      const settled = stepOnAdopted(next, session.ready)
      if (settled.kind === 'closed') {
        finish(next)
        return
      }
      setStep(settled)
    },
    onError: (error: unknown, session: LiveSession) => {
      const install = errorMessageFor(error, 'INSTALL_FAILED')
      if (install !== null) {
        void offerSnippet(install, session)
        return
      }
      const message = errorMessageFor(error, 'CWD_MISMATCH') ?? connectFailed(deps.harnessName())
      setStep(stepOnAdoptFailed({message, sessionId: session.sessionId}, null))
    },
  }))

  const awaitingDialIn = (): boolean => {
    const kind = step().kind
    return kind === 'reload' || kind === 'leaveConfirm'
  }

  const pollMs = (): number | false => {
    if (!requested()) return false
    if (adopt.isPending) return false
    return awaitingDialIn() ? DIAL_IN_POLL_MS : POLL_MS
  }

  const candidates = useQuery(() => ({
    ...deps.utils.sessions.attachCandidates.queryOptions(),
    enabled: requested(),
    staleTime: FRESH_MS,
    gcTime: KEEP_MS,
    refetchInterval: pollMs(),
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    retry: 1,
  }))

  const startAdopt = (session: LiveSession): void => {
    setFlight(epoch())
    adopt.mutate(session)
  }

  const decide = (list: LiveSession[]): void => {
    const next = stepOnOpen(list)
    setStep(next)
    const only = list[0]
    if (next.kind === 'connecting' && only) startAdopt(only)
  }

  createEffect(() => {
    if (!undecided()) return
    const list = candidates.data
    if (!list) return
    setUndecided(false)
    decide(list)
  })

  const dialledIn = (): boolean => {
    const following = adopted()
    if (!following || !awaitingDialIn()) return false
    return candidates.data?.some((row) => row.sessionId === following.harnessSessionId && row.ready) ?? false
  }

  createEffect(() => {
    if (connected() || !dialledIn()) return
    const following = adopted()
    if (!following) return
    setConnected(true)
    setStep({kind: 'reload', adopted: following})
    commit(following)
  })

  const start = (): void => {
    setEpoch((count) => count + 1)
    setConnected(false)
    setRequested(true)
    const cached = candidates.data
    if (cached) {
      setUndecided(false)
      decide(cached)
      return
    }
    setUndecided(true)
    setStep({kind: 'picking', error: null, retryId: null})
  }

  const keepWaiting = (): void => {
    setStep(stepOnKeepWaiting(step()))
  }

  const handBack = (): void => {
    const leaving = step()
    if (leaving.kind !== 'leaveConfirm') return
    shut()
    detach.mutate(leaving.adopted.concivSessionId)
  }

  const close = (): void => {
    const current = step()
    if (current.kind === 'leaveConfirm') {
      handBack()
      return
    }
    const next = stepOnLeave(current, connected())
    if (next.kind === 'leaveConfirm') {
      setStep(next)
      return
    }
    shut()
  }

  const pick = (session: LiveSession): void => {
    setStep({kind: 'picking', error: null, retryId: null})
    startAdopt(session)
  }

  const retry = (): void => {
    const current = step()
    const retryId = current.kind === 'picking' ? current.retryId : null
    const again = candidates.data?.find((session) => session.sessionId === retryId)
    if (!again) {
      void candidates.refetch()
      return
    }
    pick(again)
  }

  const done = (): void => shut()

  return {
    step,
    candidates: () => candidates.data,
    loading: () => candidates.isLoading,
    refreshing: () => candidates.isFetching && candidates.data !== undefined,
    failure: () => (candidates.isError ? reasonOf(candidates.error) : null),
    stale: () => isStale(candidates.dataUpdatedAt, now()),
    checkedAt: () => candidates.dataUpdatedAt,
    connectingId: () => (adopt.isPending ? (adopt.variables?.sessionId ?? null) : null),
    dialledIn: connected,
    contactLost: () => step().kind === 'reload' && candidates.isError && !connected(),
    busy: () => adopt.isPending && !dialogIsOpen(step()),
    start,
    prefetch: () => void deps.queryClient.prefetchQuery(deps.utils.sessions.attachCandidates.queryOptions()),
    close,
    pick,
    retry,
    refresh: () => void candidates.refetch(),
    back: () => setStep(stepOnBack()),
    done,
    keepWaiting,
    handBack,
  }
}
