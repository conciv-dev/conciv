import {type JSX} from 'solid-js'
import {z} from 'zod'
import type {ToolCardProps, ToolCardView} from '@conciv/protocol/tool-view-types'
import {parseResultPayload} from '@conciv/ui-kit-chat/tools'
import {ActionCard, actionCardBody} from './card-shared.js'

const OkResultSchema = z.object({ok: z.literal(true)}).loose()

function wentBack(result: ToolCardProps['result']): boolean {
  return OkResultSchema.safeParse(parseResultPayload(result)).success
}

function BackCard(props: ToolCardProps): JSX.Element {
  const summary = () => (wentBack(props.result) ? 'went back' : '')
  return <ActionCard {...props} summary={summary()} />
}

export const backCard: ToolCardView = {
  render: BackCard,
  hasEmbeddedBody: actionCardBody,
}
