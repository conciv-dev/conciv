import {For, Show, type JSX} from 'solid-js'
import {z} from 'zod'
import type {ToolCardProps} from '@conciv/protocol/tool-view-types'
import {Chip, parseResultPayload} from '@conciv/ui-kit-chat/tools'
import {CardRow, CardRows, InspectionCard} from './card-shared.js'

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
                  <span class="min-w-0 truncate [color:var(--chat-text-2)]">{route.path}</span>
                  <Chip kind="pill" value={route.kind} />
                  <Show when={route.dynamic}>
                    <Chip kind="pill" value="dynamic" />
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
