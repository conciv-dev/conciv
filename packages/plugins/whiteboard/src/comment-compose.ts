import {Deferred, Duration, Effect, FiberHandle, Schema, Stream, SubscriptionRef} from 'effect'
import type {ElementRect, Grab} from '@conciv/plugin/experimental/grab'
import type {ChatCover, ComposeTarget} from './comments-model.js'

export type ComposePhase =
  | {readonly status: 'idle'}
  | {readonly status: 'picking'}
  | {
      readonly status: 'composing'
      readonly target: ComposeTarget
      readonly anchor: ElementRect
      readonly reply: Deferred.Deferred<string>
    }

const CommentsUnbound = Schema.TaggedStruct('Whiteboard.CommentsUnbound', {})
type CommentsUnbound = typeof CommentsUnbound.Type

export type ComposeSteps = {
  readonly pick: () => Promise<Grab | null>
  readonly canvasOpen: () => boolean
  readonly added: () => void
  readonly unbound: () => void
}

const IDLE: ComposePhase = {status: 'idle'}
const FALLBACK_ANCHOR: ElementRect = {x: 80, y: 80, width: 0, height: 0}
const BINDING_WAIT = Duration.seconds(5)

function readComposeTarget(anchor: ElementRect, grab: Grab): ComposeTarget {
  return {
    source: grab.source ? {file: grab.source.filePath, line: grab.source.lineNumber} : null,
    screen: {x: anchor.x + anchor.width / 2, y: anchor.y + anchor.height / 2},
  }
}

const isBound = (bound: ChatCover | undefined): bound is ChatCover => bound !== undefined
const commentsUnbound = (): CommentsUnbound => CommentsUnbound.make({})

export const makeCommentCompose = Effect.gen(function* () {
  const phase = yield* SubscriptionRef.make<ComposePhase>(IDLE)
  const cover = yield* SubscriptionRef.make<ChatCover | undefined>(undefined)
  const running = yield* FiberHandle.make<void>()

  const boundCover = SubscriptionRef.changes(cover).pipe(
    Stream.filter(isBound),
    Stream.runHead,
    Effect.timeout(BINDING_WAIT),
    Effect.flatMap(Effect.fromOption(commentsUnbound)),
    Effect.mapError(commentsUnbound),
  )

  const compose = (steps: ComposeSteps) =>
    Effect.gen(function* () {
      yield* SubscriptionRef.set(phase, {status: 'picking'})
      const grab = yield* Effect.tryPromise(steps.pick).pipe(
        Effect.tapError((error) => Effect.logWarning('[whiteboard] the element pick failed', error)),
        Effect.orElseSucceed(() => null),
      )
      if (!grab) return
      const anchor = grab.rect ?? FALLBACK_ANCHOR
      const target = readComposeTarget(anchor, grab)
      const reply = yield* Deferred.make<string>()
      yield* SubscriptionRef.set(phase, {status: 'composing', target, anchor, reply})
      const text = (yield* Deferred.await(reply)).trim()
      if (!text) return
      const bound = yield* boundCover
      const reveal = steps.canvasOpen()
      bound.addComment(target, text, reveal)
      if (!reveal) steps.added()
    }).pipe(
      Effect.catchTag('Whiteboard.CommentsUnbound', (error) =>
        Effect.logWarning('[whiteboard] the comments never bound, the comment was not added', error).pipe(
          Effect.andThen(Effect.sync(steps.unbound)),
        ),
      ),
      Effect.ensuring(SubscriptionRef.set(phase, IDLE)),
    )

  const answer = (text: string) =>
    SubscriptionRef.get(phase).pipe(
      Effect.flatMap((current) =>
        current.status === 'composing' ? Deferred.succeed(current.reply, text) : Effect.succeed(false),
      ),
    )

  return {
    phase,
    cover,
    start: (steps: ComposeSteps) => FiberHandle.run(running, compose(steps), {onlyIfMissing: true}),
    answer,
  }
})
