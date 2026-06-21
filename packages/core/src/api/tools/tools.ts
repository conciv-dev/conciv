import {randomUUID} from 'node:crypto'
import {type H3, readValidatedBody} from 'h3'
import {z} from 'zod'
import type {ExtensionServerTool} from '@mandarax/extensions'

// One shared, loopback-gated path for UI-origin (and CLI/AI) tool runs, so every surface invokes a
// tool the same way — and the approval gate lives HERE, generalizing the Bash-only permission.ts into
// a tool-agnostic gate keyed by a per-tool policy. A destructive/source-reading tool ('ask') returns a
// pending approval the human must resolve; additive/reversible tools ('auto') run immediately.
export type ApprovalPolicy = 'auto' | 'ask'

// Default policy map: destructive or source-mutating tools require approval; everything else is auto.
const ASK_TOOLS = new Set(['comment.delete', 'comment.resolve', 'canvas.delete', 'canvas.clear'])
export function defaultPolicy(name: string): ApprovalPolicy {
  return ASK_TOOLS.has(name) ? 'ask' : 'auto'
}

const RunBody = z.object({name: z.string().min(1), input: z.unknown()})
const ApproveBody = z.object({approvalId: z.string().min(1), approved: z.boolean()})

export function registerToolRunRoute(
  app: H3,
  opts: {tools: () => ExtensionServerTool[]; policy?: (name: string) => ApprovalPolicy},
): void {
  const policy = opts.policy ?? defaultPolicy
  // Pending approvals: a destructive call parks here until the human approves/denies it.
  const pending = new Map<string, {name: string; input: unknown}>()
  const find = (name: string) => opts.tools().find((t) => t.name === name)

  app.post('/api/tools/run', async (event) => {
    const {name, input} = await readValidatedBody(event, RunBody)
    const tool = find(name)
    if (!tool) return new Response(JSON.stringify({error: `unknown tool: ${name}`}), {status: 404})
    if (policy(name) === 'ask') {
      const approvalId = randomUUID()
      pending.set(approvalId, {name, input: input ?? {}})
      return {status: 'needs-approval', approvalId, tool: name}
    }
    return {status: 'ok', result: await tool.execute(input ?? {})}
  })

  app.post('/api/tools/approve', async (event) => {
    const {approvalId, approved} = await readValidatedBody(event, ApproveBody)
    const parked = pending.get(approvalId)
    if (!parked) return new Response(JSON.stringify({error: 'unknown approval'}), {status: 404})
    pending.delete(approvalId)
    if (!approved) return {status: 'denied'}
    const tool = find(parked.name)
    if (!tool) return new Response(JSON.stringify({error: `unknown tool: ${parked.name}`}), {status: 404})
    return {status: 'ok', result: await tool.execute(parked.input)}
  })
}
