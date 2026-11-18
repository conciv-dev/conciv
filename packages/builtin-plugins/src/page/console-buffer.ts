import {Effect, type Scope} from 'effect'
import type {z} from 'zod'
import type {Operation} from '@conciv/plugin-page/rpc'

export type ConsoleEntry = z.output<Extract<Operation, {readonly name: 'console'}>['output']>['entries'][number]

type Push = (level: string, args: unknown[]) => string

const CONSOLE_CAP = 200

const CONSOLE_LEVELS = ['log', 'info', 'warn', 'error'] as const

const FORWARD_MARKER = /\[vite\] \(client\)|\[Server\]/

function patchConsole(level: (typeof CONSOLE_LEVELS)[number], push: Push): Effect.Effect<void, never, Scope.Scope> {
  return Effect.acquireRelease(
    Effect.sync(() => {
      const original = console[level].bind(console)
      const wrapper = (...args: unknown[]) => {
        const text = push(level, args)
        if (!FORWARD_MARKER.test(text)) original(...args)
      }
      console[level] = wrapper
      return {original, wrapper}
    }),
    ({original, wrapper}) =>
      Effect.sync(() => {
        if (console[level] === wrapper) console[level] = original
      }),
  )
}

function listenWindow<Type extends keyof WindowEventMap>(
  type: Type,
  listener: (event: WindowEventMap[Type]) => void,
): Effect.Effect<void, never, Scope.Scope> {
  return Effect.acquireRelease(
    Effect.sync(() => window.addEventListener(type, listener)),
    () => Effect.sync(() => window.removeEventListener(type, listener)),
  )
}

export const consoleBuffer: Effect.Effect<ConsoleEntry[], never, Scope.Scope> = Effect.gen(function* () {
  const buf: ConsoleEntry[] = []
  const push: Push = (level, args) => {
    const text = args.map((a) => String(a)).join(' ')
    buf.push({level, ts: Date.now(), text})
    if (buf.length > CONSOLE_CAP) buf.shift()
    return text
  }
  yield* Effect.forEach(CONSOLE_LEVELS, (level) => patchConsole(level, push), {discard: true})
  yield* listenWindow('error', (event) => push('uncaught', [thrownText(event.error, event.message)]))
  yield* listenWindow('unhandledrejection', (event) =>
    push('unhandled', [thrownText(event.reason, String(event.reason))]),
  )
  return buf
})

function thrownText(thrown: unknown, fallback: string): string {
  if (!(thrown instanceof Error) || thrown.stack === undefined || thrown.stack === '') return fallback
  const message = String(thrown)
  return thrown.stack.startsWith(message) ? thrown.stack : `${message}\n${thrown.stack}`
}
