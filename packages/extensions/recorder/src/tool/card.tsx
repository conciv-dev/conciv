import {For, Show, type JSX} from 'solid-js'
import {z} from 'zod'
import {Clapperboard} from 'lucide-solid'
import type {ToolCardProps} from '@conciv/protocol/tool-view-types'
import {Chip, ErrorBlock, parseInput, resultText, ToolCard} from '@conciv/ui-kit-chat/tools'
const ImagePartSchema = z.object({type: z.literal('image')}).loose()
const TextPartSchema = z.object({type: z.literal('text'), content: z.string()}).loose()
const StartDetailSchema = z.object({captureId: z.string()}).loose()
const ErrorDetailSchema = z.object({error: z.string()}).loose()
const SecondsInput = z.object({secondsBack: z.number()}).loose()

const ACTION_LINE = /^\+(\d+(?:\.\d+)?)s \[(\w+)\] (.*)$/

type RecordingAction = {at: string; kind: string; detail: string}

type Recording = {actions: RecordingAction[]; keyframes: number; captureId: string | null; error: string | null}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return undefined
  }
}

function parseActions(log: string): RecordingAction[] {
  return log.split('\n').flatMap((line) => {
    const match = ACTION_LINE.exec(line)
    return match ? [{at: `+${match[1]}s`, kind: match[2] ?? '', detail: match[3] ?? ''}] : []
  })
}

function parseRecording(result: ToolCardProps['result']): Recording {
  const empty: Recording = {actions: [], keyframes: 0, captureId: null, error: null}
  const text = resultText(result)
  if (!text) return empty
  const raw = parseJson(text)
  if (Array.isArray(raw)) {
    const keyframes = raw.filter((part) => ImagePartSchema.safeParse(part).success).length
    const log = raw.flatMap((part) => {
      const parsed = TextPartSchema.safeParse(part)
      return parsed.success ? [parsed.data.content] : []
    })
    return {...empty, actions: parseActions(log.join('\n')), keyframes}
  }
  const started = StartDetailSchema.safeParse(raw)
  if (started.success) return {...empty, captureId: started.data.captureId}
  const failed = ErrorDetailSchema.safeParse(raw)
  if (failed.success) return {...empty, error: failed.data.error}
  return {...empty, actions: parseActions(text)}
}

function summarize(props: ToolCardProps, recording: Recording): string {
  if (recording.captureId) return 'capture started'
  const seconds = parseInput(SecondsInput, props.part)?.secondsBack
  const window = seconds === undefined ? [] : [`last ${seconds}s`]
  const actions = `${recording.actions.length} action${recording.actions.length === 1 ? '' : 's'}`
  const keyframes = `${recording.keyframes} keyframe${recording.keyframes === 1 ? '' : 's'}`
  return [...window, actions, keyframes].join(' · ')
}

function RecorderIcon(): JSX.Element {
  return <Clapperboard size={14} />
}

export function RecordingToolCard(props: ToolCardProps): JSX.Element {
  const recording = () => parseRecording(props.result)
  const settled = () => Boolean(resultText(props.result))
  return (
    <ToolCard
      Icon={RecorderIcon}
      title={props.part.name}
      subtitle={settled() ? summarize(props, recording()) : undefined}
      part={props.part}
      result={props.result}
      status={recording().error ? 'error' : undefined}
    >
      <Show when={recording().error}>{(error) => <ErrorBlock message={error()} />}</Show>
      <Show when={!recording().error && recording().actions.length > 0}>
        <div class="flex flex-col gap-0.5">
          <For each={recording().actions}>
            {(action) => (
              <div class="text-[length:var(--chat-text-xs)] flex gap-2 [font-family:var(--chat-mono)] items-baseline">
                <span class="shrink-0 [color:var(--chat-text-3)] tabular-nums">{action.at}</span>
                <Chip kind="pill" value={action.kind} />
                <span class="min-w-0 truncate [color:var(--chat-text-2)]">{action.detail}</span>
              </div>
            )}
          </For>
        </div>
      </Show>
      <Show when={!recording().error && settled() && recording().actions.length === 0 && !recording().captureId}>
        <span class="text-[length:var(--chat-text-xs)] [color:var(--chat-text-3)]">no recorded activity</span>
      </Show>
      <Show when={recording().captureId}>
        {(captureId) => (
          <span class="text-[length:var(--chat-text-xs)] [color:var(--chat-text-3)] [font-family:var(--chat-mono)]">
            {captureId()}
          </span>
        )}
      </Show>
    </ToolCard>
  )
}
