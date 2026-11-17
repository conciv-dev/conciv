import {type JSX} from 'solid-js'
import {z} from 'zod'
import type {ToolCardProps, ToolCardView} from '@conciv/protocol/tool-view-types'
import {parseInput} from '@conciv/ui-kit-chat/tools'
import {InspectionCard, actionCardBody, resultOk} from './card-shared.js'

const KeyInputSchema = z.object({key: z.string()})

function QueryRefetchCard(props: ToolCardProps): JSX.Element {
  const summary = () => {
    if (!resultOk(props.result)) return ''
    const input = parseInput(KeyInputSchema, props.part)
    return `refetched ${input?.key ?? ''}`.trimEnd()
  }
  return <InspectionCard {...props} summary={summary()} />
}

export const queryRefetchCard: ToolCardView = {
  render: QueryRefetchCard,
  hasEmbeddedBody: actionCardBody,
}
