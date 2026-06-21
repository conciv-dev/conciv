import {MANDARAX_SESSION_HEADER} from '@mandarax/protocol/chat-types'

// Core only accepts our branded `mandarax_` ids (session-id.ts throws 400 otherwise), so ITs mint
// session ids through this rather than hand-rolling the prefix.
export function sessionId(label: string): string {
  return `mandarax_${label}`
}

// The node-side IT runTool: POSTs /api/tools/run carrying a REAL session header so session-scoped
// rooms, comments, undo, and approval are actually isolated per session (an empty header collapses
// every session to '' and makes those ITs vacuous). Returns the raw Response so callers assert status.
export function runTool(core: string, sessionId: string, name: string, input: unknown): Promise<Response> {
  return fetch(`${core}/api/tools/run`, {
    method: 'POST',
    headers: {'content-type': 'application/json', [MANDARAX_SESSION_HEADER]: sessionId},
    body: JSON.stringify({name, input}),
  })
}

export function runToolApproved(core: string, sessionId: string, name: string, input: unknown): Promise<Response> {
  return fetch(`${core}/api/tools/run`, {
    method: 'POST',
    headers: {'content-type': 'application/json', [MANDARAX_SESSION_HEADER]: sessionId},
    body: JSON.stringify({name, input, confirmed: true}),
  })
}
