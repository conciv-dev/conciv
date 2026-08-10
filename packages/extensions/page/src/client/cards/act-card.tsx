import {Show, type JSX} from 'solid-js'
import type {ToolCardProps} from '@conciv/protocol/tool-view-types'
import {CardShell, ElementPreview, ErrorBlock, MirrorRow, cardHeader, detailChips} from '@conciv/ui-kit-chat/tools'
import {ChipRow, ELEMENT_TARGET_KEYS, cardErrorMessage, elementTargetValue, mutatingBadge, toolInput} from './shared.js'

export function ActCard(props: ToolCardProps): JSX.Element {
  const {meta, title} = cardHeader(props)
  const input = () => toolInput(props.part)
  const chips = () => detailChips(meta(), input(), ELEMENT_TARGET_KEYS)
  const capture = () => props.capture?.after
  const element = () => (capture() === undefined ? elementTargetValue(input()) : undefined)
  const errorMessage = () => cardErrorMessage(props.result)
  return (
    <CardShell
      meta={meta()}
      title={title()}
      metaBadge={mutatingBadge(meta())}
      part={props.part}
      result={props.result}
      durationMs={props.durationMs}
    >
      <div class="flex flex-col gap-1.5">
        <Show when={capture()}>
          {(value) => (
            <ElementPreview.Root capture={value()} css={props.capture?.css}>
              <ElementPreview.Frame />
              <ElementPreview.Descriptor />
            </ElementPreview.Root>
          )}
        </Show>
        <ChipRow element={element()} chips={chips()} />
        <Show when={meta()?.mirrors === true}>
          <MirrorRow />
        </Show>
        <Show when={errorMessage()}>{(message) => <ErrorBlock message={message()} />}</Show>
      </div>
    </CardShell>
  )
}
