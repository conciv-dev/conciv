import {Effect, Ref, Schedule, Stream, Schema} from 'effect'
import type {RrwebEvent} from './rpc.js'

export const FollowFailed = Schema.TaggedStruct('RecorderFollowFailed', {cause: Schema.Defect()})
export type FollowFailed = typeof FollowFailed.Type

export type ReplaySource = {readonly events: RrwebEvent[]; readonly cursor: number}

const FOLLOW_BACKOFF = Schedule.min([Schedule.exponential('1 second'), Schedule.spaced('30 seconds')])

const FOLLOW_AGAIN = Schedule.spaced('1 second')

export function followEvents<Event>(events: AsyncIterable<Event>): Stream.Stream<Event, FollowFailed> {
  return Stream.fromAsyncIterable(events, (cause) => FollowFailed.make({cause})).pipe(
    Stream.tapError((error) =>
      Effect.logWarning('recorder: following engine events failed; following again', error.cause),
    ),
    Stream.retry(FOLLOW_AGAIN),
    Stream.repeat(FOLLOW_AGAIN),
  )
}

export function followRecording(options: {
  readonly cursor: number
  readonly cues: Stream.Stream<unknown, FollowFailed>
  readonly readSince: (cursor: number) => Effect.Effect<ReplaySource, FollowFailed>
}): Stream.Stream<ReplaySource> {
  return Stream.unwrap(
    Effect.map(Ref.make(options.cursor), (cursor) =>
      options.cues.pipe(
        Stream.mapEffect(() => Effect.flatMap(Ref.get(cursor), options.readSince)),
        Stream.tap((fresh) => Ref.set(cursor, fresh.cursor)),
        Stream.tapError((error) => Effect.logWarning('recorder: the replay stopped following new events', error.cause)),
        Stream.retry(FOLLOW_BACKOFF),
        Stream.catchCause(() => Stream.empty),
      ),
    ),
  )
}
