import {For, Show, type JSX} from 'solid-js'
import {z} from 'zod'
import {Route} from 'lucide-solid'
import type {ToolCardProps} from '@conciv/protocol/tool-view-types'
import {parseResultPayload} from '@conciv/ui-kit-chat'
import {InspectionCard} from './card-shared.js'

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
          <div class="flex flex-col gap-0.5">
            <For each={value().matches}>
              {(match) => (
                <div class="text-[length:var(--chat-text-xs)] flex gap-2 [font-family:var(--chat-mono)] items-baseline">
                  <span class="min-w-0 truncate [color:var(--chat-text-2)]">{match.routeId}</span>
                  <Show when={match.path}>
                    <span class="shrink-0 [color:var(--chat-text-3)]">{match.path}</span>
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
