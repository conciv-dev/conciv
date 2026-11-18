import {For, Show, type JSX} from 'solid-js'
import {z} from 'zod'
import {RouteMatch, RouterCurrent} from '@conciv/plugin-tanstack/rpc'
import type {ToolComponent, ToolProps} from '@conciv/plugin/experimental'
import {TruncatedText} from '@conciv/ui-kit-system'
import {Chip} from '@conciv/ui-kit-chat/tools'
import {CardRow, CardRows, InspectionCard, parseOutput} from './card-shared.js'
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

function parseState(result: string | undefined): RouterState | null {
  const parsed = RouterStateSchema.safeParse(parseOutput(result))
  return parsed.success ? parsed.data : null
}

function summarize(state: RouterState): string {
  const count = state.matches.length
  return `${state.location.pathname} · ${countLabel(count, 'match', 'matches')}`
}

function locationLine(location: RouterState['location']): string {
  return `${location.pathname}${location.search}${location.hash}`
}

function RouterStateCard(props: ToolProps): JSX.Element {
  const state = () => parseState(props.output)
  const summary = () => {
    const value = state()
    return value ? summarize(value) : ''
  }
  return (
    <InspectionCard {...props} summary={summary()} hasContent={parseState(props.output) !== null}>
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

export const routerStateCard: ToolComponent = RouterStateCard
