import {readValidatedBody, type H3} from 'h3'
import {z} from 'zod'
import type {ApprovalPolicy, EventCtx, ExtensionEvent, ExtensionServerTool} from '@mandarax/extensions'
import {sessionIdFromHeaders} from '../chat/session-id.js'

const RunBody = z.object({name: z.string(), input: z.unknown()})
const jsonType = {'content-type': 'application/json'}

export type ToolRunDeps = {
  tools: ExtensionServerTool[]
  approvals: Record<string, ApprovalPolicy>
  previewId: string
  fire: (event: ExtensionEvent, ctx: EventCtx) => void
}

export function registerToolRunRoute(app: H3, deps: ToolRunDeps): void {
  app.post('/api/tools/run', async (event) => {
    const {name, input} = await readValidatedBody(event, RunBody)
    const tool = deps.tools.find((candidate) => candidate.name === name)
    if (!tool) return new Response(JSON.stringify({error: `unknown tool ${name}`}), {status: 404, headers: jsonType})
    if (deps.approvals[name] === 'ask')
      return new Response(JSON.stringify({error: `tool ${name} requires approval`, needsApproval: true}), {
        status: 403,
        headers: jsonType,
      })
    const sessionId = sessionIdFromHeaders(event.req.headers) ?? ''
    deps.fire('tool_execution_start', {sessionId, previewId: deps.previewId, tool: name})
    return {result: await tool.execute(input, {sessionId, previewId: deps.previewId})}
  })
}
