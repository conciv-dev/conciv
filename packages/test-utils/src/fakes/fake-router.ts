import {handlerGen} from '@orpc/effect'
import {implement, ORPCError, type AnyRouter} from '@orpc/server'
import {Effect} from 'effect'
import {ProcedureContract, type RouterContract} from '@orpc/contract'
import type {FakeEngineHandlers} from './fake-types.js'

export function withSendRecorded(
  handlers: FakeEngineHandlers | undefined,
  record: (sessionId: string, messages: readonly unknown[]) => void,
): FakeEngineHandlers | undefined {
  const send = handlers?.chat?.send
  if (handlers === undefined || send === undefined) return handlers
  return {
    ...handlers,
    chat: {
      ...handlers.chat,
      send: (input, call) => {
        record(input.sessionId, input.messages)
        return send(input, call)
      },
    },
  }
}

export function notImplemented(path: string, unanswered: string[]): never {
  unanswered.push(path)
  throw new ORPCError('NOT_IMPLEMENTED', {message: `the fake engine has no handler for ${path}`})
}

export function lookup(handlers: unknown, path: readonly string[]): unknown {
  return path.reduce<unknown>(
    (node, key) => (typeof node === 'object' && node !== null ? Reflect.get(node, key) : undefined),
    handlers,
  )
}

export function buildRouter(
  node: RouterContract,
  path: readonly string[],
  layers: readonly unknown[],
  unanswered: string[],
): AnyRouter {
  if (node instanceof ProcedureContract) {
    const name = path.join('.')
    return implement(node).handler(
      handlerGen(function* ({input, signal}) {
        const handler = layers.map((layer) => lookup(layer, path)).find((found) => typeof found === 'function')
        if (typeof handler !== 'function') return notImplemented(name, unanswered)
        const answer: unknown = yield* Effect.tryPromise({
          try: async () => handler(input, {signal}),
          catch: (error) => error,
        })
        return answer
      }),
    )
  }
  return Object.fromEntries(
    Object.entries(node).map(([key, child]) => [key, buildRouter(child, [...path, key], layers, unanswered)]),
  )
}
