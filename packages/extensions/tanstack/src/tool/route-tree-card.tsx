import {For, Show, type JSX} from 'solid-js'
import {z} from 'zod'
import type {ToolCardProps, ToolCardView} from '@conciv/protocol/tool-view-types'
import {TruncatedText} from '@conciv/ui-kit-system'
import {Chip, parseResultPayload} from '@conciv/ui-kit-chat/tools'
import {CardRow, CardRows, InspectionCard, settledCardBody} from './card-shared.js'

type RouteNodeShape = {id: string; depth: number; hasLoader: boolean}

type RawRouteNode = {id: string; hasLoader?: boolean; children: RawRouteNode[]}

const RouteNodeSchema: z.ZodType<RawRouteNode> = z.lazy(() =>
  z
    .object({id: z.string(), hasLoader: z.boolean().default(false), children: z.array(RouteNodeSchema).default([])})
    .loose(),
)

function flatten(node: RawRouteNode, depth: number): RouteNodeShape[] {
  return [
    {id: node.id, depth, hasLoader: node.hasLoader ?? false},
    ...node.children.flatMap((child) => flatten(child, depth + 1)),
  ]
}

function parseTree(result: ToolCardProps['result']): RouteNodeShape[] | null {
  const parsed = RouteNodeSchema.safeParse(parseResultPayload(result))
  return parsed.success ? flatten(parsed.data, 0) : null
}

export function RouteTreeCard(props: ToolCardProps): JSX.Element {
  const nodes = () => parseTree(props.result)
  const summary = () => {
    const list = nodes()
    if (!list) return ''
    return `${list.length} ${list.length === 1 ? 'route' : 'routes'}`
  }
  return (
    <InspectionCard {...props} summary={summary()}>
      <Show when={nodes()}>
        {(list) => (
          <CardRows>
            <For each={list()}>
              {(node) => (
                <CardRow style={{'padding-left': `${Math.max(0, node.depth - 1) * 12}px`}}>
                  <Show when={node.depth > 0}>
                    <span aria-hidden="true" class="text-chat-faint shrink-0">
                      └
                    </span>
                  </Show>
                  <TruncatedText class="text-chat-text-2 min-w-0" text={node.id} />
                  <Show when={node.hasLoader}>
                    <Chip kind="pill" value="loader" />
                  </Show>
                </CardRow>
              )}
            </For>
          </CardRows>
        )}
      </Show>
    </InspectionCard>
  )
}

export const routeTreeCard: ToolCardView = {
  render: RouteTreeCard,
  hasEmbeddedBody: (part, result) => settledCardBody(part, result, parseTree(result) !== null),
}
