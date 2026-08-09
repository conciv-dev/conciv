import {For, Match, Show, Switch, type JSX} from 'solid-js'
import type {ToolCardProps} from '@conciv/protocol/tool-view-types'
import {Chip, DANGER_TEXT_CLASS} from '@conciv/ui-kit-chat'
import {
  CardShell,
  cardErrorMessage,
  cardHeader,
  detailChips,
  elementTargetValue,
  resultChips,
  toolInput,
} from './shared.js'

const CHIP_ROW = 'm-0 p-0 flex flex-wrap gap-1.5'

export function ReadValueCard(props: ToolCardProps): JSX.Element {
  const {meta, title} = cardHeader(props)
  const input = () => toolInput(props.part)
  const element = () => elementTargetValue(input())
  const extraChips = () => detailChips(meta(), input())
  const values = () => resultChips(props.result)
  const errorMessage = () => cardErrorMessage(props.result)
  return (
    <CardShell meta={meta()} title={title()} part={props.part} result={props.result} durationMs={props.durationMs}>
      <div class="flex flex-col gap-1.5">
        <Show when={element() !== undefined || extraChips().length > 0}>
          <dl class={CHIP_ROW}>
            <Show when={element()}>{(value) => <Chip name="element" value={value()} />}</Show>
            <For each={extraChips()}>{(chip) => <Chip name={chip.name} value={chip.value} />}</For>
          </dl>
        </Show>
        <Switch>
          <Match when={errorMessage()}>{(message) => <p class={DANGER_TEXT_CLASS}>{message()}</p>}</Match>
          <Match when={values().length > 0}>
            <dl class={CHIP_ROW}>
              <For each={values()}>{(chip) => <Chip name={chip.name} value={chip.value} />}</For>
            </dl>
          </Match>
        </Switch>
      </div>
    </CardShell>
  )
}
