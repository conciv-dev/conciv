import {For, Show, type JSX} from 'solid-js'
import {z} from 'zod'
import {Route} from 'lucide-solid'
import type {ToolCardProps} from '@conciv/protocol/tool-view-types'
import {parseResultPayload} from '@conciv/ui-kit-chat'
import {CardRow, CardRows, InspectionCard} from './card-shared.js'

const MatchSchema = z.object({routeId: z.string(), path: z.string().default('')}).loose()

const RouterStateSchema = z
  .object({location: z.object({pathname: z.string()}).loose(), matches: z.array(MatchSchema)})
  .loose()

type RouterState = z.infer<typeof RouterStateSchema>

function parseState(props: ToolCardProps): RouterState | null {
  const parsed = RouterStateSchema.safeParse(parseResultPayload(props.result))
  return parsed.success ? parsed.data : null
}

function summarize(state: RouterState): string {
  const count = state.matches.length
  return `${state.location.pathname} · ${count} ${count === 1 ? 'match' : 'matches'}`
}

function RouterIcon(): JSX.Element {
  return <Route size={14} />
}

export function RouterStateCard(props: ToolCardProps): JSX.Element {
  const state = () => parseState(props)
  const summary = () => {
    const value = state()
    return value ? summarize(value) : ''
  }
  return (
    <InspectionCard card={props} Icon={RouterIcon} summary={summary()}>
      <Show when={state()}>
        {(value) => (
          <CardRows>
            <For each={value().matches}>
              {(match) => (
                <CardRow>
                  <span class="min-w-0 truncate [color:var(--chat-text-2)]">{match.routeId}</span>
                  <Show when={match.path}>
                    <span class="shrink-0 [color:var(--chat-text-3)]">{match.path}</span>
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
