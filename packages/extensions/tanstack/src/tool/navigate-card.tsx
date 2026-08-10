import {type JSX} from 'solid-js'
import {z} from 'zod'
import type {ToolCardProps} from '@conciv/protocol/tool-view-types'
import {parseResultPayload} from '@conciv/ui-kit-chat/tools'
import {ActionCard} from './card-shared.js'

const NavigateResultSchema = z.object({to: z.string()}).loose()

export function NavigateCard(props: ToolCardProps): JSX.Element {
  const summary = () => {
    const parsed = NavigateResultSchema.safeParse(parseResultPayload(props.result))
    return parsed.success ? `→ ${parsed.data.to}` : ''
  }
  return <ActionCard {...props} summary={summary()} />
}
