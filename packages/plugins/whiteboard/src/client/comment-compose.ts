import {Effect, FiberHandle, Option, Stream, SubscriptionRef} from 'effect'
import type {Grab} from '@conciv/plugin/experimental/grab'
import type {ChatCover, ComposeTarget} from './model/comments-model.js'

export type ComposePhase =
  | {readonly status: 'idle'}
  | {readonly status: 'picking'}
  | {readonly status: 'composing'; readonly target: ComposeTarget}

export type ComposeSteps = {
  readonly pick: () => Promise<Grab | null>
  readonly ask: () => Promise<string | undefined>
  readonly canvasOpen: () => boolean
  readonly added: () => void
}

const IDLE: ComposePhase = {status: 'idle'}
const FALLBACK_POINT = {x: 80, y: 80}

function readComposeTarget(grab: Grab): ComposeTarget {
  return {
    source: grab.source ? {file: grab.source.filePath, line: grab.source.lineNumber} : null,
    screen: grab.rect ? {x: grab.rect.x + grab.rect.width / 2, y: grab.rect.y + grab.rect.height / 2} : FALLBACK_POINT,
  }
}

export const makeCommentCompose = Effect.gen(function* () {
  const phase = yield* SubscriptionRef.make<ComposePhase>(IDLE)
  const cover = yield* SubscriptionRef.make<ChatCover | undefined>(undefined)
  const running = yield* FiberHandle.make<void>()

  const boundCover = SubscriptionRef.changes(cover).pipe(
    Stream.filter((bound): bound is ChatCover => bound !== undefined),
    Stream.runHead,
  )

  const compose = (steps: ComposeSteps) =>
    Effect.gen(function* () {
      yield* SubscriptionRef.set(phase, {status: 'picking'})
      const grab = yield* Effect.tryPromise(steps.pick).pipe(
        Effect.tapError((error) => Effect.logWarning('[whiteboard] the element pick failed', error)),
        Effect.orElseSucceed(() => null),
      )
      if (!grab) return
      const target = readComposeTarget(grab)
      yield* SubscriptionRef.set(phase, {status: 'composing', target})
      const answer = yield* Effect.tryPromise(steps.ask).pipe(
        Effect.tapError((error) => Effect.logWarning('[whiteboard] the comment dialog failed', error)),
        Effect.orElseSucceed(() => undefined),
      )
      const text = answer?.trim()
      if (!text) return
      const bound = yield* boundCover
      if (Option.isNone(bound)) return
      const reveal = steps.canvasOpen()
      bound.value.addComment(target, text, reveal)
      if (!reveal) steps.added()
    }).pipe(Effect.ensuring(SubscriptionRef.set(phase, IDLE)))

  return {
    phase,
    cover,
    start: (steps: ComposeSteps) => FiberHandle.run(running, compose(steps), {onlyIfMissing: true}),
  }
})
