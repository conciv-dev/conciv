import {createServer} from 'node:http'
import {Deferred, Effect, Exit, Fiber, Layer, Queue, Scope, Stream, SubscriptionRef} from 'effect'
import {TestClock} from 'effect/testing'
import {afterAll, describe, expect, it} from 'vitest'
import {listenLocal} from '@conciv/plugin-testkit/listen-local'
import {connect} from '../src/connect.js'
import {TryItConnectMachine} from '../src/connect-machine.js'
import {makeProbeSilent, probeCore, TryItProbe} from '../src/probe.js'

const closers: Array<() => Promise<void>> = []

afterAll(() => Promise.all(closers.map((close) => close())))

async function serveHealth(token: string): Promise<number> {
  const server = createServer((request, response) => {
    response.writeHead(request.url === `/t/${token}/health` ? 200 : 404)
    response.end('ok')
  })
  const listening = await listenLocal(server)
  closers.push(listening.close)
  return listening.port
}

function probeOnce(token: string, ports: readonly number[]): Promise<string | null> {
  return Effect.runPromise(
    probeCore(token, ports, 2_000).pipe(Effect.catchTag('TryIt.ProbeSilent', () => Effect.succeed(null))),
  )
}

describe('probeCore', () => {
  it('finds a token-gated core on any candidate port', async () => {
    const otherPort = await serveHealth('tok-other')
    const tokenPort = await serveHealth('tok-p')
    expect(await probeOnce('tok-p', [otherPort, tokenPort])).toBe(`http://127.0.0.1:${tokenPort}/t/tok-p`)
  })

  it('resolves null when nothing answers', async () => {
    const otherPort = await serveHealth('tok-other')
    expect(await probeOnce('tok-none', [otherPort])).toBe(null)
  })
})

function replay(events: readonly TryItConnectMachine.ConnectEvent[]) {
  return events.reduce(
    (step, event) => {
      const next = TryItConnectMachine.transitionConnect(step.state, event)
      return {state: next.state, effects: [...step.effects, ...next.effects]}
    },
    {state: TryItConnectMachine.initialConnect.state, effects: TryItConnectMachine.initialConnect.effects},
  )
}

describe('connect machine', () => {
  const base = 'http://127.0.0.1:4000/t/tok'

  it('starts probing with one unspaced first sweep', () => {
    expect(TryItConnectMachine.initialConnect).toEqual({
      state: {status: 'probing', attempt: 1, slow: false, copied: false},
      effects: [{type: 'sweep', attempt: 1, retry: false}],
    })
  })

  it('a first sweep that answers connects at once, with no hold', () => {
    expect(replay([{type: 'answered', attempt: 1, base}])).toEqual({
      state: {status: 'connected', base},
      effects: [{type: 'sweep', attempt: 1, retry: false}, {type: 'stopSlow'}],
    })
  })

  it('a silent first sweep starts the slow hint and a spaced sweep, and a later answer holds before connecting', () => {
    const events: TryItConnectMachine.ConnectEvent[] = [
      {type: 'silent', attempt: 1},
      {type: 'copied'},
      {type: 'answered', attempt: 2, base},
    ]
    expect(replay(events)).toEqual({
      state: {status: 'holding', base, copied: true},
      effects: [
        {type: 'sweep', attempt: 1, retry: false},
        {type: 'startSlow'},
        {type: 'sweep', attempt: 2, retry: true},
        {type: 'stopSlow'},
        {type: 'startHold'},
      ],
    })
    expect(replay([...events, {type: 'holdElapsed'}]).state).toEqual({status: 'connected', base})
  })

  it('the slow hint marks probing slow once', () => {
    const slow = replay([{type: 'silent', attempt: 1}, {type: 'slowElapsed'}]).state
    expect(slow).toEqual({status: 'probing', attempt: 2, slow: true, copied: false})
    expect(TryItConnectMachine.transitionConnect(slow, {type: 'slowElapsed'}).state).toBe(slow)
  })

  it('copying marks probing and holding copied, once', () => {
    const copied = replay([{type: 'copied'}]).state
    expect(copied).toEqual({status: 'probing', attempt: 1, slow: false, copied: true})
    expect(TryItConnectMachine.transitionConnect(copied, {type: 'copied'}).state).toBe(copied)
    const holding = replay([{type: 'silent', attempt: 1}, {type: 'answered', attempt: 2, base}, {type: 'copied'}])
    expect(holding.state).toEqual({status: 'holding', base, copied: true})
  })

  it('stale attempts return the same state object', () => {
    const probing = replay([{type: 'silent', attempt: 1}]).state
    expect(TryItConnectMachine.transitionConnect(probing, {type: 'silent', attempt: 1})).toEqual({
      state: probing,
      effects: [],
    })
    expect(TryItConnectMachine.transitionConnect(probing, {type: 'silent', attempt: 1}).state).toBe(probing)
    expect(TryItConnectMachine.transitionConnect(probing, {type: 'answered', attempt: 1, base}).state).toBe(probing)
    expect(TryItConnectMachine.transitionConnect(probing, {type: 'answered', attempt: 3, base}).state).toBe(probing)
  })

  it('events that do not apply return the same state object', () => {
    const probing = TryItConnectMachine.initialConnect.state
    expect(TryItConnectMachine.transitionConnect(probing, {type: 'holdElapsed'}).state).toBe(probing)
    const connected = replay([{type: 'answered', attempt: 1, base}]).state
    const ignored: TryItConnectMachine.ConnectEvent[] = [
      {type: 'answered', attempt: 1, base},
      {type: 'silent', attempt: 1},
      {type: 'slowElapsed'},
      {type: 'holdElapsed'},
      {type: 'copied'},
    ]
    ignored.forEach((event) =>
      expect(TryItConnectMachine.transitionConnect(connected, event)).toEqual({state: connected, effects: []}),
    )
    const holding = replay([
      {type: 'silent', attempt: 1},
      {type: 'answered', attempt: 2, base},
    ]).state
    expect(TryItConnectMachine.transitionConnect(holding, {type: 'slowElapsed'}).state).toBe(holding)
    expect(TryItConnectMachine.transitionConnect(holding, {type: 'answered', attempt: 2, base}).state).toBe(holding)
  })

  it('disposal ends every state, and nothing applies after it', () => {
    expect(TryItConnectMachine.transitionConnect(TryItConnectMachine.initialConnect.state, {type: 'disposed'})).toEqual(
      {
        state: {status: 'disposed'},
        effects: [{type: 'stopSlow'}],
      },
    )
    const states: TryItConnectMachine.ConnectState[] = [
      replay([
        {type: 'silent', attempt: 1},
        {type: 'answered', attempt: 2, base},
      ]).state,
      replay([{type: 'answered', attempt: 1, base}]).state,
    ]
    states.forEach((state) =>
      expect(TryItConnectMachine.transitionConnect(state, {type: 'disposed'})).toEqual({
        state: {status: 'disposed'},
        effects: [],
      }),
    )
    const disposed = TryItConnectMachine.transitionConnect(TryItConnectMachine.initialConnect.state, {
      type: 'disposed',
    }).state
    const late: TryItConnectMachine.ConnectEvent[] = [
      {type: 'answered', attempt: 1, base},
      {type: 'silent', attempt: 1},
      {type: 'slowElapsed'},
      {type: 'holdElapsed'},
      {type: 'copied'},
      {type: 'disposed'},
    ]
    late.forEach((event) =>
      expect(TryItConnectMachine.transitionConnect(disposed, event)).toEqual({state: disposed, effects: []}),
    )
  })
})

type Outcome = string | null

const runClocked = <A, E>(effect: Effect.Effect<A, E, Scope.Scope>) =>
  Effect.runPromise(effect.pipe(Effect.scoped, Effect.provide(TestClock.layer())))

const scriptedProbe = (outcomes: Queue.Queue<Outcome>) =>
  Layer.succeed(TryItProbe, {
    probe: Queue.take(outcomes).pipe(
      Effect.flatMap((outcome) => (outcome === null ? Effect.fail(makeProbeSilent()) : Effect.succeed(outcome))),
    ),
  })

const reach = (
  state: SubscriptionRef.SubscriptionRef<TryItConnectMachine.ConnectState>,
  done: (current: TryItConnectMachine.ConnectState) => boolean,
) => SubscriptionRef.changes(state).pipe(Stream.filter(done), Stream.runHead)

const collectUntil = Effect.fn(function* (
  state: SubscriptionRef.SubscriptionRef<TryItConnectMachine.ConnectState>,
  done: (current: TryItConnectMachine.ConnectState) => boolean,
) {
  const subscribed = yield* Deferred.make<void>()
  const collected = yield* SubscriptionRef.changes(state).pipe(
    Stream.tap(() => Deferred.succeed(subscribed, undefined)),
    Stream.takeUntil(done),
    Stream.runCollect,
    Effect.forkScoped,
  )
  yield* Deferred.await(subscribed)
  return Fiber.join(collected).pipe(Effect.map((states) => Array.from(states)))
})

describe('connect driver', () => {
  const timings = {probeMs: 2_000, holdMs: 600, slowMs: 60_000}
  const base = 'http://127.0.0.1:4000/t/tok'

  it('a core that answers the first sweep is connected at once, with no hold', () =>
    runClocked(
      Effect.gen(function* () {
        const outcomes = yield* Queue.unbounded<Outcome>()
        const connection = yield* connect({timings}).pipe(Effect.provide(scriptedProbe(outcomes)))
        const seen = yield* collectUntil(connection.state, (current) => current.status === 'connected')
        yield* Queue.offer(outcomes, base)
        expect(yield* seen).toEqual([
          {status: 'probing', attempt: 1, slow: false, copied: false},
          {status: 'connected', base},
        ])
      }),
    ))

  it('a core that answers a later sweep is held as connected for holdMs before the hand-off', () =>
    runClocked(
      Effect.gen(function* () {
        const outcomes = yield* Queue.unbounded<Outcome>()
        const connection = yield* connect({timings}).pipe(Effect.provide(scriptedProbe(outcomes)))
        const seen = yield* collectUntil(connection.state, (current) => current.status === 'connected')
        yield* Queue.offerAll(outcomes, [null, base])
        yield* reach(connection.state, (current) => current.status === 'holding')
        yield* TestClock.adjust(timings.holdMs - 1)
        expect(yield* SubscriptionRef.get(connection.state)).toEqual({status: 'holding', base, copied: false})
        yield* TestClock.adjust(1)
        expect(yield* seen).toEqual([
          {status: 'probing', attempt: 1, slow: false, copied: false},
          {status: 'probing', attempt: 2, slow: false, copied: false},
          {status: 'holding', base, copied: false},
          {status: 'connected', base},
        ])
      }),
    ))

  it('retries a silent sweep every probeMs until a core answers', () =>
    runClocked(
      Effect.gen(function* () {
        const outcomes = yield* Queue.unbounded<Outcome>()
        const connection = yield* connect({timings}).pipe(Effect.provide(scriptedProbe(outcomes)))
        yield* Queue.offerAll(outcomes, [null, null, base])
        yield* reach(connection.state, (current) => current.status === 'probing' && current.attempt === 2)
        yield* TestClock.adjust(timings.probeMs - 1)
        expect(yield* Queue.size(outcomes)).toBe(1)
        yield* TestClock.adjust(1)
        yield* reach(connection.state, (current) => current.status === 'holding')
        expect(yield* Queue.size(outcomes)).toBe(0)
      }),
    ))

  it('hints that setup is slow once no core has answered for slowMs', () =>
    runClocked(
      Effect.gen(function* () {
        const outcomes = yield* Queue.unbounded<Outcome>()
        const connection = yield* connect({timings}).pipe(Effect.provide(scriptedProbe(outcomes)))
        const seen = yield* collectUntil(connection.state, (current) => current.status === 'probing' && current.slow)
        yield* Queue.offer(outcomes, null)
        yield* reach(connection.state, (current) => current.status === 'probing' && current.attempt === 2)
        yield* TestClock.adjust(timings.slowMs - 1)
        expect(yield* SubscriptionRef.get(connection.state)).toEqual({
          status: 'probing',
          attempt: 2,
          slow: false,
          copied: false,
        })
        yield* TestClock.adjust(1)
        expect(yield* seen).toEqual([
          {status: 'probing', attempt: 1, slow: false, copied: false},
          {status: 'probing', attempt: 2, slow: false, copied: false},
          {status: 'probing', attempt: 2, slow: true, copied: false},
        ])
      }),
    ))

  it('an answer ends the slow hint, so nothing is dispatched at slowMs once probing is over', () =>
    runClocked(
      Effect.gen(function* () {
        const outcomes = yield* Queue.unbounded<Outcome>()
        const connection = yield* connect({timings: {...timings, holdMs: 120_000}}).pipe(
          Effect.provide(scriptedProbe(outcomes)),
        )
        yield* Queue.offerAll(outcomes, [null, base])
        yield* reach(connection.state, (current) => current.status === 'holding')
        const seen = yield* collectUntil(connection.state, (current) => current.status === 'holding' && current.copied)
        yield* TestClock.adjust(timings.slowMs)
        yield* connection.dispatch({type: 'copied'})
        expect(yield* seen).toEqual([
          {status: 'holding', base, copied: false},
          {status: 'holding', base, copied: true},
        ])
      }),
    ))

  it('dispatches copied into the state', () =>
    runClocked(
      Effect.gen(function* () {
        const outcomes = yield* Queue.unbounded<Outcome>()
        const connection = yield* connect({timings}).pipe(Effect.provide(scriptedProbe(outcomes)))
        yield* connection.dispatch({type: 'copied'})
        expect(yield* SubscriptionRef.get(connection.state)).toEqual({
          status: 'probing',
          attempt: 1,
          slow: false,
          copied: true,
        })
      }),
    ))

  it('closing its scope disposes the state and interrupts every sweep and timer', () =>
    runClocked(
      Effect.gen(function* () {
        const outcomes = yield* Queue.unbounded<Outcome>()
        const scope = yield* Scope.make()
        const connection = yield* connect({timings}).pipe(Effect.provide(scriptedProbe(outcomes)), Scope.provide(scope))
        yield* Queue.offer(outcomes, null)
        yield* reach(connection.state, (current) => current.status === 'probing' && current.attempt === 2)
        yield* Scope.close(scope, Exit.void)
        expect(yield* SubscriptionRef.get(connection.state)).toEqual({status: 'disposed'})
        yield* Queue.offer(outcomes, base)
        yield* TestClock.adjust(timings.slowMs)
        expect(yield* Queue.size(outcomes)).toBe(1)
        expect(yield* SubscriptionRef.get(connection.state)).toEqual({status: 'disposed'})
      }),
    ))
})
