import {For, Match, Show, Switch, type JSX} from 'solid-js'
import {z} from 'zod'
import Clapperboard from 'lucide-solid/icons/clapperboard'
import type {ToolCardProps, ToolCardView} from '@conciv/protocol/tool-view-types'
import {TruncatedText} from '@conciv/ui-kit-system'
import {Chip, ErrorBlock, parseInput, parseResultPayload, resultText, ToolCard} from '@conciv/ui-kit-chat/tools'
import {cardErrorMessage, countLabel} from '../page/cards/shared.js'

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
  | {kind: 'failed'; message: string}
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

function readRecording(result: ToolCardProps['result']): Recording {
  const message = cardErrorMessage(result)
  if (message !== undefined) return {kind: 'failed', message}
  const text = resultText(result)
  if (!text) return {kind: 'running'}
  const payload = parseResultPayload(result)
  const started = StartedSchema.safeParse(payload)
  if (started.success) return {kind: 'started', captureId: started.data.captureId}
  return readWindow(payload, text)
}

function summarize(part: ToolCardProps['part'], recording: Recording): string | undefined {
  if (recording.kind === 'started') return 'capture started'
  if (recording.kind !== 'window') return undefined
  const seconds = parseInput(SecondsInput, part)?.secondsBack
  const window = seconds === undefined ? [] : [`last ${seconds}s`]
  const actions = countLabel(recording.actions.length, 'action', 'actions')
  const keyframes = countLabel(recording.keyframes, 'keyframe', 'keyframes')
  return [...window, actions, keyframes].join(' · ')
}

function RecorderIcon(): JSX.Element {
  return <Clapperboard size={14} aria-hidden="true" />
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

function RecordingCard(props: ToolCardProps): JSX.Element {
  const recording = () => readRecording(props.result)
  return (
    <ToolCard
      Icon={RecorderIcon}
      title={props.part.name}
      subtitle={summarize(props.part, recording())}
      part={props.part}
      result={props.result}
      durationMs={props.durationMs}
    >
      <Switch>
        <Match when={recording().kind === 'running'}>
          <span class={QUIET_CLASS}>recording…</span>
        </Match>
        <Match when={readFailure(recording())}>
          {(message) => <ErrorBlock message={message()} outcome={props.result?.outcome} />}
        </Match>
        <Match when={readCaptureId(recording())}>
          {(captureId) => <span class={`${QUIET_CLASS} font-chat-mono`}>{captureId()}</span>}
        </Match>
        <Match when={readActions(recording())}>{(actions) => <ActionList actions={actions()} />}</Match>
      </Switch>
    </ToolCard>
  )
}

export const recordingCard: ToolCardView = {render: RecordingCard, hasEmbeddedBody: () => true}

function readFailure(recording: Recording): string | undefined {
  return recording.kind === 'failed' ? recording.message : undefined
}

function readCaptureId(recording: Recording): string | undefined {
  return recording.kind === 'started' ? recording.captureId : undefined
}

function readActions(recording: Recording): RecordingAction[] | undefined {
  return recording.kind === 'window' ? recording.actions : undefined
}
