import {For, Show, type JSX} from 'solid-js'
import {z} from 'zod'
import {RouteInfo} from '@conciv/plugin-tanstack/rpc'
import type {ToolComponent, ToolProps} from '@conciv/plugin/experimental'
import {TruncatedText} from '@conciv/ui-kit-system'
import {CardRow, CardRows, InspectionCard, parseOutput} from './card-shared.js'
import {countLabel} from '../page/cards/shared.js'

type RouteRow = {path: string; kind: string; dynamic: boolean}

const RouteInfoSchema = RouteInfo.pick({path: true, kind: true, dynamic: true}).loose()

const RouteManifestSchema = z.array(RouteInfoSchema)

function parseRoutes(result: string | undefined): RouteRow[] | null {
  const parsed = RouteManifestSchema.safeParse(parseOutput(result))
  if (!parsed.success) return null
  return parsed.data.map((route) => ({path: route.path, kind: route.kind, dynamic: route.dynamic}))
}

function RouteManifestCard(props: ToolProps): JSX.Element {
  const routes = () => parseRoutes(props.output)
  const summary = () => {
    const list = routes()
    if (!list) return ''
    return countLabel(list.length, 'route', 'routes')
  }
  return (
    <InspectionCard {...props} summary={summary()} hasContent={parseRoutes(props.output) !== null}>
      <Show when={routes()}>
        {(list) => (
          <CardRows>
            <For each={list()}>
              {(route) => (
                <CardRow>
                  <TruncatedText class="text-chat-text-2 flex-1 min-w-0" text={route.path} />
                  <span class="text-chat-accent tracking-wider shrink-0 w-16 uppercase">
                    {route.dynamic ? 'dynamic' : ''}
                  </span>
                  <span class="text-chat-xs text-chat-text-3 tracking-wider shrink-0 w-14 uppercase">{route.kind}</span>
                </CardRow>
              )}
            </For>
          </CardRows>
        )}
      </Show>
    </InspectionCard>
  )
}

export const routeManifestCard: ToolComponent = RouteManifestCard
