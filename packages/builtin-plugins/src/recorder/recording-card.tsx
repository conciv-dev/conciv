import {For, Match, Show, Switch, type JSX} from 'solid-js'
import {z} from 'zod'
import type {ToolComponent, ToolProps} from '@conciv/plugin/experimental'
import {TruncatedText} from '@conciv/ui-kit-system'
import {BasicTool, Chip, ErrorBlock} from '@conciv/ui-kit-chat/tools'
import {countLabel} from '../page/cards/shared.js'
import {parseOutput, readInput} from '../tanstack/card-shared.js'

const ImagePartSchema = z.object({type: z.literal('image')}).loose()

const TextPartSchema = z.object({type: z.literal('text'), content: z.string()}).loose()

const RecordingPartsSchema = z.array(z.unknown())

const StartedSchema = z.object({captureId: z.string()}).loose()

const SecondsInput = z.object({secondsBack: z.number()}).loose()

const ACTION_LINE = /^\+(\d+(?:\.\d+)?)s \[(\w+)\] (.*)$/

const QUIET_CLASS = 'text-chat-xs text-chat-text-3'

type RecordingAction = {at: string; kind: string; detail: string}

type Recording =
  | {kind: 'running'}
  | {kind: 'started'; captureId: string}
  | {kind: 'window'; actions: RecordingAction[]; keyframes: number}

function parseActions(log: string): RecordingAction[] {
  return log.split('\n').flatMap((line) => {
    const match = ACTION_LINE.exec(line)
    return match ? [{at: `+${match[1]}s`, kind: match[2] ?? '', detail: match[3] ?? ''}] : []
  })
}

function readWindow(payload: unknown, text: string): Recording {
  const parts = RecordingPartsSchema.safeParse(payload)
  if (!parts.success)
    return {kind: 'window', actions: parseActions(typeof payload === 'string' ? payload : text), keyframes: 0}
  const keyframes = parts.data.filter((part) => ImagePartSchema.safeParse(part).success).length
  const log = parts.data.flatMap((part) => {
    const parsed = TextPartSchema.safeParse(part)
    return parsed.success ? [parsed.data.content] : []
  })
  return {kind: 'window', actions: parseActions(log.join('\n')), keyframes}
}

function readRecording(output: string | undefined): Recording {
  if (!output) return {kind: 'running'}
  const payload = parseOutput(output) ?? output
  const started = StartedSchema.safeParse(payload)
  if (started.success) return {kind: 'started', captureId: started.data.captureId}
  return readWindow(payload, output)
}

function summarize(input: Record<string, unknown>, recording: Recording): string | undefined {
  if (recording.kind === 'started') return 'capture started'
  if (recording.kind !== 'window') return undefined
  const seconds = readInput(SecondsInput, input)?.secondsBack
  const window = seconds === undefined ? [] : [`last ${seconds}s`]
  const actions = countLabel(recording.actions.length, 'action', 'actions')
  const keyframes = countLabel(recording.keyframes, 'keyframe', 'keyframes')
  return [...window, actions, keyframes].join(' · ')
}

function ActionList(props: {actions: RecordingAction[]}): JSX.Element {
  return (
    <Show when={props.actions.length > 0} fallback={<span class={QUIET_CLASS}>no recorded activity</span>}>
      <div class="flex flex-col gap-0.5">
        <For each={props.actions}>
          {(action) => (
            <div class="text-chat-xs leading-[var(--chat-trace-gutter)] font-chat-mono flex gap-2 min-w-0 items-center">
              <span class="text-chat-text-3 flex-none tabular-nums">{action.at}</span>
              <Chip kind="pill" value={action.kind} />
              <TruncatedText class="text-chat-text-2 flex-1 min-w-0" text={action.detail} />
            </div>
          )}
        </For>
      </div>
    </Show>
  )
}

function RecordingCard(props: ToolProps): JSX.Element {
  const recording = () => readRecording(props.output)
  return (
    <BasicTool
      {...props}
      trigger={{title: props.tool, subtitle: summarize(props.input, recording())}}
      hasContent={true}
      allowOpenWhilePending={true}
    >
      <Switch>
        <Match when={recording().kind === 'running'}>
          <span class={QUIET_CLASS}>recording…</span>
        </Match>
        <Match when={readCaptureId(recording())}>
          {(captureId) => <span class={`${QUIET_CLASS} font-chat-mono`}>{captureId()}</span>}
        </Match>
        <Match when={readActions(recording())}>{(actions) => <ActionList actions={actions()} />}</Match>
      </Switch>
    </BasicTool>
  )
}

function RecordingFailedCard(props: ToolProps): JSX.Element {
  return (
    <BasicTool {...props} status="error" trigger={{title: props.tool}} hasContent={true}>
      <ErrorBlock message={props.error ?? ''} />
    </BasicTool>
  )
}

export const recordingCard: ToolComponent = RecordingCard

export const recordingFailedCard: ToolComponent = RecordingFailedCard

function readCaptureId(recording: Recording): string | undefined {
  return recording.kind === 'started' ? recording.captureId : undefined
}

function readActions(recording: Recording): RecordingAction[] | undefined {
  return recording.kind === 'window' ? recording.actions : undefined
}
