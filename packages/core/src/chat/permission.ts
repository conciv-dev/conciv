import {randomUUID} from 'node:crypto'
import {z} from 'zod'
import type {StreamChunk} from '@tanstack/ai'
import {aguiApprovalRequestedFor} from '@conciv/protocol/ui-types'
import {classifyCommand} from '../policy/command-policy.js'
import {makePending} from '../pending.js'

const APPROVAL_TIMEOUT_MS = 120_000

const BashInputSchema = z.object({command: z.string()})

export type PermissionGate = {
  decide(toolName: string, toolInput: unknown, sessionId: string, toolUseId: string): Promise<'allow' | 'deny'>
  resolve(approvalId: string, approved: boolean): void
}

export type PermissionGateOptions = {risky?: ReadonlySet<string>; timeoutMs?: number}

export type InjectChunk = (sessionId: string, chunk: StreamChunk) => boolean

function needsApproval(toolName: string, toolInput: unknown, risky: ReadonlySet<string>): boolean {
  if (risky.has(toolName)) return true
  if (toolName !== 'Bash') return false
  const parsed = BashInputSchema.safeParse(toolInput)
  return classifyCommand(parsed.success ? parsed.data.command : '') !== 'allow'
}

export function makePermissionGate(inject: InjectChunk, options: PermissionGateOptions = {}): PermissionGate {
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
    const chunk = aguiApprovalRequestedFor({toolCallId: toolUseId, toolName, input: toolInput, approvalId})
    if (!inject(sessionId, chunk)) return 'deny'
    try {
      return (await pending.await(approvalId, timeoutMs)) ? 'allow' : 'deny'
    } catch {
      return 'deny'
    }
  }

  return {decide, resolve: pending.resolve}
}
