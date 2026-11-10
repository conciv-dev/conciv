import {createORPCClient, ORPCError} from '@orpc/client'
import {RPCLink} from '@orpc/client/fetch'
import type {RouterClient} from '@orpc/server'
import {toolError} from '@conciv/extension'
import type {makeRpcRouter} from './rpc/router.js'

type OwnerContext = {headers: Record<string, string>}

type OwnerRegistry = RouterClient<ReturnType<typeof makeRpcRouter>, OwnerContext>['registry']

type EngineFetch = (request: Request) => Response | Promise<Response>

type Send = (request: Request, init: RequestInit) => Promise<Response>

type Owner = {engine: string; apiBase: string; root: string}

type OwnerCall = {headers: Record<string, string>; name: string; input: Record<string, unknown>; signal: AbortSignal}

export function createOwnerCalls(deps: {engineId: string; local: EngineFetch}) {
  const kept = new Map<string, OwnerRegistry>()

  function registryOf(owner: Owner): OwnerRegistry {
    const existing = kept.get(owner.apiBase)
    if (existing !== undefined) return existing
    const send: Send =
      owner.engine === deps.engineId
        ? async (request, init) => deps.local(inProcess(new Request(request, init)))
        : (request, init) => fetch(request, init)
    const created = ownerRegistry(owner.apiBase, send)
    kept.set(owner.apiBase, created)
    return created
  }

  return async function callOwner(owner: Owner, call: OwnerCall): Promise<unknown> {
    try {
      return await registryOf(owner).call(
        {name: call.name, input: call.input},
        {context: {headers: call.headers}, signal: call.signal},
      )
    } catch (error) {
      if (error instanceof ORPCError) throw toolError(error.code, {message: error.message, data: error.data})
      kept.delete(owner.apiBase)
      const reason = error instanceof Error ? error.message : String(error)
      throw new Error(`the conciv engine at ${owner.root} stopped answering (${reason})`, {cause: error})
    }
  }
}

function ownerRegistry(apiBase: string, send: Send): OwnerRegistry {
  const link = new RPCLink<OwnerContext>({
    url: `${apiBase}/rpc`,
    fetch: (request, init, options) => send(request, {...init, signal: options.signal ?? null}),
    headers: (options) => options.context.headers,
  })
  const client: RouterClient<ReturnType<typeof makeRpcRouter>, OwnerContext> = createORPCClient(link)
  return client.registry
}

function inProcess(request: Request): Request {
  const headers = new Headers(request.headers)
  headers.set('host', new URL(request.url).host)
  return new Request(request, {headers})
}
