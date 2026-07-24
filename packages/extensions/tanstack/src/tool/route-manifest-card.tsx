import {For, Show, type JSX} from 'solid-js'
import {z} from 'zod'
import {Waypoints} from 'lucide-solid'
import type {ToolCardProps} from '@conciv/protocol/tool-view-types'
import {parseResultPayload} from '@conciv/ui-kit-chat'
import {ToolChip} from '@conciv/ui-kit-chat-tools'
import {CardRow, CardRows, InspectionCard} from './card-shared.js'

type RouteRow = {path: string; kind: string; dynamic: boolean}

const RouteInfoSchema = z.object({path: z.string(), kind: z.string(), dynamic: z.boolean()}).loose()

const RouteManifestSchema = z.array(RouteInfoSchema)

function parseRoutes(props: ToolCardProps): RouteRow[] | null {
  const parsed = RouteManifestSchema.safeParse(parseResultPayload(props.result))
  if (!parsed.success) return null
  return parsed.data.map((route) => ({path: route.path, kind: route.kind, dynamic: route.dynamic}))
}

function ManifestIcon(): JSX.Element {
  return <Waypoints size={14} />
}

export function RouteManifestCard(props: ToolCardProps): JSX.Element {
  const routes = () => parseRoutes(props)
  const summary = () => {
    const list = routes()
    if (!list) return ''
    return `${list.length} ${list.length === 1 ? 'route' : 'routes'}`
  }
  return (
    <InspectionCard card={props} Icon={ManifestIcon} summary={summary()}>
      <Show when={routes()}>
        {(list) => (
          <CardRows>
            <For each={list()}>
              {(route) => (
                <CardRow>
                  <span class="min-w-0 truncate [color:var(--chat-text-2)]">{route.path}</span>
                  <ToolChip name={route.kind} />
                  <Show when={route.dynamic}>
                    <ToolChip name="dynamic" />
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
