import {Match, Switch, type JSX} from 'solid-js'
import type {ToolCardProps, ToolCardView} from '@conciv/protocol/tool-view-types'
import {CardShell, ErrorBlock, JsonTree, ResultImage, cardHeader, parseResultMedia} from '@conciv/ui-kit-chat/tools'
import {ChipRow, ELEMENT_TARGET_KEYS, cardErrorMessage, cardPayload, elementChip, resultChips} from './shared.js'

function payloadIsStructured(payload: unknown): boolean {
  return typeof payload === 'object' && payload !== null
}

export function ReadValueCard(props: ToolCardProps): JSX.Element {
  const {meta, title} = cardHeader(props)
  const payload = () => cardPayload(props.result)
  const nested = () => payloadIsStructured(payload())
  const values = () => resultChips(props.result)
  const errorMessage = () => cardErrorMessage(props.result)
  const imageUrl = () => parseResultMedia(props.result).imageUrl
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
          <Match when={imageUrl()}>{(url) => <ResultImage src={url()} alt={title()} />}</Match>
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

export const readValueCard: ToolCardView = {
  render: ReadValueCard,
  hasEmbeddedBody: (_part, result) =>
    cardErrorMessage(result) !== undefined ||
    payloadIsStructured(cardPayload(result)) ||
    resultChips(result).length > 0,
}
