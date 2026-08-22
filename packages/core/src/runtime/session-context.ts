import {AsyncLocalStorage} from 'node:async_hooks'
import type {SessionScope} from './scope-types.js'

const sessionStorage = new AsyncLocalStorage<SessionScope>()

const MISSING_SESSION =
  "no session scope is established on this call path. Every effectful conciv runtime call runs inside runWithSession(scope, ...), established at a transport boundary (the rpc sessionOs middleware, the mcp request handler, a tool execution, or a code-mode run). A callback registered outside a request, such as a socket message handler, an emitter listener, a timer, or a stream pump, does not inherit the caller's scope: capture the scope at registration time instead of calling session() inside the callback."

export function runWithSession<Result>(scope: SessionScope, run: () => Result): Result {
  return sessionStorage.run(scope, run)
}

export function session(): SessionScope {
  const scope = sessionStorage.getStore()
  if (scope === undefined) throw new Error(MISSING_SESSION)
  return scope
}
