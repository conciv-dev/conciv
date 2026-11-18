import {type JSX} from 'solid-js'
import type {ToolComponent, ToolProps} from '@conciv/plugin/experimental'
import {InspectionCard, resultOk} from './card-shared.js'

function RouterInvalidateCard(props: ToolProps): JSX.Element {
  const summary = () => (resultOk(props.output) ? 'invalidated' : '')
  return <InspectionCard {...props} summary={summary()} />
}

export const routerInvalidateCard: ToolComponent = RouterInvalidateCard
