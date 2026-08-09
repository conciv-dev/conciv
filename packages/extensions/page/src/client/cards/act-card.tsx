import {For, Show, type JSX} from 'solid-js'
import {MoveUpRight} from 'lucide-solid'
import type {ToolCardProps} from '@conciv/protocol/tool-view-types'
import {Chip, DANGER_TEXT_CLASS, ElementPreview} from '@conciv/ui-kit-chat'
import {CardShell, cardErrorMessage, cardHeader, detailChips, elementTargetValue, toolInput} from './shared.js'

const MIRROR_ROW = 'text-[length:var(--chat-text-xs)] flex gap-1.5 items-center m-0 [color:var(--chat-accent-link)]'
const CHIP_ROW = 'm-0 p-0 flex flex-wrap gap-1.5'

export function ActCard(props: ToolCardProps): JSX.Element {
  const {meta, title} = cardHeader(props)
  const input = () => toolInput(props.part)
  const chips = () => detailChips(meta(), input())
  const capture = () => props.capture?.after
  const element = () => (capture() === undefined ? elementTargetValue(input()) : undefined)
  const errorMessage = () => cardErrorMessage(props.result)
  return (
    <CardShell
      meta={meta()}
      title={title()}
      metaBadge={meta()?.mutating === true ? 'writes' : undefined}
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
        <Show when={element() !== undefined || chips().length > 0}>
          <dl class={CHIP_ROW}>
            <Show when={element()}>{(value) => <Chip name="element" value={value()} />}</Show>
            <For each={chips()}>{(chip) => <Chip name={chip.name} value={chip.value} />}</For>
          </dl>
        </Show>
        <Show when={meta()?.mirrors === true}>
          <p class={MIRROR_ROW}>
            <MoveUpRight size={12} aria-hidden="true" />
            <span>shown on your page</span>
          </p>
        </Show>
        <Show when={errorMessage()}>{(message) => <p class={DANGER_TEXT_CLASS}>{message()}</p>}</Show>
      </div>
    </CardShell>
  )
}
