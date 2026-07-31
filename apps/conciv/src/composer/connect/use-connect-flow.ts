import {createSignal, createEffect, onCleanup, type Accessor} from 'solid-js'
import {useMutation, useQuery, type QueryClient} from '@tanstack/solid-query'
import type {LiveSession, RpcClient} from '@conciv/contract'
import type {QueryUtils} from '@conciv/client'
import {errorMessageFor} from '../../chat/external-session.js'
import type {Notify} from '../../chat/notify.js'
import {
  CLOSED,
  dialogIsOpen,
  stepOnAdoptFailed,
  stepOnAdopted,
  stepOnBack,
  stepOnOpen,
  type Adopted,
  type ConnectStep,
} from './connect-steps.js'
import {candidateTitle, connectFailed, HAND_BACK_FAILED, isStale, nowFollowing, UNDO_LABEL} from './connect-copy.js'

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
  const [now, setNow] = createSignal(Date.now())

  const tick = setInterval(() => {
    if (requested()) setNow(Date.now())
  }, TICK_MS)
  onCleanup(() => clearInterval(tick))

  const handBack = (concivSessionId: string): void => {
    void deps.rpc.sessions
      .attachDetach({sessionId: concivSessionId})
      .then(() => deps.invalidateSessions())
      .catch(() => deps.notify(HAND_BACK_FAILED))
  }

  const announceAdopted = (session: Adopted): void => {
    deps.notify(nowFollowing(session.title), {
      label: UNDO_LABEL,
      run: () => handBack(session.concivSessionId),
    })
  }

  const finish = (session: Adopted): void => {
    setStep(CLOSED)
    setRequested(false)
    deps.navigate(session.concivSessionId)
    announceAdopted(session)
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

  const pollMs = (): number | false => {
    if (!requested()) return false
    if (adopt.isPending) return false
    return step().kind === 'reload' ? DIAL_IN_POLL_MS : POLL_MS
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

  const start = (): void => {
    setEpoch((count) => count + 1)
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

  const close = (): void => {
    setEpoch((count) => count + 1)
    setUndecided(false)
    setRequested(false)
    setStep(CLOSED)
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

  const done = (): void => {
    const session = adopted()
    if (!session) return
    finish(session)
  }

  return {
    step,
    candidates: () => candidates.data,
    loading: () => candidates.isLoading,
    refreshing: () => candidates.isFetching && candidates.data !== undefined,
    failure: () => (candidates.isError ? reasonOf(candidates.error) : null),
    stale: () => isStale(candidates.dataUpdatedAt, now()),
    checkedAt: () => candidates.dataUpdatedAt,
    connectingId: () => (adopt.isPending ? (adopt.variables?.sessionId ?? null) : null),
    dialledIn: () => {
      const following = adopted()
      if (step().kind !== 'reload' || !following) return false
      return candidates.data?.some((row) => row.sessionId === following.harnessSessionId && row.ready) ?? false
    },
    contactLost: () => step().kind === 'reload' && candidates.isError,
    busy: () => adopt.isPending && !dialogIsOpen(step()),
    start,
    prefetch: () => void deps.queryClient.prefetchQuery(deps.utils.sessions.attachCandidates.queryOptions()),
    close,
    pick,
    retry,
    refresh: () => void candidates.refetch(),
    back: () => setStep(stepOnBack()),
    done,
  }
}
