import {z} from 'zod'
import {defineExtension, defineTool} from '@conciv/extension'

export const sampleState = {disposed: false}

const multiply = defineTool<z.ZodObject<{n: z.ZodNumber}>, {factor: number}>({
  name: 'sample_mul',
  description: 'multiply by the configured factor',
  inputSchema: z.object({n: z.number()}),
}).server((input, ctx) => ({result: input.n * ctx.factor}))

export const sampleConfig = z.object({factor: z.number().default(3)})

export const sampleServerExtension = defineExtension({
  name: 'sample',
  configSchema: sampleConfig,
  tools: [multiply],
}).server((server) => {
  server.app.get('/echo', (c) => c.json({factor: server.config.factor, cwd: server.cwd}))
  return {
    context: {factor: server.config.factor},
    dispose: () => {
      sampleState.disposed = true
    },
  }
})
