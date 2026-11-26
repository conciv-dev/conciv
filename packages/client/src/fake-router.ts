import {implement, ORPCError, type AnyRouter} from '@orpc/server'
import {isContractProcedure, type AnyContractRouter} from '@orpc/contract'
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
  node: AnyContractRouter,
  path: readonly string[],
  layers: readonly unknown[],
  unanswered: string[],
): AnyRouter {
  if (isContractProcedure(node)) {
    const name = path.join('.')
    const declared = Object.keys(node['~orpc'].errorMap)
    return implement(node).handler(async ({input, signal}) => {
      const handler = layers.map((layer) => lookup(layer, path)).find((found) => typeof found === 'function')
      if (typeof handler !== 'function') return notImplemented(name, unanswered)
      try {
        const answer: unknown = await handler(input, {signal})
        return answer
      } catch (error) {
        if (!(error instanceof ORPCError) || !declared.includes(error.code)) throw error
        throw new ORPCError(error.code, {defined: true, status: error.status, message: error.message, data: error.data})
      }
    })
  }
  return Object.fromEntries(
    Object.entries(node).map(([key, child]) => [key, buildRouter(child, [...path, key], layers, unanswered)]),
  )
}
