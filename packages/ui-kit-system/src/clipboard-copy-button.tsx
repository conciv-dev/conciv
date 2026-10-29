import {Show, splitProps, type JSX} from 'solid-js'
import Check from 'lucide-solid/icons/check'
import Copy from 'lucide-solid/icons/copy'
import TriangleAlert from 'lucide-solid/icons/triangle-alert'
import {createClipboardCopy, writeClipboardText, type ClipboardCopyLabels} from './clipboard.js'
import {Swap} from './swap.js'
import {TooltipIconButton, type TooltipIconButtonSide, type TooltipIconButtonVariant} from './tooltip-icon-button.js'

export type ClipboardCopyTooltips = {idle: string; copied: string; failed: string}

const DEFAULT_TOOLTIPS: ClipboardCopyTooltips = {idle: 'Copy', copied: 'Copied', failed: 'Copy failed'}

const ICON = 'size-3.5 block'

export type ClipboardCopyButtonProps = {
  text: string
  tooltips?: Partial<ClipboardCopyTooltips>
  labels?: Partial<ClipboardCopyLabels>
  resetMs?: number
  side?: TooltipIconButtonSide
  variant?: TooltipIconButtonVariant
  class?: string
  disabled?: boolean
  writeText?: (text: string) => Promise<void>
  onCopied?: () => void
  onFailed?: () => void
}

export function ClipboardCopyButton(props: ClipboardCopyButtonProps): JSX.Element {
  const [local] = splitProps(props, [
    'text',
    'tooltips',
    'labels',
    'resetMs',
    'side',
    'variant',
    'class',
    'disabled',
    'writeText',
    'onCopied',
    'onFailed',
  ])
  const clipboard = createClipboardCopy({
    text: () => local.text,
    resetMs: () => local.resetMs,
    labels: () => local.labels,
    writeText: (text) => (local.writeText ?? writeClipboardText)(text),
    onCopied: () => local.onCopied?.(),
    onFailed: () => local.onFailed?.(),
  })
  const tooltip = () => {
    const tooltips = {...DEFAULT_TOOLTIPS, ...local.tooltips}
    if (clipboard.copied()) return tooltips.copied
    return clipboard.failed() ? tooltips.failed : tooltips.idle
  }
  return (
    <>
      <TooltipIconButton
        tooltip={tooltip()}
        side={local.side}
        variant={local.variant}
        class={local.class ?? 'size-7'}
        disabled={local.disabled}
        data-copied={clipboard.copied() ? '' : undefined}
        data-copy-failed={clipboard.failed() ? '' : undefined}
        onClick={clipboard.copy}
      >
        <Swap.Root swap={clipboard.status() !== 'idle'}>
          <Swap.Indicator type="on">
            <Show when={clipboard.failed()} fallback={<Check class={`${ICON} text-chat-accent`} aria-hidden="true" />}>
              <TriangleAlert class={`${ICON} text-chat-danger`} aria-hidden="true" />
            </Show>
          </Swap.Indicator>
          <Swap.Indicator type="off">
            <Copy class={ICON} aria-hidden="true" />
          </Swap.Indicator>
        </Swap.Root>
      </TooltipIconButton>
      <span role="status" aria-live="polite" class="sr-only">
        {clipboard.announcement()}
      </span>
    </>
  )
}
