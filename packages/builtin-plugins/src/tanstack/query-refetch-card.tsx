import {type JSX} from 'solid-js'
import type {ToolComponent, ToolProps} from '@conciv/plugin/experimental'
import {InspectionCard, tanstackOperation, resultOk, readInput} from './card-shared.js'

const KeyInputSchema = tanstackOperation('query_refetch').input.pick({key: true})

function QueryRefetchCard(props: ToolProps): JSX.Element {
  const summary = () => {
    if (!resultOk(props.output)) return ''
    const input = readInput(KeyInputSchema, props.input)
    return input?.key ?? ''
  }
  return <InspectionCard {...props} summary={summary()} />
}

export const queryRefetchCard: ToolComponent = QueryRefetchCard
