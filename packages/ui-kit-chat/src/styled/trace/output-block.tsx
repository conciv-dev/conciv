import {Show, splitProps, type JSX} from 'solid-js'
import {TooltipIconButton} from '@conciv/ui-kit-system'
import Maximize2 from 'lucide-solid/icons/maximize-2'
import {TraceClamp, type TraceClampSize} from './clamp.js'
import {CodeFrame, CodeHeader} from '../../tools/styled/code-block.js'

export type TraceOutputTone = 'normal' | 'error'

const FRAME = 'relative min-w-0 rounded-chat-sm px-2.5 py-2 [background:var(--chat-frame-bg)]'
const FRAME_TONE: Record<TraceOutputTone, string> = {
  normal: '[border:1px_solid_var(--chat-frame-line)] text-chat-frame-text',
  error: '[border:1px_solid_var(--chat-frame-line-error)] text-chat-frame-text-error',
}
const YIELD_TO_CODE =
  '[&:has([data-code-surface])]:[border-color:transparent] [&:has([data-code-surface])]:[background:transparent] [&:has([data-code-surface])]:p-0'
const CONTENT =
  'min-w-0 overflow-x-auto whitespace-pre-wrap px-2.5 py-2 text-chat-xs leading-[var(--chat-trace-gutter)] [font-family:var(--chat-mono)] text-chat-frame-text'
const ACTION_BUTTON = 'size-6 shrink-0'

const TONE_NAME: Record<TraceOutputTone, string> = {normal: 'Output', error: 'Error output'}

const BODY_CONTENT = 'min-w-0 flex flex-col gap-1.5 text-chat-sm'

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
  const shell = () =>
    local.chrome === false ? BARE_FRAME : `${FRAME}  ${FRAME_TONE[local.tone ?? 'normal']}  ${YIELD_TO_CODE}`
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
  text: string
  tone?: TraceOutputTone
  label?: string
  openLabel?: string
  lines?: number
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
    'overflowLabel',
    'onOpen',
    'writeText',
  ])
  const tone = (): TraceOutputTone => local.tone ?? 'normal'
  const label = () => local.label ?? TONE_NAME[tone()]
  const openAction = (): JSX.Element => (
    <Show when={local.onOpen}>
      {(onOpen) => (
        <TooltipIconButton tooltip={local.openLabel ?? 'Open'} class={ACTION_BUTTON} onClick={() => onOpen()()}>
          <Maximize2 class="size-3.5" aria-hidden="true" />
        </TooltipIconButton>
      )}
    </Show>
  )
  return (
    <CodeFrame
      label={label()}
      text={local.text}
      lines={local.lines}
      overflowLabel={local.overflowLabel}
      cap="result"
      headed
      tone={tone()}
      copy={{labels: COPY_LABELS, resetMs: COPY_RESET_MS, writeText: local.writeText}}
      extraActions={openAction()}
    >
      {(actions) => (
        <>
          <CodeHeader title={label()} tone={tone()}>
            {actions()}
          </CodeHeader>
          <div class={CONTENT}>{local.children}</div>
        </>
      )}
    </CodeFrame>
  )
}
