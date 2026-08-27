import {Show, splitProps, type JSX} from 'solid-js'
import {ClipboardCopyButton, TooltipIconButton} from '@conciv/ui-kit-system'
import Maximize2 from 'lucide-solid/icons/maximize-2'
import {TraceClamp, type TraceClampSize} from './clamp.js'

export type TraceOutputTone = 'normal' | 'error'

const FRAME = 'relative min-w-0 rounded-[var(--chat-radius-sm)] px-2.5 py-1.75 [background:var(--chat-frame-bg)]'
const FRAME_TONE: Record<TraceOutputTone, string> = {
  normal: '[border:1px_solid_var(--chat-frame-line)] text-chat-frame-text',
  error: '[border:1px_solid_var(--chat-frame-line-error)] text-chat-frame-text-error',
}
const CONTENT =
  'min-w-0 overflow-x-auto whitespace-pre-wrap text-[length:var(--chat-text-xs)] leading-[var(--chat-trace-gutter)] [font-family:var(--chat-mono)]'
const CHROME_ROW = 'flex gap-0.5 items-center justify-end min-w-0'
const ACTION_BUTTON = 'size-6 shrink-0'

const TONE_NAME: Record<TraceOutputTone, string> = {normal: 'Output', error: 'Error output'}

const BODY_CONTENT = 'min-w-0 flex flex-col gap-1.5 text-[length:var(--chat-text-sm)]'

const BARE_FRAME = 'relative min-w-0'

export function TraceBodyFrame(props: {
  children: JSX.Element
  tone?: TraceOutputTone
  live?: boolean
  chrome?: boolean
  size?: TraceClampSize
  overflowLabel?: (hiddenLines: number) => string
}): JSX.Element {
  const [local] = splitProps(props, ['children', 'tone', 'live', 'chrome', 'size', 'overflowLabel'])
  const shell = () => (local.chrome === false ? BARE_FRAME : `${FRAME}  ${FRAME_TONE[local.tone ?? 'normal']}`)
  return (
    <div class={shell()}>
      <TraceClamp live={local.live} size={local.size} overflowLabel={local.overflowLabel}>
        <div class={BODY_CONTENT}>{local.children}</div>
      </TraceClamp>
    </div>
  )
}

const COPY_RESET_MS = 3000

const COPY_LABELS = {copied: 'Copied the output', failed: 'Could not copy the output'}

export function TraceOutputBlock(props: {
  children: JSX.Element
  text?: string
  tone?: TraceOutputTone
  label?: string
  openLabel?: string
  lines?: number
  live?: boolean
  size?: TraceClampSize
  overflowLabel?: (hiddenLines: number) => string
  onOpen?: () => void
  writeText?: (text: string) => Promise<void>
}): JSX.Element {
  const [local] = splitProps(props, [
    'children',
    'text',
    'tone',
    'label',
    'openLabel',
    'lines',
    'live',
    'size',
    'overflowLabel',
    'onOpen',
    'writeText',
  ])
  const tone = (): TraceOutputTone => local.tone ?? 'normal'
  const hasActions = () => local.text !== undefined || local.onOpen !== undefined
  return (
    <div class={`${FRAME}  ${FRAME_TONE[tone()]}`} role="group" aria-label={local.label ?? TONE_NAME[tone()]}>
      <Show when={hasActions()}>
        <div class={CHROME_ROW}>
          <Show when={local.text !== undefined}>
            <ClipboardCopyButton
              text={local.text ?? ''}
              resetMs={COPY_RESET_MS}
              labels={COPY_LABELS}
              class={ACTION_BUTTON}
              writeText={local.writeText}
            />
          </Show>
          <Show when={local.onOpen}>
            {(onOpen) => (
              <TooltipIconButton tooltip={local.openLabel ?? 'Open'} class={ACTION_BUTTON} onClick={() => onOpen()()}>
                <Maximize2 class="size-3.5 block" aria-hidden="true" />
              </TooltipIconButton>
            )}
          </Show>
        </div>
      </Show>
      <TraceClamp
        live={local.live}
        size={local.size}
        lines={local.lines ?? (local.text === undefined ? undefined : local.text.split('\n').length)}
        overflowLabel={local.overflowLabel}
      >
        <div class={CONTENT}>{local.children}</div>
      </TraceClamp>
    </div>
  )
}
