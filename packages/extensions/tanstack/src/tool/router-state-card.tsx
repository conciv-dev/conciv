import {For, Show, type JSX} from 'solid-js'
import {z} from 'zod'
import type {ToolCardProps, ToolCardView} from '@conciv/protocol/tool-view-types'
import {Chip, parseResultPayload} from '@conciv/ui-kit-chat/tools'
import {CardRow, CardRows, InspectionCard, settledCardBody} from './card-shared.js'

const MatchSchema = z.object({routeId: z.string(), path: z.string().default(''), status: z.string().optional()}).loose()

const RouterStateSchema = z
  .object({
    location: z.object({pathname: z.string(), search: z.string().default(''), hash: z.string().default('')}).loose(),
    matches: z.array(MatchSchema),
  })
  .loose()

type RouterState = z.infer<typeof RouterStateSchema>

function parseState(result: ToolCardProps['result']): RouterState | null {
  const parsed = RouterStateSchema.safeParse(parseResultPayload(result))
  return parsed.success ? parsed.data : null
}

function summarize(state: RouterState): string {
  const count = state.matches.length
  return `${state.location.pathname} · ${count} ${count === 1 ? 'match' : 'matches'}`
}

function locationLine(location: RouterState['location']): string {
  return `${location.pathname}${location.search}${location.hash}`
}

export function RouterStateCard(props: ToolCardProps): JSX.Element {
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
              <span class="text-chat-text-hi min-w-0 truncate">{locationLine(value().location)}</span>
            </CardRow>
            <For each={value().matches}>
              {(match) => (
                <CardRow>
                  <span class="text-chat-text-2 min-w-0 truncate">{match.routeId}</span>
                  <Show when={match.path}>
                    <span class="text-chat-text-3 shrink-0">{match.path}</span>
                  </Show>
                  <Show when={match.status}>
                    {(status) => (
                      <Chip
                        kind="pill"
                        value={status()}
                        tone={status() === 'error' ? 'danger' : undefined}
                        class="ml-auto"
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
