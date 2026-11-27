import {Deferred, Duration, Effect, FiberHandle, Stream, SubscriptionRef} from 'effect'
import type {ElementRect, Grab} from '@conciv/frontend-plugin-api/grab'
import type {ChatCover, ComposeTarget} from './comments-model.js'
import {WhiteboardComposeMachine} from './comment-compose-machine.js'
import {canvasErrors} from './errors/canvas-errors.js'

type ComposeSteps = {
  readonly pick: () => Promise<Grab | null>
  readonly canvasOpen: () => boolean
  readonly added: () => void
  readonly unbound: () => void
}

const FALLBACK_ANCHOR: ElementRect = {x: 80, y: 80, width: 0, height: 0}

function readComposeTarget(anchor: ElementRect, grab: Grab): ComposeTarget {
  return {
    source: grab.source ? {file: grab.source.filePath, line: grab.source.lineNumber} : null,
    screen: {x: anchor.x + anchor.width / 2, y: anchor.y + anchor.height / 2},
  }
}

const commentsUnbound = () => canvasErrors.COMMENTS_UNBOUND()

export const makeCommentCompose = (bindDeadlineMs: number) =>
  Effect.gen(function* () {
    const phase = yield* SubscriptionRef.make(WhiteboardComposeMachine.initialCompose)
    const step = (event: Parameters<typeof WhiteboardComposeMachine.transitionCompose>[1]) =>
      SubscriptionRef.update(phase, (current) => WhiteboardComposeMachine.transitionCompose(current, event))
    const cover = yield* SubscriptionRef.make<ChatCover | undefined>(undefined)
    const running = yield* FiberHandle.make<void>()

    const boundCover = (room: string | undefined) =>
      SubscriptionRef.changes(cover).pipe(
        Stream.filter((next): next is ChatCover => next !== undefined && (room === undefined || next.room === room)),
        Stream.runHead,
        Effect.timeout(Duration.millis(bindDeadlineMs)),
        Effect.flatMap(Effect.fromOption(commentsUnbound)),
        Effect.mapError(commentsUnbound),
      )

    const roomLeft = (room: string | undefined) =>
      SubscriptionRef.changes(cover).pipe(
        Stream.filter((next) => room !== undefined && next !== undefined && next.room !== room),
        Stream.runHead,
        Effect.as(''),
      )

    const compose = (steps: ComposeSteps) =>
      Effect.gen(function* () {
        const room = (yield* SubscriptionRef.get(cover))?.room
        yield* step({type: 'started'})
        const grab = yield* Effect.tryPromise(steps.pick).pipe(
          Effect.tapError((error) => Effect.logWarning('[whiteboard] the element pick failed', error)),
          Effect.orElseSucceed(() => null),
        )
        if (!grab) return
        const anchor = grab.rect ?? FALLBACK_ANCHOR
        const target = readComposeTarget(anchor, grab)
        const reply = yield* Deferred.make<string>()
        yield* step({type: 'picked', target, anchor, reply})
        const text = (yield* Effect.race(Deferred.await(reply), roomLeft(room))).trim()
        if (!text) return
        const bound = yield* boundCover(room)
        const reveal = steps.canvasOpen()
        bound.addComment(target, text, reveal)
        if (!reveal) steps.added()
      }).pipe(
        Effect.catchIf(
          (error) => error.code === canvasErrors.COMMENTS_UNBOUND.code,
          (error) =>
            Effect.logWarning('[whiteboard] the comments never bound, the comment was not added', error).pipe(
              Effect.andThen(Effect.sync(steps.unbound)),
            ),
        ),
        Effect.ensuring(step({type: 'finished'})),
      )

    const answer = (text: string) =>
      SubscriptionRef.get(phase).pipe(
        Effect.flatMap((current) => {
          const reply = WhiteboardComposeMachine.selectReply(current)
          return reply ? Deferred.succeed(reply, text) : Effect.succeed(false)
        }),
      )

    return {
      phase,
      cover,
      start: (steps: ComposeSteps) => FiberHandle.run(running, compose(steps), {onlyIfMissing: true}),
      answer,
    }
  })
