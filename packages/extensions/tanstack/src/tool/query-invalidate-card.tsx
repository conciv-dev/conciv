import {type JSX} from 'solid-js'
import {z} from 'zod'
import type {ToolCardProps} from '@conciv/protocol/tool-view-types'
import {parseInput, parseResultPayload} from '@conciv/ui-kit-chat/tools'
import {ActionCard} from './card-shared.js'

const OkResultSchema = z.object({ok: z.literal(true)}).loose()
const KeyInputSchema = z.object({key: z.string()})

export function QueryInvalidateCard(props: ToolCardProps): JSX.Element {
  const summary = () => {
    const parsed = OkResultSchema.safeParse(parseResultPayload(props.result))
    if (!parsed.success) return ''
    const input = parseInput(KeyInputSchema, props.part)
    return `invalidated ${input?.key ?? ''}`.trimEnd()
  }
  return <ActionCard {...props} summary={summary()} />
}
