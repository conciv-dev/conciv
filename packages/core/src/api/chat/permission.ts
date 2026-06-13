import {randomUUID} from 'node:crypto'
import {type H3, readValidatedBody} from 'h3'
import {z} from 'zod'
import {bashDecision} from '../../chat/risk.js'
import type {UiBus} from '../../chat/ui-bus.js'

// PreToolUse hook payload (claude posts this) + the widget's allow/deny. safeParse-validated
// so a malformed hook still gets a safe response rather than a 400 it can't handle.
const HookBodySchema = z.object({tool_name: z.string().default(''), tool_input: z.unknown().optional()})
const DecisionBodySchema = z.object({renderId: z.string().optional(), approved: z.boolean().default(false)})
// The Bash tool's input shape we care about — the command string to risk-classify.
const BashInputSchema = z.object({command: z.string()})

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
    const parsed = BashInputSchema.safeParse(toolInput)
    const command = parsed.success ? parsed.data.command : ''
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
//   POST /api/chat/permission          → PreToolUse hook decision
//   POST /api/chat/permission-decision → the widget's allow/deny, unblocking the gate
export function registerPermissionRoutes(app: H3, gate: PermissionGate, gated: boolean): void {
  app.post('/api/chat/permission', async (event) => {
    const parsed = await readValidatedBody(event, HookBodySchema.safeParse)
    const toolName = parsed.success ? parsed.data.tool_name : ''
    const toolInput = parsed.success ? parsed.data.tool_input : undefined
    const decision = gated ? await gate.decide(toolName, toolInput) : 'allow'
    return {
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: decision,
        permissionDecisionReason: decision === 'allow' ? 'approved' : 'denied by the user (devgent chat gate)',
      },
    }
  })

  app.post('/api/chat/permission-decision', async (event) => {
    const parsed = await readValidatedBody(event, DecisionBodySchema.safeParse)
    if (parsed.success && parsed.data.renderId) gate.resolve(parsed.data.renderId, parsed.data.approved)
    return {ok: true}
  })
}
