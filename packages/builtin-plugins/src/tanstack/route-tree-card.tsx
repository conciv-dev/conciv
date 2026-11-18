import {For, Show, type JSX} from 'solid-js'
import {z} from 'zod'
import {RouteNode} from '@conciv/plugin-tanstack/rpc'
import {sumBy} from 'es-toolkit'
import CornerDownRight from 'lucide-solid/icons/corner-down-right'
import type {ToolComponent, ToolProps} from '@conciv/plugin/experimental'
import {TruncatedText} from '@conciv/ui-kit-system'
import {CardRow, CardRows, InspectionCard, parseOutput} from './card-shared.js'
import {countLabel} from '../page/cards/shared.js'

const RouteBranchSchema = RouteNode.pick({id: true})
  .extend({
    hasLoader: RouteNode.shape.hasLoader.default(false),
    get children(): z.ZodDefault<z.ZodArray<typeof RouteBranchSchema>> {
      return z.array(RouteBranchSchema).default([])
    },
  })
  .loose()

type RouteBranchNode = z.infer<typeof RouteBranchSchema>

function parseTree(result: string | undefined): RouteBranchNode | null {
  const parsed = RouteBranchSchema.safeParse(parseOutput(result))
  return parsed.success ? parsed.data : null
}

function countRoutes(node: RouteBranchNode): number {
  return 1 + sumBy(node.children, countRoutes)
}

function RouteBranch(props: {node: RouteBranchNode; root: boolean}): JSX.Element {
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

function RouteTreeCard(props: ToolProps): JSX.Element {
  const tree = () => parseTree(props.output)
  const summary = () => {
    const root = tree()
    return root ? countLabel(countRoutes(root), 'route', 'routes') : ''
  }
  return (
    <InspectionCard {...props} summary={summary()} hasContent={parseTree(props.output) !== null}>
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

export const routeTreeCard: ToolComponent = RouteTreeCard
