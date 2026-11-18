import {For, Match, Show, Switch, type JSX} from 'solid-js'
import {StatusDot, type StatusDotTone} from '@conciv/ui-kit-system'
import type {ToolProps} from '@conciv/plugin/experimental'
import {JsonTree} from '@conciv/ui-kit-chat/tools'
import {pageOperation} from './page-tool-names.js'
import {PageTool, QUIET_TEXT_CLASS, outputPayload} from './shared.js'

const [SingleEffect, EffectList] = pageOperation('effect').output.options

const EFFECT_NAME_KEYS = new Set(['effect'])

const LIST = 'm-0 p-0 list-none flex flex-col gap-1.5'
const ROW = 'text-[length:var(--chat-text-sm)] m-0 flex gap-2 items-center'
const NAME = '[color:var(--chat-text)] [font-family:var(--chat-mono)] min-w-0 [overflow-wrap:anywhere]'
const DESCRIPTION = 'text-[length:var(--chat-text-xs)] flex-1 min-w-0 text-chat-text-3'
const STATE = 'text-[length:var(--chat-text-xs)] flex-none text-chat-text-2'

type EffectRow = {name: string; description: string | undefined; enabled: boolean}

function pickTone(enabled: boolean): StatusDotTone {
  return enabled ? 'success' : 'idle'
}

function stateLabel(enabled: boolean): string {
  return enabled ? 'on' : 'off'
}

function readRows(payload: unknown): readonly EffectRow[] | undefined {
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
      <StatusDot tone={pickTone(props.row.enabled)} />
      <span class={NAME}>{props.row.name}</span>
      <Show when={props.row.description}>{(description) => <span class={DESCRIPTION}>{description()}</span>}</Show>
      <span class={STATE}>{stateLabel(props.row.enabled)}</span>
    </p>
  )
}

export function EffectCard(props: ToolProps): JSX.Element {
  const payload = () => outputPayload(props.output)
  const rows = () => readRows(payload())
  const skip = () => (rows() === undefined ? undefined : EFFECT_NAME_KEYS)
  return (
    <PageTool {...props} skip={skip()} hasContent={payload() !== undefined}>
      <div class="flex flex-col gap-1.5">
        <Switch>
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
      </div>
    </PageTool>
  )
}
