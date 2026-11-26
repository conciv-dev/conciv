import {Context, Effect, Layer, Logger, LogLevel as Severity, Stream, SubscriptionRef} from 'effect'
import type {LogLevel} from '@conciv/types/config-types'

export type Levels = {readonly engine: LogLevel; readonly widget: LogLevel}

export type LevelScope = 'engine' | 'widget' | 'all'

export interface Interface {
  readonly get: Effect.Effect<Levels>
  readonly set: (level: LogLevel, scope: LevelScope) => Effect.Effect<void>
  readonly changes: Stream.Stream<Levels>
  readonly enabled: (severity: Severity.LogLevel) => boolean
}

export const Service = Context.Service<Interface>('@conciv/LogLevel')

const minimums = {
  off: 'None',
  error: 'Error',
  warn: 'Warn',
  info: 'Info',
  debug: 'Debug',
  trace: 'Trace',
} as const satisfies Record<LogLevel, Severity.LogLevel>

function apply(levels: Levels, level: LogLevel, scope: LevelScope): Levels {
  if (scope === 'all') return {engine: level, widget: level}
  return {...levels, [scope]: level}
}

export function layer(initial: Levels) {
  return Layer.effect(
    Service,
    Effect.gen(function* () {
      const ref = yield* SubscriptionRef.make(initial)
      return Service.of({
        get: SubscriptionRef.get(ref),
        set: (level, scope) => SubscriptionRef.update(ref, (levels) => apply(levels, level, scope)),
        changes: SubscriptionRef.changes(ref),
        enabled: (severity) =>
          Severity.isGreaterThanOrEqualTo(severity, minimums[SubscriptionRef.getUnsafe(ref).engine]),
      })
    }),
  )
}

export type Enabled = Interface['enabled']

export function gate<Message, Output>(enabled: Enabled, logger: Logger.Logger<Message, Output>) {
  return Logger.make<Message, void>((options) => {
    if (enabled(options.logLevel)) logger.log(options)
  })
}
