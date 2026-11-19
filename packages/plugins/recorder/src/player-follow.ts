import {Effect, Ref, Schedule, Stream, Schema} from 'effect'
import type {RrwebEvent} from './rpc.js'

export const FollowFailed = Schema.TaggedStruct('RecorderFollowFailed', {cause: Schema.Defect()})
export type FollowFailed = typeof FollowFailed.Type & globalThis.Error

export const makeFollowFailed = (fields: Omit<typeof FollowFailed.Type, '_tag'>): FollowFailed =>
  Object.assign(new globalThis.Error(), FollowFailed.make(fields), {name: 'RecorderFollowFailed'})

export type ReplaySource = {readonly events: RrwebEvent[]; readonly cursor: number}

const FOLLOW_BACKOFF = Schedule.min([Schedule.exponential('1 second'), Schedule.spaced('30 seconds')])

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
