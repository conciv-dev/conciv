import {type JSX} from 'solid-js'
import {z} from 'zod'
import {DatabaseZap} from 'lucide-solid'
import type {ToolCardProps} from '@conciv/protocol/tool-view-types'
import {parseInput, parseResultPayload} from '@conciv/ui-kit-chat'
import {ActionCard} from './card-shared.js'

const OkResultSchema = z.object({ok: z.literal(true)}).loose()
const KeyInputSchema = z.object({key: z.string()})

function QueryInvalidateIcon(): JSX.Element {
  return <DatabaseZap size={14} />
}

export function QueryInvalidateCard(props: ToolCardProps): JSX.Element {
  const summary = () => {
    const parsed = OkResultSchema.safeParse(parseResultPayload(props.result))
    if (!parsed.success) return ''
    const input = parseInput(KeyInputSchema, props.part)
    return `invalidated ${input?.key ?? ''}`.trimEnd()
  }
  return <ActionCard card={props} Icon={QueryInvalidateIcon} summary={summary()} />
}
