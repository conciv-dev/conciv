import {describe, expect, test} from 'vitest'
import {Effect, Exit, Layer, Queue, Ref, Scope, Stream} from 'effect'
import {TestClock} from 'effect/testing'
import {makeBundleSource, PluginEngine, type EngineSignal} from './bundle-source'
import {
  createHostState,
  transitionHost,
  type HostCommand,
  type HostEndpoint,
  type HostEvent,
  type HostState,
} from './host-machine'

const first: HostEndpoint = {url: 'http://127.0.0.1:4096', authorization: 'Basic a'}

const second: HostEndpoint = {url: 'http://127.0.0.1:4097', authorization: 'Basic b'}

function replay(events: readonly HostEvent<string>[], from: HostState = createHostState()) {
  return events.reduce<{state: HostState; commands: (readonly HostCommand<string>[])[]}>(
    (result, event) => {
      const next = transitionHost(result.state, event)

      return {state: next.state, commands: [...result.commands, next.commands]}
    },
    {state: from, commands: []},
  )
}

const live = {quitting: false}

describe('plugin host follow', () => {
  test('never applies a listing from an endpoint the server already left', () => {
    const run = replay([
      {type: 'started', endpoint: first, ...live},
      {type: 'relist.requested', watchAttempt: 1, ...live},
      {type: 'endpoint.changed', endpoint: second, ...live},
      {type: 'list.succeeded', attempt: 2, listing: 'from first', ...live},
    ])

    expect(run.commands).toEqual([
      [{type: 'subscribe-credentials'}, {type: 'start-watch', attempt: 1, endpoint: first}],
      [{type: 'start-list', attempt: 2, endpoint: first, timeoutMs: 30_000}],
      [{type: 'cancel-watch'}, {type: 'cancel-list'}, {type: 'start-watch', attempt: 3, endpoint: second}],
      [],
    ])
  })

  test('coalesces changes during a listing into one more listing', () => {
    const listing = replay([
      {type: 'started', endpoint: first, ...live},
      {type: 'relist.requested', watchAttempt: 1, ...live},
      {type: 'relist.requested', watchAttempt: 1, ...live},
    ]).state

    expect(transitionHost(listing, {type: 'relist.requested', watchAttempt: 1, ...live}).state).toBe(listing)

    const ends: HostEvent<string>[] = [
      {type: 'list.succeeded', attempt: 2, listing: 'plugins', ...live},
      {type: 'list.failed', attempt: 2, cause: 'offline', ...live},
      {type: 'list.timed-out', attempt: 2, ...live},
    ]

    expect(ends.map((event) => transitionHost(listing, event).commands)).toEqual([
      [
        {type: 'apply-listing', listing: 'plugins'},
        {type: 'start-list', attempt: 3, endpoint: first, timeoutMs: 30_000},
      ],
      [
        {type: 'log-list-error', cause: 'offline'},
        {type: 'start-list', attempt: 3, endpoint: first, timeoutMs: 30_000},
      ],
      [
        {type: 'cancel-list'},
        {type: 'log-list-error', cause: expect.any(Error)},
        {type: 'start-list', attempt: 3, endpoint: first, timeoutMs: 30_000},
      ],
    ])
  })

  test('retries an ended stream after a pause and ignores events from the old one', () => {
    const run = replay([
      {type: 'started', endpoint: first, ...live},
      {type: 'watch.ended', attempt: 1, ...live},
      {type: 'relist.requested', watchAttempt: 1, ...live},
      {type: 'watch.retry-due', attempt: 2, ...live},
    ])

    expect(run.commands.slice(1)).toEqual([
      [{type: 'schedule-watch-retry', attempt: 2, delayMs: 1_000}],
      [],
      [{type: 'start-watch', attempt: 3, endpoint: first}],
    ])
  })

  test('a reconnect on the same endpoint follows anew and keeps the running listing', () => {
    const run = replay([
      {type: 'started', endpoint: first, ...live},
      {type: 'relist.requested', watchAttempt: 1, ...live},
      {type: 'endpoint.changed', endpoint: {...first}, ...live},
      {type: 'list.succeeded', attempt: 2, listing: 'plugins', ...live},
    ])

    expect(run.commands.slice(2)).toEqual([
      [{type: 'cancel-watch'}, {type: 'start-watch', attempt: 3, endpoint: first}],
      [{type: 'apply-listing', listing: 'plugins'}],
    ])
  })

  test('stops following on stop and starts again on resume', () => {
    const run = replay([
      {type: 'started', endpoint: first, ...live},
      {type: 'relist.requested', watchAttempt: 1, ...live},
      {type: 'stopped'},
      {type: 'list.succeeded', attempt: 2, listing: 'late', ...live},
      {type: 'resumed', endpoint: first, ...live},
    ])

    expect(run.commands.slice(2)).toEqual([
      [{type: 'unsubscribe-credentials'}, {type: 'cancel-watch'}, {type: 'cancel-list'}],
      [],
      [{type: 'subscribe-credentials'}, {type: 'start-watch', attempt: 3, endpoint: first}],
    ])
  })

  test('does not start following while the app quits, and drops a listing that lands during the quit', () => {
    const stopped = createHostState()

    expect(transitionHost(stopped, {type: 'started', endpoint: first, quitting: true}).state).toBe(stopped)

    const listing = replay([
      {type: 'started', endpoint: first, ...live},
      {type: 'relist.requested', watchAttempt: 1, ...live},
    ]).state

    expect(
      transitionHost(listing, {type: 'list.succeeded', attempt: 2, listing: 'plugins', quitting: true}).commands,
    ).toEqual([])
  })
})

describe('plugin bundle loading driver on the test clock', () => {
  test('a listing times out after 30 s, a dropped watch resubscribes after 1 s, and teardown stops the list and the retry', () =>
    Effect.runPromise(
      Effect.gen(function* () {
        const counts = yield* Ref.make({subscriptions: 0, lists: 0, listsStopped: 0})
        const drops = yield* Queue.unbounded<void>()
        const connected: EngineSignal = {type: 'server.connected'}
        const engine = Layer.succeed(PluginEngine, {
          reachability: () => Effect.succeed(Stream.never),
          events: Stream.unwrap(
            Ref.update(counts, (count) => ({...count, subscriptions: count.subscriptions + 1})).pipe(
              Effect.as(Stream.concat(Stream.make(connected), Stream.drain(Stream.fromEffect(Queue.take(drops))))),
            ),
          ),
          list: Ref.update(counts, (count) => ({...count, lists: count.lists + 1})).pipe(
            Effect.andThen(
              Effect.never.pipe(
                Effect.onInterrupt(() =>
                  Ref.update(counts, (count) => ({...count, listsStopped: count.listsStopped + 1})),
                ),
              ),
            ),
          ),
          bundle: () => Effect.never,
          enableState: Stream.never,
          setEnabled: () => Effect.void,
        })
        const scope = yield* Scope.make()
        const source = yield* makeBundleSource({
          address: first.url,
          addresses: Stream.concat(Stream.make(first.url), Stream.never),
          builtins: [],
        }).pipe(Scope.provide(scope), Effect.provide(engine))

        yield* TestClock.adjust(29_999)
        expect(yield* Ref.get(counts)).toEqual({subscriptions: 1, lists: 1, listsStopped: 0})

        yield* TestClock.adjust(1)
        expect(yield* Ref.get(counts)).toEqual({subscriptions: 1, lists: 1, listsStopped: 1})
        expect(yield* source.pluginExperimentals).toEqual({plugins: [], reserved: []})

        yield* Queue.offer(drops, undefined)
        yield* TestClock.adjust(999)
        expect(yield* Ref.get(counts)).toEqual({subscriptions: 1, lists: 1, listsStopped: 1})

        yield* TestClock.adjust(1)
        expect(yield* Ref.get(counts)).toEqual({subscriptions: 2, lists: 2, listsStopped: 1})

        yield* Queue.offer(drops, undefined)
        yield* TestClock.adjust(0)
        yield* Scope.close(scope, Exit.void)
        expect(yield* Ref.get(counts)).toEqual({subscriptions: 2, lists: 2, listsStopped: 2})
        expect(yield* Effect.flip(source.enableLoaded)).toEqual({
          _tag: 'PluginSourceClosed',
          message: 'the plugin manager was disposed',
        })

        yield* TestClock.adjust(60_000)
        expect(yield* Ref.get(counts)).toEqual({subscriptions: 2, lists: 2, listsStopped: 2})
      }).pipe(Effect.provide(TestClock.layer())),
    ))
})
