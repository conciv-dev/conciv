import {type H3, readValidatedBody} from 'h3'
import {z} from 'zod'
import type {ExtensionServerTool} from '@mandarax/extensions'

// One shared, loopback-gated path for UI-origin (and CLI) tool runs, so the widget invokes a tool the
// same way the agent does. This is the seed of the unified core execute — the per-tool approval gate
// (generalizing permission.ts) layers in at phase 8; for now it runs the registered tool by name.
const RunBody = z.object({name: z.string().min(1), input: z.unknown()})

export function registerToolRunRoute(app: H3, opts: {tools: () => ExtensionServerTool[]}): void {
  app.post('/api/tools/run', async (event) => {
    const {name, input} = await readValidatedBody(event, RunBody)
    const tool = opts.tools().find((t) => t.name === name)
    if (!tool) return new Response(JSON.stringify({error: `unknown tool: ${name}`}), {status: 404})
    const result = await tool.execute(input ?? {})
    return {result}
  })
}
