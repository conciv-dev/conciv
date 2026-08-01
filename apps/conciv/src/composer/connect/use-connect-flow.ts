import {createEffect, createMemo, createSignal, type Accessor} from 'solid-js'
import {createStore, reconcile, unwrap} from 'solid-js/store'
import {createTimer} from '@solid-primitives/timer'
import {useMutation, useQuery, type QueryClient} from '@tanstack/solid-query'
import type {LiveSession, RpcClient} from '@conciv/contract'
import type {QueryUtils} from '@conciv/client'
import {errorMessageFor} from '../../chat/send-errors.js'
import type {Notify} from '../../chat/notify.js'
import {
  arrivedCount,
  dialInPollMs,
  GIVE_UP_AFTER_FAILURES,
  mergeFrozen,
  orderCandidates,
  type Adopted,
  type ConnectStep,
} from './connect-steps.js'
import {
  adoptedOf,
  attemptOf,
  CLOSED_CONNECT,
  connectPlanFor,
  connectTransition,
  dialledIn,
  heldOf,
  type ConnectEvent,
  type ConnectPlan,
  type ConnectState,
} from './connect-machine.js'
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
const LOOKUP_RETRIES = 1

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

function dialing(state: ConnectState): boolean {
  return state.kind === 'reload' || state.kind === 'leaveConfirm'
}

export function useConnectFlow(deps: ConnectFlowDeps): ConnectFlow {
  const [state, setState] = createStore<ConnectState>({...CLOSED_CONNECT})
  const [now, setNow] = createSignal(Date.now())

  const open = createMemo(() => state.kind !== 'closed')
  createTimer(
    () => setNow(Date.now()),
    () => (open() ? TICK_MS : false),
    setInterval,
  )

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

  const noticeFollowing = (session: Adopted): void => {
    deps.notify(nowFollowing(session.title), {
      key: `following-${session.concivSessionId}`,
      tone: 'success',
      action: {label: UNDO_LABEL, run: () => detach.mutate(session.concivSessionId)},
    })
  }

  const connectCommand = useMutation(() => ({
    mutationFn: (sessionId: string) => deps.rpc.sessions.connectCommand({sessionId}),
  }))

  const failedWithSnippet = async (detail: string, session: LiveSession): Promise<void> => {
    const fallback = await connectCommand.mutateAsync(deps.sessionId()).catch(() => null)
    apply({
      type: 'adoptFailed',
      candidateId: session.sessionId,
      message: detail,
      snippet: fallback?.command ?? null,
    })
  }

  const adopt = useMutation(() => ({
    mutationFn: (session: LiveSession) =>
      deps.rpc.sessions.attachAdopt({
        harnessSessionId: session.sessionId,
        pid: session.pid,
        force: session.relation === 'descendant',
      }),
    onSuccess: (result: {sessionId: string; reloadCommand: string}, session: LiveSession) => {
      deps.invalidateSessions()
      void deps.queryClient.invalidateQueries({queryKey: deps.utils.sessions.attachCandidates.key()})
      apply({
        type: 'adopted',
        candidateId: session.sessionId,
        ready: session.ready,
        adopted: {
          concivSessionId: result.sessionId,
          harnessSessionId: session.sessionId,
          title: clampTitle(candidateTitle(session)),
          reloadCommand: result.reloadCommand,
        },
      })
    },
    onError: (error: unknown, session: LiveSession) => {
      const install = errorMessageFor(error, 'INSTALL_FAILED')
      if (install !== null) {
        void failedWithSnippet(install, session)
        return
      }
      const message = errorMessageFor(error, 'CWD_MISMATCH') ?? connectFailed(deps.harnessName())
      apply({type: 'adoptFailed', candidateId: session.sessionId, message, snippet: null})
    },
  }))

  const runPlan = (plan: ConnectPlan): void => {
    if (plan.adopt) adopt.mutate(unwrap(plan.adopt))
    if (plan.follow) {
      deps.navigate(plan.follow.concivSessionId)
      noticeFollowing(plan.follow)
    }
    if (plan.announce) noticeFollowing(plan.announce)
    if (plan.handBack) detach.mutate(plan.handBack.concivSessionId)
  }

  const apply = (event: ConnectEvent): void => {
    const before = unwrap(state)
    const after = connectTransition(before, event)
    const plan = connectPlanFor(before, after, event)
    if (after !== before) setState(reconcile(after, {key: 'sessionId'}))
    runPlan(plan)
  }

  const pollMs = (): number | false => {
    if (!open()) return false
    if (attemptOf(state) !== null) return false
    return dialing(state) ? dialInPollMs(0) : POLL_MS
  }

  const persistence = () => {
    if (!dialing(state)) return {retry: LOOKUP_RETRIES}
    return {retry: GIVE_UP_AFTER_FAILURES - 1, retryDelay: (attempt: number) => dialInPollMs(attempt)}
  }

  const candidates = useQuery(() => ({
    ...deps.utils.sessions.attachCandidates.queryOptions(),
    enabled: open(),
    staleTime: FRESH_MS,
    gcTime: KEEP_MS,
    refetchInterval: pollMs(),
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    ...persistence(),
  }))

  createEffect(() => {
    const listed = candidates.data
    if (!listed) return
    apply({type: 'listed', candidates: listed})
  })

  const terminalDialledIn = createMemo(() => {
    const following = adoptedOf(state)
    if (!following) return false
    return candidates.data?.some((row) => row.sessionId === following.harnessSessionId && row.ready) ?? false
  })

  createEffect(() => {
    if (terminalDialledIn()) apply({type: 'dialledIn'})
  })

  const rows = (): LiveSession[] | undefined => {
    const frozen = heldOf(state)
    if (!frozen) return candidates.data === undefined ? undefined : orderCandidates(candidates.data)
    return mergeFrozen(frozen, candidates.data ?? [])
  }

  const arrived = (): number => arrivedCount(heldOf(state), candidates.data ?? [])

  const refresh = (): void => {
    void candidates.refetch().then((settled) => {
      if (settled.data) apply({type: 'refreshed', candidates: settled.data})
    })
  }

  const retry = (): void => {
    const current = unwrap(state)
    const retryId = current.kind === 'picking' ? current.retryId : null
    const again = candidates.data?.find((session) => session.sessionId === retryId)
    if (!again) {
      refresh()
      return
    }
    apply({type: 'pick', candidate: again})
  }

  const stillDialing = (): boolean => state.kind === 'reload' && !state.dialled

  const unreachable = (): boolean => stillDialing() && candidates.isError

  const contactLost = (): boolean => stillDialing() && !candidates.isError && candidates.failureCount > 0

  const reloadLine = (): Spoken => {
    if (dialledIn(state)) return {message: DIALLED_IN, assertive: false}
    if (unreachable()) return {message: CANNOT_TELL, assertive: true}
    if (contactLost()) return {message: CONTACT_LOST, assertive: true}
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

  const spoken = createMemo(
    (): Spoken | null => {
      if (state.kind === 'reload') return reloadLine()
      if (state.kind === 'picking') return pickingLine(state.error)
      if (state.kind === 'connecting') return {message: CONNECTING_LABEL, assertive: false}
      if (state.kind === 'snippet') return {message: state.detail, assertive: true}
      if (state.kind === 'leaveConfirm') return {message: LEAVING_UNRELOADED, assertive: false}
      return null
    },
    undefined,
    {equals: (was, is) => was?.message === is?.message},
  )

  createEffect(() => {
    const said = spoken()
    if (said) deps.announce(said.message, said.assertive)
  })

  return {
    step: () => state,
    candidates: rows,
    arrived,
    loading: () => candidates.isLoading,
    refreshing: () => candidates.isFetching && candidates.failureCount === 0 && candidates.data !== undefined,
    failure: () => (candidates.isError ? reasonOf(candidates.error) : null),
    stale: () => isStale(candidates.dataUpdatedAt, now()),
    checkedAt: () => candidates.dataUpdatedAt,
    connectingId: () => attemptOf(state)?.sessionId ?? null,
    dialledIn: () => dialledIn(state),
    contactLost,
    unreachable,
    busy: () => state.kind === 'connecting',
    start: () => apply({type: 'open', cached: candidates.data ?? null}),
    prefetch: () => void deps.queryClient.prefetchQuery(deps.utils.sessions.attachCandidates.queryOptions()),
    close: () => apply({type: 'close'}),
    pick: (session) => apply({type: 'pick', candidate: session}),
    retry,
    refresh,
    back: () => apply({type: 'back'}),
    done: () => apply({type: 'done'}),
    keepWaiting: () => apply({type: 'keepWaiting'}),
    handBack: () => apply({type: 'close'}),
  }
}
