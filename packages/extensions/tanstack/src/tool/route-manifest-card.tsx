import {For, Show, type JSX} from 'solid-js'
import {z} from 'zod'
import type {ToolCardProps, ToolCardView} from '@conciv/protocol/tool-view-types'
import {Chip, parseResultPayload} from '@conciv/ui-kit-chat/tools'
import {CardRow, CardRows, InspectionCard, settledCardBody} from './card-shared.js'

type RouteRow = {path: string; kind: string; dynamic: boolean}

const RouteInfoSchema = z.object({path: z.string(), kind: z.string(), dynamic: z.boolean()}).loose()

const RouteManifestSchema = z.array(RouteInfoSchema)

function parseRoutes(result: ToolCardProps['result']): RouteRow[] | null {
  const parsed = RouteManifestSchema.safeParse(parseResultPayload(result))
  if (!parsed.success) return null
  return parsed.data.map((route) => ({path: route.path, kind: route.kind, dynamic: route.dynamic}))
}

export function RouteManifestCard(props: ToolCardProps): JSX.Element {
  const routes = () => parseRoutes(props.result)
  const summary = () => {
    const list = routes()
    if (!list) return ''
    return `${list.length} ${list.length === 1 ? 'route' : 'routes'}`
  }
  return (
    <InspectionCard {...props} summary={summary()}>
      <Show when={routes()}>
        {(list) => (
          <CardRows>
            <For each={list()}>
              {(route) => (
                <CardRow>
                  <span class="text-chat-text-2 flex-1 min-w-0 truncate">{route.path}</span>
                  <span class="text-[10.5px] text-chat-text-3 tracking-[0.06em] shrink-0 w-14 uppercase">
                    {route.kind}
                  </span>
                  <Show when={route.dynamic}>
                    <Chip kind="pill" value="dynamic" tone="accent" />
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

export const routeManifestCard: ToolCardView = {
  render: RouteManifestCard,
  hasEmbeddedBody: (part, result) => settledCardBody(part, result, parseRoutes(result) !== null),
}
