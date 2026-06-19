import {randomUUID} from 'node:crypto'
import {type H3, readValidatedBody} from 'h3'
import {z} from 'zod'
import {classifyCommand} from '../../policy/command-policy.js'
import type {UiBus} from '../../runtime/ui-bus.js'
import {makePending} from '../../pending.js'
import {sessionIdFromHeaders} from './session-id.js'

// The risky-Bash approval gate: safe commands run; risky ones surface a confirm card and block
// until the user answers or the timeout fires (fail closed).

const APPROVAL_TIMEOUT_MS = 120_000

export type PermissionGate = {
  decide(toolName: string, toolInput: unknown, sessionId: string, toolUseId: string): Promise<'allow' | 'deny'>
  resolve(approvalId: string, approved: boolean): void
}

export function makePermissionGate(uiBus: UiBus, timeoutMs = APPROVAL_TIMEOUT_MS): PermissionGate {
  const pending = makePending<boolean>()

  async function decide(
    toolName: string,
    toolInput: unknown,
    sessionId: string,
    toolUseId: string,
  ): Promise<'allow' | 'deny'> {
    if (toolName !== 'Bash') return 'allow'
    const parsed = BashInputSchema.safeParse(toolInput)
    const command = parsed.success ? parsed.data.command : ''
    if (classifyCommand(command) === 'allow') return 'allow'
    // Drive the matching tool-call part into its native approval-requested state (claude's tool_use_id
    // is the streamed tanstack toolCallId), so approval renders ON the tool card. The decision returns
    // out-of-band via /permission-decision and resolves this pending — claude blocks on its hook
    // meanwhile, so the answer can't ride the one-way stream back.
    const approvalId = randomUUID()
    const injected = uiBus.injectApproval(sessionId, {toolCallId: toolUseId, toolName, input: toolInput, approvalId})
    if (!injected) return 'deny' // no live chat stream to ask on → fail closed
    try {
      return (await pending.await(approvalId, timeoutMs)) ? 'allow' : 'deny'
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
    // claude's PreToolUse payload carries tool_use_id, which equals the streamed tanstack toolCallId —
    // the exact part the approval card must target. Verified against claude 2.x stream-json.
    const toolUseId = parsed.success ? parsed.data.tool_use_id : ''
    const sessionId = sessionIdFromHeaders(event.req.headers) ?? '' // '' = no live channel → fail safe
    const decision = gated ? await gate.decide(toolName, toolInput, sessionId, toolUseId) : 'allow'
    return {
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: decision,
        permissionDecisionReason: decision === 'allow' ? 'approved' : 'denied by the user (mandarax chat gate)',
      },
    }
  })

  app.post('/api/chat/permission-decision', async (event) => {
    const parsed = await readValidatedBody(event, DecisionBodySchema.safeParse)
    if (parsed.success && parsed.data.approvalId) gate.resolve(parsed.data.approvalId, parsed.data.approved)
    return {ok: true}
  })
}

const HookBodySchema = z.object({
  tool_name: z.string().default(''),
  tool_input: z.unknown().optional(),
  tool_use_id: z.string().default(''),
})
const DecisionBodySchema = z.object({approvalId: z.string().optional(), approved: z.boolean().default(false)})
const BashInputSchema = z.object({command: z.string()})
