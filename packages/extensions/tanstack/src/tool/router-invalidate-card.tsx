import {type JSX} from 'solid-js'
import {z} from 'zod'
import type {ToolCardProps, ToolCardView} from '@conciv/protocol/tool-view-types'
import {parseResultPayload} from '@conciv/ui-kit-chat/tools'
import {ActionCard, settledCardBody} from './card-shared.js'

const OkResultSchema = z.object({ok: z.literal(true)}).loose()

function didInvalidate(result: ToolCardProps['result']): boolean {
  return OkResultSchema.safeParse(parseResultPayload(result)).success
}

export function RouterInvalidateCard(props: ToolCardProps): JSX.Element {
  const summary = () => (didInvalidate(props.result) ? 'invalidated' : '')
  return <ActionCard {...props} summary={summary()} />
}

export const routerInvalidateCard: ToolCardView = {
  render: RouterInvalidateCard,
  hasEmbeddedBody: (part, result) => settledCardBody(part, result, didInvalidate(result)),
}
