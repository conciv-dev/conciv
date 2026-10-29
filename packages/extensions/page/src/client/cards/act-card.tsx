import {Show, type JSX} from 'solid-js'
import type {ToolCardProps, ToolCardView} from '@conciv/protocol/tool-view-types'
import {CardShell, ElementPreview, ErrorBlock, MirrorRow, cardHeader} from '@conciv/ui-kit-chat/tools'
import {ELEMENT_TARGET_KEYS, cardErrorMessage, elementChip, mutatingBadge} from './shared.js'

export function ActCard(props: ToolCardProps): JSX.Element {
  const {meta, title} = cardHeader(props)
  const capture = () => props.capture?.after
  const element = () => (capture() === undefined ? elementChip(props.part) : undefined)
  const errorMessage = () => cardErrorMessage(props.result)
  return (
    <CardShell
      meta={meta()}
      title={title()}
      metaBadge={mutatingBadge(meta())}
      part={props.part}
      result={props.result}
      durationMs={props.durationMs}
      chipSkip={ELEMENT_TARGET_KEYS}
      leadChip={element()}
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
        <Show when={meta()?.mirrors === true}>
          <MirrorRow />
        </Show>
        <Show when={errorMessage()}>{(message) => <ErrorBlock message={message()} />}</Show>
      </div>
    </CardShell>
  )
}

export const actCard: ToolCardView = {
  render: ActCard,
  hasEmbeddedBody: (part, result, ctx) =>
    ctx.captureFor?.(part.id)?.after !== undefined ||
    ctx.catalog.meta(part.name)?.mirrors === true ||
    cardErrorMessage(result) !== undefined,
}
