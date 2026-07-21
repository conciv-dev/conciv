import {For, Show, type JSX} from 'solid-js'
import {z} from 'zod'
import {Waypoints} from 'lucide-solid'
import type {ToolCardProps} from '@conciv/protocol/tool-view-types'
import {parseResultPayload} from '@conciv/ui-kit-chat'
import {InspectionCard} from './card-shared.js'

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
          <div class="flex flex-col gap-0.5">
            <For each={list()}>
              {(route) => (
                <div class="text-[length:var(--chat-text-xs)] flex gap-2 [font-family:var(--chat-mono)] items-baseline">
                  <span class="min-w-0 truncate [color:var(--chat-text-2)]">{route.path}</span>
                  <span class="px-1.5 rounded-[var(--chat-radius-pill)] shrink-0 [background:var(--chat-sunken)] [color:var(--chat-text-3)]">
                    {route.kind}
                  </span>
                  <Show when={route.dynamic}>
                    <span class="px-1.5 rounded-[var(--chat-radius-pill)] shrink-0 [background:var(--chat-sunken)] [color:var(--chat-text-3)]">
                      dynamic
                    </span>
                  </Show>
                </div>
              )}
            </For>
          </div>
        )}
      </Show>
    </InspectionCard>
  )
}
