import {For, Show, type JSX} from 'solid-js'
import {z} from 'zod'
import {ListTree} from 'lucide-solid'
import type {ToolCardProps} from '@conciv/protocol/tool-view-types'
import {parseResultPayload} from '@conciv/ui-kit-chat'
import {ToolChip} from '@conciv/ui-kit-chat-tools'
import {CardRow, CardRows, InspectionCard} from './card-shared.js'

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

function parseTree(props: ToolCardProps): RouteNodeShape[] | null {
  const parsed = RouteNodeSchema.safeParse(parseResultPayload(props.result))
  return parsed.success ? flatten(parsed.data, 0) : null
}

function TreeIcon(): JSX.Element {
  return <ListTree size={14} />
}

export function RouteTreeCard(props: ToolCardProps): JSX.Element {
  const nodes = () => parseTree(props)
  const summary = () => {
    const list = nodes()
    if (!list) return ''
    return `${list.length} ${list.length === 1 ? 'route' : 'routes'}`
  }
  return (
    <InspectionCard card={props} Icon={TreeIcon} summary={summary()}>
      <Show when={nodes()}>
        {(list) => (
          <CardRows>
            <For each={list()}>
              {(node) => (
                <CardRow style={{'padding-left': `${node.depth * 12}px`}}>
                  <span class="min-w-0 truncate [color:var(--chat-text-2)]">{node.id}</span>
                  <Show when={node.hasLoader}>
                    <ToolChip name="loader" />
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
