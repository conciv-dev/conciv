import {randomUUID} from 'node:crypto'
import type {H3} from 'h3'
import {bashDecision} from './risk.js'
import {isRecord, readJsonBody} from './http.js'
import type {UiBus} from './ui-bus.js'

// The risky-Bash approval gate. Safe commands run; risky ones surface a confirm card in the
// chat (injected onto the live stream) and block until the user answers or we time out — fail
// closed. The gate owns the pending-decisions map; the widget POSTs the answer to unblock it.

const APPROVAL_TIMEOUT_MS = 120_000

export type PermissionGate = {
  // Decide a PreToolUse Bash permission. Non-Bash tools are always allowed (edits run under
  // acceptEdits). Blocks on a risky Bash command until the user answers or the timeout fires.
  decide(toolName: string, toolInput: unknown): Promise<'allow' | 'deny'>
  // Resolve a pending decision with the user's answer (called by the widget's POST).
  resolve(renderId: string, approved: boolean): void
}

export function makePermissionGate(uiBus: UiBus, timeoutMs = APPROVAL_TIMEOUT_MS): PermissionGate {
  const decisions = new Map<string, (approved: boolean) => void>()

  async function decide(toolName: string, toolInput: unknown): Promise<'allow' | 'deny'> {
    if (toolName !== 'Bash') return 'allow'
    const command = isRecord(toolInput) && typeof toolInput.command === 'string' ? toolInput.command : ''
    if (bashDecision(command) === 'allow') return 'allow'
    const renderId = randomUUID()
    const injected = uiBus.inject({kind: 'approval', renderId, question: 'Run this command?', detail: command})
    if (!injected) return 'deny' // no live chat stream to ask on → fail closed
    const approved = await new Promise<boolean>((resolve) => {
      const timer = setTimeout(() => {
        decisions.delete(renderId)
        resolve(false)
      }, timeoutMs)
      decisions.set(renderId, (ok) => {
        clearTimeout(timer)
        resolve(ok)
      })
    })
    return approved ? 'allow' : 'deny'
  }

  function resolve(renderId: string, approved: boolean): void {
    const fn = decisions.get(renderId)
    if (!fn) return
    decisions.delete(renderId)
    fn(approved)
  }

  return {decide, resolve}
}

// Mount the gate routes. `gated` is false for harnesses whose capabilities.permissionGate is
// 'none' — then /permission always allows (no card), but the route stays mounted to fail safe.
//   POST /__pw/chat/permission          → PreToolUse hook decision
//   POST /__pw/chat/permission-decision → the widget's allow/deny, unblocking the gate
export function registerPermissionRoutes(app: H3, gate: PermissionGate, gated: boolean): void {
  app.post('/__pw/chat/permission', async (event) => {
    const body = await readJsonBody(event)
    const toolName = isRecord(body) && typeof body.tool_name === 'string' ? body.tool_name : ''
    const toolInput = isRecord(body) ? body.tool_input : undefined
    const decision = gated ? await gate.decide(toolName, toolInput) : 'allow'
    return {
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: decision,
        permissionDecisionReason: decision === 'allow' ? 'approved' : 'denied by the user (devgent chat gate)',
      },
    }
  })

  app.post('/__pw/chat/permission-decision', async (event) => {
    const body = await readJsonBody(event)
    const renderId = isRecord(body) && typeof body.renderId === 'string' ? body.renderId : undefined
    const approved = isRecord(body) && body.approved === true
    if (renderId) gate.resolve(renderId, approved)
    return {ok: true}
  })
}
