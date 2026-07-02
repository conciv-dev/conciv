import {randomUUID} from 'node:crypto'
import {type H3, readValidatedBody} from 'h3'
import {z} from 'zod'
import {classifyCommand} from '../../policy/command-policy.js'
import type {UiBus} from '../../runtime/ui-bus.js'
import {makePending} from '../../pending.js'
import {sessionIdFromHeaders} from './session-id.js'

const APPROVAL_TIMEOUT_MS = 120_000

export type PermissionGate = {
  decide(toolName: string, toolInput: unknown, sessionId: string, toolUseId: string): Promise<'allow' | 'deny'>
  resolve(approvalId: string, approved: boolean): void
}

export type PermissionGateOptions = {risky?: ReadonlySet<string>; timeoutMs?: number}

function needsApproval(toolName: string, toolInput: unknown, risky: ReadonlySet<string>): boolean {
  if (risky.has(toolName)) return true
  if (toolName !== 'Bash') return false
  const parsed = BashInputSchema.safeParse(toolInput)
  return classifyCommand(parsed.success ? parsed.data.command : '') !== 'allow'
}

export function makePermissionGate(uiBus: UiBus, options: PermissionGateOptions = {}): PermissionGate {
  const pending = makePending<boolean>()
  const risky = options.risky ?? new Set<string>()
  const timeoutMs = options.timeoutMs ?? APPROVAL_TIMEOUT_MS

  async function decide(
    toolName: string,
    toolInput: unknown,
    sessionId: string,
    toolUseId: string,
  ): Promise<'allow' | 'deny'> {
    if (!needsApproval(toolName, toolInput, risky)) return 'allow'

    const approvalId = randomUUID()
    const injected = uiBus.injectApproval(sessionId, {toolCallId: toolUseId, toolName, input: toolInput, approvalId})
    if (!injected) return 'deny'
    try {
      return (await pending.await(approvalId, timeoutMs)) ? 'allow' : 'deny'
    } catch {
      return 'deny'
    }
  }

  return {decide, resolve: pending.resolve}
}

export function registerPermissionRoutes(app: H3, gate: PermissionGate, gated: boolean): void {
  app.post('/api/chat/permission', async (event) => {
    const parsed = await readValidatedBody(event, HookBodySchema.safeParse)
    const toolName = parsed.success ? parsed.data.tool_name : ''
    const toolInput = parsed.success ? parsed.data.tool_input : undefined

    const toolUseId = parsed.success ? parsed.data.tool_use_id : ''
    const sessionId = sessionIdFromHeaders(event.req.headers) ?? ''
    const decision = gated ? await gate.decide(toolName, toolInput, sessionId, toolUseId) : 'allow'
    return {
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: decision,
        permissionDecisionReason: decision === 'allow' ? 'approved' : 'denied by the user (conciv chat gate)',
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
