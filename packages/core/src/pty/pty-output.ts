import {Cause, Effect, Queue, Stream} from 'effect'
import type {TtyServerControl} from '@conciv/protocol/terminal-types'
import type {TtySession} from './pty-sessions.js'

export const OUTPUT_CAPACITY = 1024

export type PtyOutputItem = {type: 'output'; data: string} | {type: 'meta'; cursor: number} | TtyServerControl

export type PtyOutputEvent = {item: PtyOutputItem; cursor: number | null}

type PtyOutputOptions<Failure> = {cursor?: number; capacity?: number; overflow: () => Failure}

export function ptyOutput<Failure>(
  session: TtySession,
  options: PtyOutputOptions<Failure>,
): Stream.Stream<PtyOutputEvent, Failure> {
  const subscribe = Effect.gen(function* () {
    const queue = yield* Queue.dropping<PtyOutputEvent, Failure>(options.capacity ?? OUTPUT_CAPACITY)
    const offer = (event: PtyOutputEvent): void => {
      if (!Queue.offerUnsafe(queue, event)) Queue.failCauseUnsafe(queue, Cause.fail(options.overflow()))
    }
    const detach = session.attach(
      {
        data: (data, end) => offer({item: {type: 'output', data}, cursor: end}),
        control: (frame) => offer({item: frame, cursor: null}),
      },
      options.cursor,
    )
    const cursor = session.cursor()
    offer({item: {type: 'meta', cursor}, cursor})
    return {queue, detach}
  })
  return Stream.unwrap(
    Effect.acquireRelease(subscribe, ({queue, detach}) =>
      Effect.sync(detach).pipe(Effect.andThen(Queue.shutdown(queue)), Effect.asVoid),
    ).pipe(Effect.map(({queue}) => Stream.fromQueue(queue))),
  )
}
