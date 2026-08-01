import {type JSX} from 'solid-js'
import {z} from 'zod'
import {RefreshCw} from 'lucide-solid'
import type {ToolCardProps} from '@conciv/protocol/tool-view-types'
import {parseResultPayload} from '@conciv/ui-kit-chat'
import {ActionCard} from './card-shared.js'

const OkResultSchema = z.object({ok: z.literal(true)}).loose()

function InvalidateIcon(): JSX.Element {
  return <RefreshCw size={14} />
}

export function RouterInvalidateCard(props: ToolCardProps): JSX.Element {
  const summary = () => {
    const parsed = OkResultSchema.safeParse(parseResultPayload(props.result))
    return parsed.success ? 'invalidated' : ''
  }
  return <ActionCard card={props} Icon={InvalidateIcon} summary={summary()} />
}
