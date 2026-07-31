import {createMemo, type Accessor} from 'solid-js'
import {createStore, reconcile, unwrap} from 'solid-js/store'
import type {MultimodalContent} from '@tanstack/ai-client'
import type {ComposerDraft} from '@conciv/ui-kit-chat'
import type {StagedGrab} from '../app/pane-context.js'
import type {Conflict} from './conflict.js'
import {
  IDLE_SEND,
  planFor,
  questionOf,
  transition,
  type SendAttempt,
  type SendEvent,
  type SendPlan,
  type SendState,
} from './send-machine.js'

export type SendGuardDeps = {
  attached: () => boolean
  delivered: () => boolean
  snapshot: () => ComposerDraft | null
  restore: (draft: ComposerDraft) => void
  clearDraft: () => void
  grabs: () => StagedGrab[]
  stageGrabs: (grabs: StagedGrab[]) => void
  clearGrabs: () => void
  focusComposer: () => void
  detach: () => Promise<unknown>
  dispatch: (content: string | MultimodalContent, force: boolean) => Promise<void>
  onFailed: (error: unknown) => void
}

export type SendGuard = {
  conflict: Accessor<Conflict>
  beforeSend: (content: string | MultimodalContent) => boolean
  onSend: (content: string | MultimodalContent) => void
  rejected: (error: unknown) => void
  cancel: () => void
  takeOver: () => void
  sendAnyway: () => void
}

function reasonOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export function makeSendGuard(deps: SendGuardDeps): SendGuard {
  const [state, setState] = createStore<SendState>({...IDLE_SEND})
  const conflict = createMemo(() => questionOf(state))
  let lastAttemptId = 0

  const capture = (content: string | MultimodalContent): SendAttempt => {
    lastAttemptId += 1
    return {id: lastAttemptId, content, draft: deps.snapshot(), grabs: deps.grabs()}
  }

  const putBack = (attempt: SendAttempt): void => {
    const draft = unwrap(attempt.draft)
    if (draft) deps.restore(draft)
    deps.stageGrabs(unwrap(attempt.grabs))
  }

  const send = (attempt: SendAttempt, force: boolean): void => {
    deps.clearDraft()
    void deps.dispatch(unwrap(attempt.content), force).then(() => apply({type: 'delivered', attemptId: attempt.id}))
  }

  const handOver = (attempt: SendAttempt): void => {
    void deps.detach().then(
      () => apply({type: 'detachSettled', attemptId: attempt.id}),
      (error: unknown) => apply({type: 'takeOverFailed', attemptId: attempt.id, reason: reasonOf(error)}),
    )
  }

  const runPlan = (plan: SendPlan): void => {
    if (plan.abandoned) putBack(plan.abandoned)
    if (plan.cancelled) deps.focusComposer()
    if (plan.starting) send(plan.starting.attempt, plan.starting.force)
    if (plan.cleared) deps.clearGrabs()
    if (plan.failure) {
      putBack(plan.failure.attempt)
      deps.onFailed(plan.failure.error)
    }
    if (plan.handing) handOver(plan.handing)
  }

  const apply = (event: SendEvent): SendState => {
    const before = unwrap(state)
    const after = transition(before, event)
    if (after === before) return before
    const plan = planFor(before, after, event)
    setState(reconcile(after, {key: 'id'}))
    runPlan(plan)
    return after
  }

  const beforeSend = (content: string | MultimodalContent): boolean => {
    const after = apply({type: 'send', attempt: capture(content), attached: deps.attached()})
    return after.kind === 'sending'
  }

  const onSend = (content: string | MultimodalContent): void => {
    if (state.kind === 'sending') return
    apply({type: 'send', attempt: capture(content), attached: deps.attached()})
  }

  return {
    conflict,
    beforeSend,
    onSend,
    rejected: (error) => void apply({type: 'rejected', error, delivered: deps.delivered()}),
    cancel: () => void apply({type: 'cancel'}),
    takeOver: () => void apply({type: 'takeOver'}),
    sendAnyway: () => void apply({type: 'sendAnyway'}),
  }
}
