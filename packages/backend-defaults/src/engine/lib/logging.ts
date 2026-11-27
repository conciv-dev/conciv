import type {Effect} from 'effect'

export type EngineRuntime = {readonly runFork: (effect: Effect.Effect<void>) => unknown}
