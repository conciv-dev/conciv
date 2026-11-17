import {type JSX} from 'solid-js'
import type {ToolCardProps, ToolCardView} from '@conciv/protocol/tool-view-types'
import {ActionCard, actionCardBody, resultOk} from './card-shared.js'

function BackCard(props: ToolCardProps): JSX.Element {
  const summary = () => (resultOk(props.result) ? 'went back' : '')
  return <ActionCard {...props} summary={summary()} />
}

export const backCard: ToolCardView = {
  render: BackCard,
  hasEmbeddedBody: actionCardBody,
}
