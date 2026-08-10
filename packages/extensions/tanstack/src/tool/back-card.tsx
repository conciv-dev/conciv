import {type JSX} from 'solid-js'
import {z} from 'zod'
import type {ToolCardProps} from '@conciv/protocol/tool-view-types'
import {parseResultPayload} from '@conciv/ui-kit-chat/tools'
import {ActionCard} from './card-shared.js'

const OkResultSchema = z.object({ok: z.literal(true)}).loose()

export function BackCard(props: ToolCardProps): JSX.Element {
  const summary = () => {
    const parsed = OkResultSchema.safeParse(parseResultPayload(props.result))
    return parsed.success ? 'went back' : ''
  }
  return <ActionCard {...props} summary={summary()} />
}
