import {z} from 'zod'

const Milliseconds = z.number().int().positive()

export const TryItOptions = z.object({
  token: z.uuid(),
  probeMs: Milliseconds.default(2_000),
  holdMs: Milliseconds.default(600),
  slowMs: Milliseconds.default(60_000),
})
