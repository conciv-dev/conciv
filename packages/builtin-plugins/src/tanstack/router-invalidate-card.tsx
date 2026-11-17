import {type JSX} from 'solid-js'
import type {ToolCardProps, ToolCardView} from '@conciv/protocol/tool-view-types'
import {ActionCard, actionCardBody, resultOk} from './card-shared.js'

function RouterInvalidateCard(props: ToolCardProps): JSX.Element {
  const summary = () => (resultOk(props.result) ? 'invalidated' : '')
  return <ActionCard {...props} summary={summary()} />
}

export const routerInvalidateCard: ToolCardView = {
  render: RouterInvalidateCard,
  hasEmbeddedBody: actionCardBody,
}
