import {type JSX} from 'solid-js'
import type {ToolComponent, ToolProps} from '@conciv/plugin/experimental'
import {InspectionCard, resultOk} from './card-shared.js'

function BackCard(props: ToolProps): JSX.Element {
  const summary = () => (resultOk(props.output) ? 'went back' : '')
  return <InspectionCard {...props} summary={summary()} />
}

export const backCard: ToolComponent = BackCard
