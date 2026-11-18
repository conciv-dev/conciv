import {type JSX} from 'solid-js'
import type {ToolComponent, ToolProps} from '@conciv/plugin/experimental'
import {InspectionCard, tanstackOperation, resultOk, readInput} from './card-shared.js'

const KeyInputSchema = tanstackOperation('query_invalidate').input.pick({key: true})

function QueryInvalidateCard(props: ToolProps): JSX.Element {
  const summary = () => {
    if (!resultOk(props.output)) return ''
    const input = readInput(KeyInputSchema, props.input)
    return input?.key ?? ''
  }
  return <InspectionCard {...props} summary={summary()} />
}

export const queryInvalidateCard: ToolComponent = QueryInvalidateCard
