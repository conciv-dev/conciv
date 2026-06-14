import {randomUUID} from 'node:crypto'
import {type H3, readValidatedBody} from 'h3'
import {z} from 'zod'
import {bashDecision} from '../../chat/risk.js'
import type {UiBus} from '../../chat/ui-bus.js'
import {makePending} from '../../pending.js'

// The risky-Bash approval gate: safe commands run; risky ones surface a confirm card and block
// until the user answers or the timeout fires (fail closed).

const APPROVAL_TIMEOUT_MS = 120_000

export type PermissionGate = {
  decide(toolName: string, toolInput: unknown): Promise<'allow' | 'deny'>
  resolve(renderId: string, approved: boolean): void
}

export function makePermissionGate(uiBus: UiBus, timeoutMs = APPROVAL_TIMEOUT_MS): PermissionGate {
  const pending = makePending<boolean>()

  async function decide(toolName: string, toolInput: unknown): Promise<'allow' | 'deny'> {
    if (toolName !== 'Bash') return 'allow'
    const parsed = BashInputSchema.safeParse(toolInput)
    const command = parsed.success ? parsed.data.command : ''
    if (bashDecision(command) === 'allow') return 'allow'
    const renderId = randomUUID()
    const injected = uiBus.inject({kind: 'approval', renderId, question: 'Run this command?', detail: command})
    if (!injected) return 'deny' // no live chat stream to ask on → fail closed
    try {
      return (await pending.await(renderId, timeoutMs)) ? 'allow' : 'deny'
    } catch {
      return 'deny' // timed out → fail closed
    }
  }

  return {decide, resolve: pending.resolve}
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
        permissionDecisionReason: decision === 'allow' ? 'approved' : 'denied by the user (aidx chat gate)',
      },
    }
  })

  app.post('/api/chat/permission-decision', async (event) => {
    const parsed = await readValidatedBody(event, DecisionBodySchema.safeParse)
    if (parsed.success && parsed.data.renderId) gate.resolve(parsed.data.renderId, parsed.data.approved)
    return {ok: true}
  })
}

const HookBodySchema = z.object({tool_name: z.string().default(''), tool_input: z.unknown().optional()})
const DecisionBodySchema = z.object({renderId: z.string().optional(), approved: z.boolean().default(false)})
const BashInputSchema = z.object({command: z.string()})
