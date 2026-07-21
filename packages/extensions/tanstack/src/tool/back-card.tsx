import {type JSX} from 'solid-js'
import {z} from 'zod'
import {ArrowLeft} from 'lucide-solid'
import type {ToolCardProps} from '@conciv/protocol/tool-view-types'
import {parseResultPayload} from '@conciv/ui-kit-chat'
import {ActionCard} from './card-shared.js'

const OkResultSchema = z.object({ok: z.literal(true)}).loose()

function BackIcon(): JSX.Element {
  return <ArrowLeft size={14} />
}

export function BackCard(props: ToolCardProps): JSX.Element {
  const summary = () => {
    const parsed = OkResultSchema.safeParse(parseResultPayload(props.result))
    return parsed.success ? 'went back' : ''
  }
  return <ActionCard card={props} Icon={BackIcon} summary={summary()} />
}
