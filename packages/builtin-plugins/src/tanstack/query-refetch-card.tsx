import {type JSX} from 'solid-js'
import {z} from 'zod'
import type {ToolCardProps, ToolCardView} from '@conciv/protocol/tool-view-types'
import {parseInput, parseResultPayload} from '@conciv/ui-kit-chat/tools'
import {ActionCard, actionCardBody} from './card-shared.js'

const OkResultSchema = z.object({ok: z.literal(true)}).loose()
const KeyInputSchema = z.object({key: z.string()})

function didRefetch(result: ToolCardProps['result']): boolean {
  return OkResultSchema.safeParse(parseResultPayload(result)).success
}

function QueryRefetchCard(props: ToolCardProps): JSX.Element {
  const summary = () => {
    if (!didRefetch(props.result)) return ''
    const input = parseInput(KeyInputSchema, props.part)
    return `refetched ${input?.key ?? ''}`.trimEnd()
  }
  return <ActionCard {...props} summary={summary()} />
}

export const queryRefetchCard: ToolCardView = {
  render: QueryRefetchCard,
  hasEmbeddedBody: actionCardBody,
}
