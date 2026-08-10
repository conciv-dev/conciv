import {Match, Switch, type JSX} from 'solid-js'
import type {ToolCardProps} from '@conciv/protocol/tool-view-types'
import {DANGER_TEXT_CLASS} from '@conciv/ui-kit-chat'
import {
  CardShell,
  ChipRow,
  cardErrorMessage,
  cardHeader,
  detailChips,
  elementTargetValue,
  resultChips,
  toolInput,
} from './shared.js'

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
        <ChipRow element={element()} chips={extraChips()} />
        <Switch>
          <Match when={errorMessage()}>{(message) => <p class={DANGER_TEXT_CLASS}>{message()}</p>}</Match>
          <Match when={values().length > 0}>
            <ChipRow chips={values()} />
          </Match>
        </Switch>
      </div>
    </CardShell>
  )
}
