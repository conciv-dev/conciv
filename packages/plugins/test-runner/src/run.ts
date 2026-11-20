import {fileURLToPath} from 'node:url'
import {Duration, Effect, FiberHandle, Option, PubSub, Result, Schema, Semaphore, Stream, SubscriptionRef} from 'effect'
import {ChildProcess, ChildProcessSpawner} from 'effect/process'
import {readChildExit} from './child-exit.js'
import {ChildMessageSchema, type ChildMessage} from './child-protocol.js'
import type {TestEvent} from './events.js'
import {TestRunnerRunMachine} from './run-machine.js'
import {makeRunnerUnavailable, type RunArgs, type TestRunnerAdapter, type TestRunnerManager} from './runner.js'

type ChildRunnerSpec = {
  id: string
  childUrl: URL
  buildRunArgs: (args: RunArgs, cwd: string) => string[]
  buildListArgs: (failedOnly: boolean, cwd: string) => string[]
}

type Settled = {readonly attempt: number; readonly settlement: TestRunnerRunMachine.Settlement}

const STOP_GRACE = Duration.seconds(5)

const decodeJson = Schema.decodeUnknownOption(Schema.fromJsonString(Schema.Unknown))

function decodeLine(line: string): Result.Result<ChildMessage, string> {
  const json = decodeJson(line.trim())
  if (Option.isNone(json)) return Result.fail(line)
  const parsed = ChildMessageSchema.safeParse(json.value)
  return parsed.success ? Result.succeed(parsed.data) : Result.fail(line)
}

function cleanEnv(base: NodeJS.ProcessEnv): Record<string, string | undefined> {
  return Object.fromEntries(Object.entries(base).filter(([key]) => key !== 'NODE_OPTIONS'))
}

const makeChildManager = Effect.fn('TestRunner.makeChildManager')(function* (spec: ChildRunnerSpec, cwd: string) {
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner
  const state = yield* SubscriptionRef.make(TestRunnerRunMachine.createRunState(spec.id))
  const events = yield* PubSub.unbounded<TestEvent>()
  const settlements = yield* PubSub.unbounded<Settled>()
  const child = yield* FiberHandle.make<void, never>()
  const transitions = yield* Semaphore.make(1)
  const requests = yield* Semaphore.make(1)
  const childScript = fileURLToPath(spec.childUrl)

  const runChild = (attempt: number, args: readonly string[]): Effect.Effect<void> =>
    Effect.scoped(
      Effect.gen(function* () {
        const handle = yield* spawner.spawn(
          ChildProcess.make(process.execPath, [childScript, ...args], {
            cwd,
            env: cleanEnv(process.env),
            stdin: 'ignore',
            stdout: 'ignore',
            stderr: 'ignore',
            additionalFds: {fd3: {type: 'output'}},
            forceKillAfter: STOP_GRACE,
          }),
        )
        yield* handle.getOutputFd(3).pipe(
          Stream.decodeText(),
          Stream.splitLines,
          Stream.filter((line) => line.trim() !== ''),
          Stream.runForEach((line) => {
            const decoded = decodeLine(line)
            if (Result.isSuccess(decoded)) return dispatch({type: 'child-event', attempt, message: decoded.success})
            return Effect.logWarning('the test runner child sent a line that is not a child message').pipe(
              Effect.annotateLogs({plugin: 'test-runner', runner: spec.id, line}),
            )
          }),
        )
        const status = yield* readChildExit(handle)
        yield* dispatch({type: 'child-exited', attempt, exit: {type: 'exited', ...status}})
      }),
    ).pipe(
      Effect.catch((error) => dispatch({type: 'child-exited', attempt, exit: {type: 'failed', reason: error.message}})),
      Effect.withSpan('TestRunner.child'),
    )

  const perform = (effect: TestRunnerRunMachine.RunEffect): Effect.Effect<void> => {
    if (effect.type === 'spawn')
      return FiberHandle.run(child, runChild(effect.attempt, effect.args)).pipe(Effect.asVoid)
    if (effect.type === 'kill')
      return FiberHandle.clear(child).pipe(
        Effect.andThen(step({type: 'child-exited', attempt: effect.attempt, exit: {type: 'stopped'}})),
      )
    if (effect.type === 'publish') return PubSub.publish(events, effect.event).pipe(Effect.asVoid)
    return PubSub.publish(settlements, {attempt: effect.attempt, settlement: effect.settlement}).pipe(Effect.asVoid)
  }

  const step = (event: TestRunnerRunMachine.RunEvent): Effect.Effect<void> =>
    Effect.gen(function* () {
      const current = yield* SubscriptionRef.get(state)
      const next = TestRunnerRunMachine.transitionRun(current, event)
      if (next.state !== current) yield* SubscriptionRef.set(state, next.state)
      yield* Effect.forEach(next.effects, perform, {discard: true})
    })

  const dispatch = (event: TestRunnerRunMachine.RunEvent) => transitions.withPermits(1)(step(event))

  const request = (type: 'run-requested' | 'list-requested', args: readonly string[]) =>
    requests.withPermits(1)(
      Effect.scoped(
        Effect.gen(function* () {
          const subscription = yield* PubSub.subscribe(settlements)
          const attempt = yield* transitions.withPermits(1)(
            Effect.gen(function* () {
              const {nextAttempt} = yield* SubscriptionRef.get(state)
              yield* step({type, attempt: nextAttempt, args})
              return nextAttempt
            }),
          )
          const settled = yield* Stream.fromSubscription(subscription).pipe(
            Stream.filter((entry) => entry.attempt === attempt),
            Stream.runHead,
          )
          if (Option.isNone(settled))
            return yield* Effect.fail(makeRunnerUnavailable({message: `${spec.id} unavailable: stopped`}))
          const settlement = settled.value.settlement
          if (!settlement.ok) return yield* Effect.fail(makeRunnerUnavailable({message: settlement.message}))
          return settlement
        }),
      ),
    )

  const run = Effect.fn('TestRunner.run')(function* (args: RunArgs) {
    const settlement = yield* request('run-requested', spec.buildRunArgs(args, cwd))
    return settlement.result
  })

  const list = Effect.fn('TestRunner.list')(function* (failedOnly: boolean) {
    const settlement = yield* request('list-requested', spec.buildListArgs(failedOnly, cwd))
    return {files: [...settlement.files]}
  })

  const liveEvents = Stream.unwrap(
    transitions.withPermits(1)(
      Effect.gen(function* () {
        const subscription = yield* PubSub.subscribe(events)
        const replay = TestRunnerRunMachine.selectReplay(yield* SubscriptionRef.get(state))
        return Stream.concat(Stream.fromIterable(replay), Stream.fromSubscription(subscription))
      }),
    ),
  )

  yield* Effect.addFinalizer(() => dispatch({type: 'disposed'}))

  const manager: TestRunnerManager = {
    list,
    run,
    status: SubscriptionRef.get(state).pipe(Effect.map((current) => current.last)),
    current: SubscriptionRef.get(state).pipe(Effect.map(TestRunnerRunMachine.selectCurrentRun)),
    events: liveEvents,
    stop: dispatch({type: 'stop-requested'}),
  }
  return manager
})

export function defineChildRunner(spec: ChildRunnerSpec): TestRunnerAdapter {
  return {id: spec.id, create: (cwd) => makeChildManager(spec, cwd)}
}

export function defineStubRunner(options: {id: string; reason: string}): TestRunnerAdapter {
  return {
    id: options.id,
    create: () => Effect.fail(makeRunnerUnavailable({message: options.reason})),
  }
}
