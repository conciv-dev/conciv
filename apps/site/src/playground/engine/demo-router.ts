import {call, implement, isProcedure, ORPCError, type AnyRouter} from '@orpc/server'
import {isContractProcedure, type AnyContractRouter, type ContractProcedure} from '@orpc/contract'
import type {InferSchemaInput, InferSchemaOutput} from '@orpc/contract'
import type {ClientLink} from '@orpc/client'
import type {contract} from '@conciv/protocol'
import type {EngineConnection, RpcClientContext} from '@conciv/client'

type Call = {readonly signal: AbortSignal | undefined}

type Promisable<Value> = Value | Promise<Value>

type Handler<Procedure> =
  Procedure extends ContractProcedure<infer Input, infer Output, infer _Errors, infer _Meta>
    ? (input: InferSchemaOutput<Input>, call: Call) => Promisable<InferSchemaInput<Output>>
    : never

type Handlers<Router> = {
  [Key in keyof Router]?: Router[Key] extends ContractProcedure<infer _Input, infer _Output, infer _Errors, infer _Meta>
    ? Handler<Router[Key]>
    : Handlers<Router[Key]>
}

export type EngineHandlers = Handlers<typeof contract>

const REFUSALS = ['NO_TTY', 'NO_CODE_MODE']

function lookup(node: unknown, path: readonly string[]): unknown {
  return path.reduce<unknown>(
    (found, key) => (typeof found === 'object' && found !== null ? Reflect.get(found, key) : undefined),
    node,
  )
}

function refuse(name: string, declared: readonly string[]): never {
  const code = REFUSALS.find((refusal) => declared.includes(refusal))
  if (code !== undefined) throw new ORPCError(code, {defined: true, message: `the playground has no ${name}`})
  throw new ORPCError('NOT_IMPLEMENTED', {message: `the playground engine does not answer ${name}`})
}

function rethrow(error: unknown, declared: readonly string[]): never {
  if (!(error instanceof ORPCError) || !declared.includes(error.code)) throw error
  throw new ORPCError(error.code, {defined: true, status: error.status, message: error.message, data: error.data})
}

export function buildRouter(
  node: AnyContractRouter,
  handlers: EngineHandlers,
  path: readonly string[] = [],
): AnyRouter {
  if (isContractProcedure(node)) {
    const name = path.join('.')
    const declared = Object.keys(node['~orpc'].errorMap)
    return implement(node).handler(async ({input, signal}) => {
      const handler = lookup(handlers, path)
      if (typeof handler !== 'function') return refuse(name, declared)
      try {
        const answer: unknown = await handler(input, {signal})
        return answer
      } catch (error) {
        return rethrow(error, declared)
      }
    })
  }
  return Object.fromEntries(
    Object.entries(node).map(([key, child]) => [key, buildRouter(child, handlers, [...path, key])]),
  )
}

export function demoConnection(router: AnyRouter, version: string): EngineConnection {
  const link: ClientLink<RpcClientContext> = {
    call: async (path, input, options) => {
      const procedure = lookup(router, path)
      if (!isProcedure(procedure)) throw new ORPCError('NOT_FOUND', {message: `no procedure at ${path.join('.')}`})
      return call(procedure, input, {signal: options.signal})
    },
  }
  return {
    link,
    trust: {
      isTrusted: () => true,
      status: () => 'trusted',
      subscribe: () => () => undefined,
      requestTrust: async () => true,
      requestTrustWithToken: async () => true,
      requestTrustWithCode: async () => ({refused: 'expired'}),
      requestAuthCode: async () => undefined,
    },
    reset: () => undefined,
    subscribeReachability: () => () => undefined,
    version: async () => version,
  }
}
