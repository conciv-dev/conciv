import {expectTypeOf, test} from 'vitest'
import {z} from 'zod'
import {defineExtension, defineTool, type RegisterExtension} from '../src/index.js'
import type {ConcivConfig} from '@conciv/protocol/config-types'

const cfgSchema = z.object({runner: z.enum(['vitest', 'jest']).default('vitest')})
const demo = defineExtension({name: 'demo', configSchema: cfgSchema})

declare module '@conciv/protocol/config-types' {
  interface ExtensionConfigRegistry extends RegisterExtension<typeof demo> {}
}

test('config key + value type are derived from the registry (z.input — defaults optional)', () => {
  expectTypeOf<NonNullable<ConcivConfig['extensions']>['demo']>().toMatchTypeOf<
    {runner?: 'vitest' | 'jest'} | undefined
  >()
})

test('extension context must satisfy the intersection of its tools Ctx', () => {
  const tool = defineTool<z.ZodObject<Record<never, never>>, {factor: number}>({
    name: 't',
    description: 'd',
    inputSchema: z.object({}),
  }).server((_input, ctx) => ctx.factor)
  // @ts-expect-error — the returned context is missing `factor`, which the tool's Ctx requires
  defineExtension({name: 'k', tools: [tool]}).server(() => ({context: {}}))
  defineExtension({name: 'k', tools: [tool]}).server(() => ({context: {factor: 1}}))
})
