import {For, Show, type JSX} from 'solid-js'
import {z} from 'zod'
import {sumBy} from 'es-toolkit'
import CornerDownRight from 'lucide-solid/icons/corner-down-right'
import type {ToolCardProps, ToolCardView} from '@conciv/protocol/tool-view-types'
import {TruncatedText} from '@conciv/ui-kit-system'
import {parseResultPayload} from '@conciv/ui-kit-chat/tools'
import {CardRow, CardRows, InspectionCard, settledCardBody, countLabel} from './card-shared.js'

type RawRouteNode = {id: string; hasLoader?: boolean; children: RawRouteNode[]}

const RouteNodeSchema: z.ZodType<RawRouteNode> = z.lazy(() =>
  z
    .object({id: z.string(), hasLoader: z.boolean().default(false), children: z.array(RouteNodeSchema).default([])})
    .loose(),
)

function parseTree(result: ToolCardProps['result']): RawRouteNode | null {
  const parsed = RouteNodeSchema.safeParse(parseResultPayload(result))
  return parsed.success ? parsed.data : null
}

function countRoutes(node: RawRouteNode): number {
  return 1 + sumBy(node.children, countRoutes)
}

function RouteBranch(props: {node: RawRouteNode; root: boolean}): JSX.Element {
  return (
    <>
      <CardRow>
        <Show when={!props.root}>
          <CornerDownRight size={12} aria-hidden="true" class="text-chat-faint shrink-0" />
        </Show>
        <TruncatedText class="text-chat-text-2 min-w-0" text={props.node.id} />
        <Show when={props.node.hasLoader}>
          <span class="text-chat-text-3 tracking-wider shrink-0 uppercase">loader</span>
        </Show>
      </CardRow>
      <Show when={props.node.children.length > 0}>
        <div class={`flex flex-col gap-0.5 ${props.root ? '' : 'ps-3'}`}>
          <For each={props.node.children}>{(child) => <RouteBranch node={child} root={false} />}</For>
        </div>
      </Show>
    </>
  )
}

function RouteTreeCard(props: ToolCardProps): JSX.Element {
  const tree = () => parseTree(props.result)
  const summary = () => {
    const root = tree()
    return root ? countLabel(countRoutes(root), 'route', 'routes') : ''
  }
  return (
    <InspectionCard {...props} summary={summary()}>
      <Show when={tree()}>
        {(root) => (
          <CardRows>
            <RouteBranch node={root()} root={true} />
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
