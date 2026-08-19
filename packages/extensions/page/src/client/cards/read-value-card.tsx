import {Match, Switch, type JSX} from 'solid-js'
import type {ToolCardProps} from '@conciv/protocol/tool-view-types'
import {CardShell, ErrorBlock, JsonTree, cardHeader} from '@conciv/ui-kit-chat/tools'
import {ChipRow, ELEMENT_TARGET_KEYS, cardErrorMessage, cardPayload, elementChip, resultChips} from './shared.js'

function payloadHasNestedValue(payload: unknown): boolean {
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) return false
  return Object.values(payload as Record<string, unknown>).some((value) => typeof value === 'object' && value !== null)
}

export function ReadValueCard(props: ToolCardProps): JSX.Element {
  const {meta, title} = cardHeader(props)
  const payload = () => cardPayload(props.result)
  const nested = () => payloadHasNestedValue(payload())
  const values = () => resultChips(props.result)
  const errorMessage = () => cardErrorMessage(props.result)
  return (
    <CardShell
      meta={meta()}
      title={title()}
      part={props.part}
      result={props.result}
      durationMs={props.durationMs}
      chipSkip={ELEMENT_TARGET_KEYS}
      leadChip={elementChip(props.part)}
    >
      <div class="flex flex-col gap-1.5">
        <Switch>
          <Match when={errorMessage()}>{(message) => <ErrorBlock message={message()} />}</Match>
          <Match when={nested()}>
            <JsonTree data={payload()} />
          </Match>
          <Match when={values().length > 0}>
            <ChipRow chips={values()} />
          </Match>
        </Switch>
      </div>
    </CardShell>
  )
}
