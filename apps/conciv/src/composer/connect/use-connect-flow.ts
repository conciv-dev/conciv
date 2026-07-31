import {createSignal, createEffect, on, onCleanup, type Accessor} from 'solid-js'
import {useMutation, useQuery, type QueryClient} from '@tanstack/solid-query'
import type {LiveSession, RpcClient} from '@conciv/contract'
import type {QueryUtils} from '@conciv/client'
import {errorMessageFor} from '../../chat/send-errors.js'
import type {Notify} from '../../chat/notify.js'
import {
  CLOSED,
  dialInPollMs,
  dialogIsOpen,
  GIVE_UP_AFTER_FAILURES,
  orderCandidates,
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
  CANNOT_TELL,
  clampTitle,
  connectFailed,
  CONNECTING_LABEL,
  CONTACT_LOST,
  DIALLED_IN,
  HAND_BACK_LABEL,
  HANDED_BACK,
  isStale,
  LEAVING_UNRELOADED,
  nothingRunning,
  LOOKING_LABEL,
  LOOKUP_FAILED,
  newSessionsAnnounce,
  nowFollowing,
  RELOAD_ANNOUNCE,
  STILL_CONNECTED,
  subtitle,
  UNDO_LABEL,
} from './connect-copy.js'

const HAND_BACK_KEY = 'hand-back'
const FRESH_MS = 3_000
const KEEP_MS = 5 * 60_000
const POLL_MS = 4_000
const TICK_MS = 1_000

export type ConnectFlowDeps = {
  utils: QueryUtils
  rpc: RpcClient
  queryClient: QueryClient
  harnessName: () => string
  sessionId: () => string
  navigate: (sessionId: string) => void
  notify: Notify
  announce: (message: string, assertive?: boolean) => void
  invalidateSessions: () => void
}

export type ConnectFlow = {
  step: Accessor<ConnectStep>
  candidates: Accessor<LiveSession[] | undefined>
  arrived: Accessor<number>
  loading: Accessor<boolean>
  refreshing: Accessor<boolean>
  failure: Accessor<string | null>
  stale: Accessor<boolean>
  checkedAt: Accessor<number>
  connectingId: Accessor<string | null>
  dialledIn: Accessor<boolean>
  contactLost: Accessor<boolean>
  unreachable: Accessor<boolean>
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

type Spoken = {message: string; assertive: boolean}

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
  const [failures, setFailures] = createSignal(0)
  const [held, setHeld] = createSignal<LiveSession[] | null>(null)

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
    setHeld(null)
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
        title: clampTitle(candidateTitle(session)),
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
    return awaitingDialIn() ? dialInPollMs(failures()) : POLL_MS
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

  createEffect(
    on(
      () => candidates.errorUpdatedAt,
      (at, before) => {
        if (at === 0 || at === before) return
        setFailures((count) => count + 1)
      },
    ),
  )

  createEffect(
    on(
      () => candidates.dataUpdatedAt,
      (at, before) => {
        if (at === 0 || at === before) return
        setFailures(0)
      },
    ),
  )

  const stamp = (list: LiveSession[] | undefined): void => {
    if (!list) return
    setHeld(orderCandidates(list))
  }

  const liveById = (): Map<string, LiveSession> =>
    new Map((candidates.data ?? []).map((session) => [session.sessionId, session]))

  const rows = (): LiveSession[] | undefined => {
    const frozen = held()
    if (!frozen) return candidates.data === undefined ? undefined : orderCandidates(candidates.data)
    const live = liveById()
    return frozen.map((row) => live.get(row.sessionId) ?? {...row, working: false})
  }

  const arrived = (): number => {
    const frozen = held()
    if (!frozen) return 0
    const known = new Set(frozen.map((row) => row.sessionId))
    return (candidates.data ?? []).filter((session) => !known.has(session.sessionId)).length
  }

  const refresh = (): void => {
    void candidates.refetch().then((settled) => stamp(settled.data))
  }

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
    stamp(list)
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
      stamp(cached)
      decide(cached)
      return
    }
    setHeld(null)
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
      refresh()
      return
    }
    pick(again)
  }

  const done = (): void => shut()

  const unreachable = (): boolean => step().kind === 'reload' && failures() >= GIVE_UP_AFTER_FAILURES && !connected()

  const reloadLine = (): Spoken => {
    if (connected()) return {message: DIALLED_IN, assertive: false}
    if (unreachable()) return {message: CANNOT_TELL, assertive: true}
    if (candidates.isError) return {message: CONTACT_LOST, assertive: true}
    return {message: RELOAD_ANNOUNCE, assertive: false}
  }

  const listLine = (): Spoken => {
    const list = rows()
    if (!list) return {message: LOOKING_LABEL, assertive: false}
    const waiting = arrived()
    if (waiting > 0) return {message: newSessionsAnnounce(waiting), assertive: false}
    const heading = subtitle(list.length, deps.harnessName()) ?? nothingRunning(deps.harnessName())
    return {message: heading, assertive: false}
  }

  const pickingLine = (error: string | null): Spoken => {
    if (error !== null) return {message: error, assertive: true}
    if (candidates.isError && candidates.data === undefined) return {message: LOOKUP_FAILED, assertive: true}
    return listLine()
  }

  const settledLine = (current: ConnectStep): Spoken | null => {
    if (current.kind === 'connecting') return {message: CONNECTING_LABEL, assertive: false}
    if (current.kind === 'snippet') return {message: current.detail, assertive: true}
    if (current.kind === 'leaveConfirm') return {message: LEAVING_UNRELOADED, assertive: false}
    return null
  }

  const spoken = (): Spoken | null => {
    const current = step()
    if (current.kind === 'reload') return reloadLine()
    if (current.kind === 'picking') return pickingLine(current.error)
    return settledLine(current)
  }

  let lastSaid: string | null = null
  createEffect(() => {
    const said = spoken()
    if (said === null) {
      lastSaid = null
      return
    }
    if (said.message === lastSaid) return
    lastSaid = said.message
    deps.announce(said.message, said.assertive)
  })

  return {
    step,
    candidates: rows,
    arrived,
    loading: () => candidates.isLoading,
    refreshing: () => candidates.isFetching && candidates.data !== undefined,
    failure: () => (candidates.isError ? reasonOf(candidates.error) : null),
    stale: () => isStale(candidates.dataUpdatedAt, now()),
    checkedAt: () => candidates.dataUpdatedAt,
    connectingId: () => (adopt.isPending ? (adopt.variables?.sessionId ?? null) : null),
    dialledIn: connected,
    contactLost: () => step().kind === 'reload' && candidates.isError && !connected(),
    unreachable,
    busy: () => adopt.isPending && !dialogIsOpen(step()),
    start,
    prefetch: () => void deps.queryClient.prefetchQuery(deps.utils.sessions.attachCandidates.queryOptions()),
    close,
    pick,
    retry,
    refresh,
    back: () => setStep(stepOnBack()),
    done,
    keepWaiting,
    handBack,
  }
}
