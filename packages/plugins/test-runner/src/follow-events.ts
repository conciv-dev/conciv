import {Effect, Schedule, Schema, Stream} from 'effect'

const StreamFailed = Schema.TaggedStruct('TestRunner.StreamFailed', {cause: Schema.Defect()})
type StreamFailed = typeof StreamFailed.Type & globalThis.Error
const makeStreamFailed = (fields: Omit<typeof StreamFailed.Type, '_tag'>): StreamFailed =>
  Object.assign(new globalThis.Error(), StreamFailed.make(fields), {name: 'TestRunner.StreamFailed'})

export const FOLLOW_AGAIN = Schedule.spaced('1 second')

export function followEvents<Event>(
  events: AsyncIterable<Event>,
  schedule: Schedule.Schedule<unknown>,
): Stream.Stream<Event, StreamFailed> {
  return Stream.fromAsyncIterable(events, (cause) => makeStreamFailed({cause})).pipe(
    Stream.tapError((error) =>
      Effect.logWarning('[test-runner] following engine events failed; following again', error.cause),
    ),
    Stream.retry(schedule),
    Stream.repeat(schedule),
  )
}
