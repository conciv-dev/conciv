import {z} from 'zod'
import {defineTool, type ToolDefinition} from '@mandarax/extensions'
import type {MandaraxToolContext} from './types.js'

export const EffectInput = z.object({
  effect: z.string().optional(),
  action: z.enum(['enable', 'disable', 'toggle', 'list']),
})

export function createEffectToolDefinition(ctx: MandaraxToolContext): ToolDefinition<typeof EffectInput> {
  return defineTool({
    name: 'mandarax_page_effect',
    label: 'Page Effect',
    description:
      "Toggle a reversible visual page effect for the user (you enable it, the user interacts with it). action: enable | disable | toggle | list. Call with action 'list' first to see the available effects, their descriptions, and live on/off state, then pass an effect id to enable/disable/toggle.",
    parameters: EffectInput,
    execute: ({effect, action}) => ctx.page({kind: 'effect', effect, action}),
  })
}
