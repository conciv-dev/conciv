import {createSignal, Show, splitProps, type JSX} from 'solid-js'
import {createTimer} from '@solid-primitives/timer'
import {Button} from '@conciv/ui-kit-system'
import {FOCUS} from '../classes.js'
import {TraceClamp, type TraceClampSize} from './clamp.js'

export type TraceOutputTone = 'normal' | 'error'

const FRAME =
  'relative group/output min-w-0 rounded-[var(--chat-radius-sm)] px-2.5 py-[7px] [background:var(--chat-frame-bg)]'
const FRAME_TONE: Record<TraceOutputTone, string> = {
  normal: '[border:1px_solid_var(--chat-frame-line)] text-chat-frame-text',
  error: '[border:1px_solid_var(--chat-frame-line-error)] text-chat-frame-text-error',
}
const CONTENT = 'min-w-0 overflow-x-auto whitespace-pre-wrap text-[11px] leading-[1.65] [font-family:var(--chat-mono)]'
const ACTIONS =
  'absolute top-1 end-1 z-1 flex gap-1 opacity-0 [transition:opacity_110ms_var(--chat-ease)] group-hover/output:opacity-100 group-focus-within/output:opacity-100 motion-reduce:[transition:none]'
const ACTION_BUTTON = `inline-flex items-center justify-center min-h-6 px-[7px] rounded-[var(--chat-radius-chip)] text-[10.5px] font-medium leading-none cursor-pointer [font-family:var(--chat-font)] [background:transparent] [border:1px_solid_transparent] text-chat-dim hover:[background:var(--chat-rail-bg)] hover:[border-color:var(--chat-line)] hover:text-chat-text-hi [transition:color_120ms_var(--chat-ease),background-color_120ms_var(--chat-ease),border-color_120ms_var(--chat-ease)] motion-reduce:[transition:none] ${FOCUS}`

const TONE_NAME: Record<TraceOutputTone, string> = {normal: 'Output', error: 'Error output'}

const BODY_CONTENT = 'min-w-0 flex flex-col gap-1.5 text-[length:var(--chat-text-sm)]'

export function TraceBodyFrame(props: {
  children: JSX.Element
  live?: boolean
  size?: TraceClampSize
  overflowLabel?: (hiddenLines: number) => string
}): JSX.Element {
  const [local] = splitProps(props, ['children', 'live', 'size', 'overflowLabel'])
  return (
    <div class={`${FRAME}  ${FRAME_TONE.normal}`}>
      <TraceClamp live={local.live} size={local.size} overflowLabel={local.overflowLabel}>
        <div class={BODY_CONTENT}>{local.children}</div>
      </TraceClamp>
    </div>
  )
}

const COPY_RESET_MS = 3000

type CopyState = 'idle' | 'copied' | 'failed'

const COPY_MESSAGE: Record<CopyState, string> = {
  idle: '',
  copied: 'Copied the output',
  failed: 'Could not copy the output',
}

function writeToClipboard(text: string): Promise<void> {
  return navigator.clipboard.writeText(text)
}

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
  const [copyState, setCopyState] = createSignal<CopyState>('idle')
  const tone = (): TraceOutputTone => local.tone ?? 'normal'
  createTimer(
    () => setCopyState('idle'),
    () => (copyState() === 'idle' ? false : COPY_RESET_MS),
    setTimeout,
  )
  const settle = (state: CopyState) => setCopyState(state)
  const copy = () => {
    const write = local.writeText ?? writeToClipboard
    write(local.text ?? '').then(
      () => settle('copied'),
      () => settle('failed'),
    )
  }
  return (
    <div class={`${FRAME}  ${FRAME_TONE[tone()]}`} role="group" aria-label={local.label ?? TONE_NAME[tone()]}>
      <div class={ACTIONS}>
        <Show when={local.text !== undefined}>
          <Button variant="plain" size="none" class={ACTION_BUTTON} onClick={copy}>
            Copy
          </Button>
        </Show>
        <Show when={local.onOpen}>
          {(onOpen) => (
            <Button variant="plain" size="none" class={ACTION_BUTTON} onClick={() => onOpen()()}>
              {local.openLabel ?? 'Open'}
            </Button>
          )}
        </Show>
      </div>
      <TraceClamp
        live={local.live}
        size={local.size}
        lines={local.lines ?? (local.text === undefined ? undefined : local.text.split('\n').length)}
        overflowLabel={local.overflowLabel}
      >
        <div class={CONTENT}>{local.children}</div>
      </TraceClamp>
      <p role="status" aria-live="polite" class="sr-only">
        {COPY_MESSAGE[copyState()]}
      </p>
    </div>
  )
}
