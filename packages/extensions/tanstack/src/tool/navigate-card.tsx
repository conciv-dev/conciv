import {type JSX} from 'solid-js'
import {z} from 'zod'
import type {ToolCardProps, ToolCardView} from '@conciv/protocol/tool-view-types'
import {parseResultPayload} from '@conciv/ui-kit-chat/tools'
import {ActionCard, settledCardBody} from './card-shared.js'

const NavigateResultSchema = z.object({to: z.string()}).loose()

function navigatedTo(result: ToolCardProps['result']): string | undefined {
  const parsed = NavigateResultSchema.safeParse(parseResultPayload(result))
  return parsed.success ? parsed.data.to : undefined
}

export function NavigateCard(props: ToolCardProps): JSX.Element {
  const summary = () => {
    const to = navigatedTo(props.result)
    return to === undefined ? '' : `→ ${to}`
  }
  return <ActionCard {...props} summary={summary()} />
}

export const navigateCard: ToolCardView = {
  render: NavigateCard,
  hasEmbeddedBody: (part, result) => settledCardBody(part, result, navigatedTo(result) !== undefined),
}
