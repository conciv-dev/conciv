import {type JSX} from 'solid-js'
import type {ToolComponent, ToolProps} from '@conciv/plugin/experimental'
import {InspectionCard} from './card-shared.js'

function BackCard(props: ToolProps): JSX.Element {
  return <InspectionCard {...props} summary="" />
}

export const backCard: ToolComponent = BackCard
