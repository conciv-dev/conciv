import {type JSX} from 'solid-js'
import type {ToolCardProps, ToolCardView} from '@conciv/protocol/tool-view-types'
import {parseInput} from '@conciv/ui-kit-chat/tools'
import {InspectionCard, actionCardBody, tanstackOperation, resultOk} from './card-shared.js'

const KeyInputSchema = tanstackOperation('query_invalidate').input.pick({key: true})

function QueryInvalidateCard(props: ToolCardProps): JSX.Element {
  const summary = () => {
    if (!resultOk(props.result)) return ''
    const input = parseInput(KeyInputSchema, props.part)
    return `invalidated ${input?.key ?? ''}`.trimEnd()
  }
  return <InspectionCard {...props} summary={summary()} />
}

export const queryInvalidateCard: ToolCardView = {
  render: QueryInvalidateCard,
  hasEmbeddedBody: actionCardBody,
}
