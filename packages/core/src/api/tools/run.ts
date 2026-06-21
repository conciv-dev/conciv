import {readValidatedBody, type H3} from 'h3'
import {z} from 'zod'
import type {ExtensionServerTool} from '@mandarax/extensions'

const RunBody = z.object({name: z.string(), input: z.unknown()})

export function registerToolRunRoute(app: H3, tools: ExtensionServerTool[]): void {
  app.post('/api/tools/run', async (event) => {
    const {name, input} = await readValidatedBody(event, RunBody)
    const tool = tools.find((candidate) => candidate.name === name)
    if (!tool)
      return new Response(JSON.stringify({error: `unknown tool ${name}`}), {
        status: 404,
        headers: {'content-type': 'application/json'},
      })
    return {result: await tool.execute(input)}
  })
}
