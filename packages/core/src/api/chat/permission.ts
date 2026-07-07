import {randomUUID} from 'node:crypto'
import {Hono} from 'hono'
import {zValidator} from '@hono/zod-validator'
import {z} from 'zod'
import type {Ok} from '@conciv/protocol/chat-types'
import type {ChatEnv} from './chat-env.js'
import {classifyCommand} from '../../policy/command-policy.js'
import type {UiBus} from '../../runtime/ui-bus.js'
import {makePending} from '../../pending.js'

const APPROVAL_TIMEOUT_MS = 120_000

const DecisionBodySchema = z.object({approvalId: z.string().optional(), approved: z.boolean().default(false)})
const BashInputSchema = z.object({command: z.string()})

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

const app = new Hono<ChatEnv>().post(
  '/permission-decision',
  zValidator('json', DecisionBodySchema),
  (c) => {
    const decision = c.req.valid('json')
    if (decision.approvalId) c.var.chat.gate.resolve(decision.approvalId, decision.approved)
    const payload: Ok = {ok: true}
    return c.json(payload)
  },
)

export default app

