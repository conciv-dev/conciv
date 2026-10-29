import {For, Match, Show, Switch, type JSX} from 'solid-js'
import {z} from 'zod'
import {StatusDot, type StatusDotTone} from '@conciv/ui-kit-system'
import type {ToolCardProps, ToolCardView} from '@conciv/protocol/tool-view-types'
import {CardShell, ErrorBlock, JsonTree, MirrorRow, cardHeader} from '@conciv/ui-kit-chat/tools'
import {QUIET_TEXT_CLASS, cardErrorMessage, cardPayload, hasPayloadOrError, mutatingBadge} from './shared.js'

const SingleEffect = z.looseObject({effect: z.string(), enabled: z.boolean()})

const EffectList = z.looseObject({
  effects: z.array(z.looseObject({name: z.string(), description: z.string().optional(), enabled: z.boolean()})),
})

const EFFECT_NAME_KEYS = new Set(['effect'])

const LIST = 'm-0 p-0 list-none flex flex-col gap-1.5'
const ROW = 'text-[length:var(--chat-text-sm)] m-0 flex gap-2 items-center'
const NAME = '[color:var(--chat-text)] [font-family:var(--chat-mono)] min-w-0 [overflow-wrap:anywhere]'
const DESCRIPTION = 'text-[length:var(--chat-text-xs)] flex-1 min-w-0 [color:var(--chat-text-3)]'
const STATE = 'text-[length:var(--chat-text-xs)] flex-none [color:var(--chat-text-2)]'

type EffectRow = {name: string; description: string | undefined; enabled: boolean}

function toneOf(enabled: boolean): StatusDotTone {
  return enabled ? 'success' : 'idle'
}

function stateLabel(enabled: boolean): string {
  return enabled ? 'on' : 'off'
}

function rowsOf(payload: unknown): readonly EffectRow[] | undefined {
  const single = SingleEffect.safeParse(payload)
  if (single.success) return [{name: single.data.effect, description: undefined, enabled: single.data.enabled}]
  const list = EffectList.safeParse(payload)
  if (!list.success) return undefined
  return list.data.effects.map((effect) => ({
    name: effect.name,
    description: effect.description,
    enabled: effect.enabled,
  }))
}

function EffectRowView(props: {row: EffectRow}): JSX.Element {
  return (
    <p class={ROW}>
      <StatusDot tone={toneOf(props.row.enabled)} />
      <span class={NAME}>{props.row.name}</span>
      <Show when={props.row.description}>{(description) => <span class={DESCRIPTION}>{description()}</span>}</Show>
      <span class={STATE}>{stateLabel(props.row.enabled)}</span>
    </p>
  )
}

function EffectCard(props: ToolCardProps): JSX.Element {
  const {meta, title} = cardHeader(props)
  const payload = () => cardPayload(props.result)
  const rows = () => rowsOf(payload())
  const errorMessage = () => cardErrorMessage(props.result)
  const chipSkip = () => (rows() === undefined ? undefined : EFFECT_NAME_KEYS)
  return (
    <CardShell
      meta={meta()}
      title={title()}
      metaBadge={mutatingBadge(meta())}
      part={props.part}
      result={props.result}
      durationMs={props.durationMs}
      chipSkip={chipSkip()}
    >
      <div class="flex flex-col gap-1.5">
        <Switch>
          <Match when={errorMessage()}>{(message) => <ErrorBlock message={message()} />}</Match>
          <Match when={rows()}>
            {(list) => (
              <Show when={list().length > 0} fallback={<p class={QUIET_TEXT_CLASS}>the page registered no effects</p>}>
                <ul class={LIST}>
                  <For each={list()}>
                    {(row) => (
                      <li>
                        <EffectRowView row={row} />
                      </li>
                    )}
                  </For>
                </ul>
              </Show>
            )}
          </Match>
          <Match when={payload() !== undefined}>
            <JsonTree data={payload()} />
          </Match>
        </Switch>
        <Show when={meta()?.mirrors === true}>
          <MirrorRow />
        </Show>
      </div>
    </CardShell>
  )
}

export const effectCard: ToolCardView = {
  render: EffectCard,
  hasEmbeddedBody: (part, result, ctx) => hasPayloadOrError(result) || ctx.catalog.meta(part.name)?.mirrors === true,
}
