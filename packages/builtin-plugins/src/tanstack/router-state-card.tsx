import {For, Show, type JSX} from 'solid-js'
import {z} from 'zod'
import {RouteMatch, RouterCurrent} from '@conciv/plugin-tanstack/rpc'
import type {ToolCardProps, ToolCardView} from '@conciv/protocol/tool-view-types'
import {TruncatedText} from '@conciv/ui-kit-system'
import {Chip, parseResultPayload} from '@conciv/ui-kit-chat/tools'
import {CardRow, CardRows, InspectionCard, settledCardBody} from './card-shared.js'
import {countLabel} from '../page/cards/shared.js'

const MatchSchema = RouteMatch.pick({routeId: true, status: true})
  .partial({status: true})
  .extend({path: RouteMatch.shape.path.default('')})
  .loose()

const LocationSchema = RouterCurrent.shape.location
  .extend({
    search: RouterCurrent.shape.location.shape.search.default(''),
    hash: RouterCurrent.shape.location.shape.hash.default(''),
  })
  .loose()

const RouterStateSchema = RouterCurrent.extend({location: LocationSchema, matches: z.array(MatchSchema)}).loose()

type RouterState = z.infer<typeof RouterStateSchema>

function parseState(result: ToolCardProps['result']): RouterState | null {
  const parsed = RouterStateSchema.safeParse(parseResultPayload(result))
  return parsed.success ? parsed.data : null
}

function summarize(state: RouterState): string {
  const count = state.matches.length
  return `${state.location.pathname} · ${countLabel(count, 'match', 'matches')}`
}

function locationLine(location: RouterState['location']): string {
  return `${location.pathname}${location.search}${location.hash}`
}

function RouterStateCard(props: ToolCardProps): JSX.Element {
  const state = () => parseState(props.result)
  const summary = () => {
    const value = state()
    return value ? summarize(value) : ''
  }
  return (
    <InspectionCard {...props} summary={summary()}>
      <Show when={state()}>
        {(value) => (
          <CardRows>
            <CardRow>
              <TruncatedText class="text-chat-text-hi min-w-0" text={locationLine(value().location)} />
            </CardRow>
            <For each={value().matches}>
              {(match) => (
                <CardRow>
                  <TruncatedText class="text-chat-text-2 min-w-0" text={match.routeId} />
                  <Show when={match.path}>
                    <span class="text-chat-text-3 shrink-0">{match.path}</span>
                  </Show>
                  <Show when={match.status}>
                    {(status) => (
                      <Chip
                        kind="pill"
                        value={status()}
                        tone={status() === 'error' ? 'danger' : undefined}
                        class="ms-auto"
                      />
                    )}
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

export const routerStateCard: ToolCardView = {
  render: RouterStateCard,
  hasEmbeddedBody: (part, result) => settledCardBody(part, result, parseState(result) !== null),
}
