import {createSignal, type Accessor} from 'solid-js'
import type {MultimodalContent} from '@tanstack/ai-client'
import type {ComposerDraft} from '@conciv/ui-kit-chat'
import type {StagedGrab} from '../app/pane-context.js'
import {ATTACHED_MESSAGE, conflictAfterTakeOver, conflictFor, NO_CONFLICT, type Conflict} from './conflict.js'

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

type Attempt = {content: string | MultimodalContent; draft: ComposerDraft | null; grabs: StagedGrab[]}

function reasonOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export function makeSendGuard(deps: SendGuardDeps): SendGuard {
  const [conflict, setConflict] = createSignal<Conflict>(NO_CONFLICT)
  const state = {attempt: null as Attempt | null, rejections: 0, epoch: 0, retrying: false}

  const capture = (content: string | MultimodalContent): Attempt => ({
    content,
    draft: deps.snapshot(),
    grabs: deps.grabs(),
  })

  const putBack = (attempt: Attempt): void => {
    if (attempt.draft) deps.restore(attempt.draft)
    deps.stageGrabs(attempt.grabs)
  }

  const succeeded = (): void => {
    state.attempt = null
    state.retrying = false
    setConflict(NO_CONFLICT)
    deps.clearGrabs()
  }

  const dispatch = (attempt: Attempt, force: boolean): void => {
    deps.clearDraft()
    const before = state.rejections
    void deps.dispatch(attempt.content, force).then(() => {
      if (state.rejections !== before) return
      succeeded()
    })
  }

  const beforeSend = (content: string | MultimodalContent): boolean => {
    state.attempt = capture(content)
    if (!deps.attached()) return true
    setConflict({kind: 'attached', message: ATTACHED_MESSAGE})
    return false
  }

  const onSend = (content: string | MultimodalContent): void => {
    const attempt = state.attempt ?? capture(content)
    state.attempt = attempt
    setConflict(NO_CONFLICT)
    dispatch(attempt, false)
  }

  const rejected = (error: unknown): void => {
    const attempt = state.attempt
    if (!attempt) return
    state.rejections += 1
    const retrying = state.retrying
    state.retrying = false
    if (deps.delivered()) {
      state.attempt = null
      return
    }
    const next = retrying ? conflictAfterTakeOver(error) : conflictFor(error)
    if (next.kind === 'none') {
      state.attempt = null
      putBack(attempt)
      deps.onFailed(error)
      return
    }
    setConflict(next)
  }

  const cancel = (): void => {
    state.epoch += 1
    state.retrying = false
    const attempt = state.attempt
    state.attempt = null
    setConflict(NO_CONFLICT)
    if (attempt) putBack(attempt)
    deps.focusComposer()
  }

  const takeOver = (): void => {
    const attempt = state.attempt
    if (!attempt) return
    const mine = state.epoch
    setConflict({kind: 'taking-over', message: ATTACHED_MESSAGE})
    void deps.detach().then(
      () => {
        if (mine !== state.epoch) return
        state.retrying = true
        dispatch(attempt, false)
      },
      (error: unknown) => {
        if (mine !== state.epoch) return
        setConflict({kind: 'take-over-failed', message: ATTACHED_MESSAGE, reason: reasonOf(error)})
      },
    )
  }

  const sendAnyway = (): void => {
    const attempt = state.attempt
    if (!attempt) return
    setConflict(NO_CONFLICT)
    dispatch(attempt, true)
  }

  return {conflict, beforeSend, onSend, rejected, cancel, takeOver, sendAnyway}
}
