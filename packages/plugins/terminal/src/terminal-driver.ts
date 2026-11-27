import {Duration, Effect, FiberHandle, Schedule, Semaphore, Stream, SubscriptionRef} from 'effect'
import {ORPCError} from '@orpc/client'
import {catchORPCErrorCode, createEffectClient} from '@orpc/effect'
import type {MountedSession} from '@conciv/frontend-plugin-api'
import {initialTerminalRun, transitionTerminal} from './terminal-machine.js'
import type {LiveTerminal, TerminalEffect, TerminalEvent, TerminalRun} from './terminal-machine.js'

const BUSY_REFUSAL = 'The CLI is busy. Wait for it to finish, then try again.'
const RESTART_FAILED = 'Couldn’t restart the terminal.'

const FOLLOW_RETRY = Schedule.min([Schedule.exponential(Duration.millis(500)), Schedule.spaced(Duration.seconds(30))])

type EventClient = MountedSession['server']['client']

type TerminalDriverInput = {
  readonly toast: (message: string) => void
  readonly savePrefs: (sessionId: string, model: string) => void
}

type TerminalDriver = {
  readonly state: SubscriptionRef.SubscriptionRef<TerminalRun>
  readonly dispatch: (event: TerminalEvent) => Effect.Effect<void>
}

function caught(cause: unknown) {
  return cause
}

function restartMessage(cause: unknown): string {
  return cause instanceof ORPCError && cause.code === 'BUSY' ? BUSY_REFUSAL : RESTART_FAILED
}

function removePty(session: MountedSession, live: LiveTerminal | null): Effect.Effect<void, unknown> {
  if (!live) return Effect.void
  return createEffectClient(session.server.client.experimental.persistentPty)
    .remove({ptyId: live.ptyId})
    .pipe(
      Effect.asVoid,
      catchORPCErrorCode('PTY_NOT_FOUND', () => Effect.void),
    )
}

export const runTerminal = Effect.fn('terminal.run')(function* (input: TerminalDriverInput) {
  const state = yield* SubscriptionRef.make(initialTerminalRun)
  const removal = yield* FiberHandle.make()
  const transitions = yield* Semaphore.make(1)

  const restart = (session: MountedSession, live: LiveTerminal | null) =>
    removePty(session, live).pipe(
      Effect.matchEffect({
        onFailure: (cause) =>
          Effect.logError('[terminal] removing the session terminal failed', cause).pipe(
            Effect.andThen(dispatch({type: 'restart.failed', message: restartMessage(cause)})),
          ),
        onSuccess: () => dispatch({type: 'restart.done'}),
      }),
    )

  const perform = (effect: TerminalEffect): Effect.Effect<unknown> => {
    if (effect.type === 'remove-pty') return FiberHandle.run(removal, restart(effect.session, effect.live))
    if (effect.type === 'toast') return Effect.sync(() => input.toast(effect.message))
    return Effect.sync(() => input.savePrefs(effect.sessionId, effect.model))
  }

  const dispatch: (event: TerminalEvent) => Effect.Effect<void> = Effect.fn('terminal.dispatch')(function* (event) {
    yield* transitions.withPermits(1)(
      SubscriptionRef.modify(state, (current) => {
        const next = transitionTerminal(current, event)
        return [next.effects, next.state]
      }).pipe(Effect.flatMap((effects) => Effect.forEach(effects, perform, {discard: true}))),
    )
  })

  const driver: TerminalDriver = {state, dispatch}
  return driver
})

export function followDeletedSessions(client: EventClient, forget: (sessionId: string) => void): Effect.Effect<void> {
  const events = Stream.unwrap(
    Effect.acquireRelease(
      Effect.sync(() => new AbortController()),
      (controller) => Effect.sync(() => controller.abort()),
    ).pipe(
      Effect.map((controller) =>
        Stream.fromAsyncIterable(
          client.event.subscribe({types: ['session.deleted'], signal: controller.signal}),
          caught,
        ),
      ),
    ),
  )
  return events.pipe(
    Stream.tapError((cause) => Effect.logWarning('[terminal] following deleted sessions failed', cause)),
    Stream.retry(FOLLOW_RETRY),
    Stream.runForEach((event) =>
      Effect.sync(() => {
        if (event.type === 'session.deleted') forget(event.data.sessionID)
      }),
    ),
    Effect.ignore,
  )
}
