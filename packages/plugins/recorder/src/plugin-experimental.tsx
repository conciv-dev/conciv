import {For, Match, Show, Switch, type JSX} from 'solid-js'
import {z} from 'zod'
import {Panel, ToolRegistry, type PanelTab, type Plugin, type ToolComponent} from '@conciv/plugin/experimental'
import {defineInternalPlugin, NoteCard, type InternalUi} from '@conciv/plugin-internal'
import {bootCapture} from './page-capture.js'
import {RecorderPanel} from './panel-view.js'
import {RecordingCard} from './recording-card.js'
import {makePluginRuntime, runInOwnerScope, subscriptionRefSignal} from './subscription-ref-signal.js'

const RECORDING_TOOLS = ['recording_start', 'recording_stop', 'recording_pull'] as const

const ImagePartSchema = z.object({type: z.literal('image')}).loose()

const TextPartSchema = z.object({type: z.literal('text'), content: z.string()}).loose()

const RecordingPartsSchema = z.array(z.unknown())

const StartedSchema = z.object({captureId: z.string()}).loose()

const SecondsInput = z.object({secondsBack: z.number()}).loose()

const ACTION_LINE = /^\+(\d+(?:\.\d+)?)s \[(\w+)\] (.*)$/

const QUIET_CLASS = 'text-chat-xs text-chat-text-3'

const PLURAL_RULES = new Intl.PluralRules('en')

type RecordingAction = {at: string; kind: string; detail: string}

type Recording =
  | {kind: 'running'}
  | {kind: 'started'; captureId: string}
  | {kind: 'window'; actions: RecordingAction[]; keyframes: number}

function countLabel(count: number, one: string, other: string): string {
  return `${count} ${PLURAL_RULES.select(count) === 'one' ? one : other}`
}

function parseOutput(output: string): unknown {
  try {
    return JSON.parse(output)
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

function summarizeWindow(input: Record<string, unknown>, actions: number, keyframes: number): string {
  const seconds = SecondsInput.safeParse(input).data?.secondsBack
  const window = seconds === undefined ? [] : [`last ${seconds}s`]
  return [...window, countLabel(actions, 'action', 'actions'), countLabel(keyframes, 'keyframe', 'keyframes')].join(
    ' · ',
  )
}

function summarize(input: Record<string, unknown>, recording: Recording): string | undefined {
  if (recording.kind === 'started') return 'capture started'
  if (recording.kind === 'running') return undefined
  return summarizeWindow(input, recording.actions.length, recording.keyframes)
}

function readCaptureId(recording: Recording): string | undefined {
  return recording.kind === 'started' ? recording.captureId : undefined
}

function readActions(recording: Recording): RecordingAction[] | undefined {
  return recording.kind === 'window' ? recording.actions : undefined
}

function ActionList(props: {ui: InternalUi; actions: RecordingAction[]}): JSX.Element {
  return (
    <Show when={props.actions.length > 0} fallback={<span class={QUIET_CLASS}>no recorded activity</span>}>
      <div class="flex flex-col gap-0.5">
        <For each={props.actions}>
          {(action) => (
            <div class="text-chat-xs leading-[var(--chat-trace-gutter)] font-chat-mono flex gap-2 min-w-0 items-center">
              <span class="text-chat-text-3 flex-none tabular-nums">{action.at}</span>
              <props.ui.Chip value={action.kind} compact />
              <props.ui.TruncatedText class="text-chat-text-2 flex-1 min-w-0" text={action.detail} />
            </div>
          )}
        </For>
      </div>
    </Show>
  )
}

function recordingToolCard(ui: InternalUi): ToolComponent {
  return (props) => {
    const recording = () => readRecording(props.output)
    return (
      <ui.BasicTool
        {...props}
        title={props.tool}
        subtitle={summarize(props.input, recording())}
        expandable
        openWhileRunning
      >
        <Switch>
          <Match when={recording().kind === 'running'}>
            <span class={QUIET_CLASS}>recording…</span>
          </Match>
          <Match when={readCaptureId(recording())}>
            {(captureId) => <span class={`${QUIET_CLASS} font-chat-mono`}>{captureId()}</span>}
          </Match>
          <Match when={readActions(recording())}>{(actions) => <ActionList ui={ui} actions={actions()} />}</Match>
        </Switch>
      </ui.BasicTool>
    )
  }
}

const recorder: Plugin.Definition = defineInternalPlugin({
  setup(ctx) {
    const recorderTab: PanelTab = {
      id: 'recorder',
      title: 'Recorder',
      pinned: true,
      label: () => (
        <>
          <ctx.ui.Icon name="clapperboard" size="small" />
          Recorder
        </>
      ),
    }
    const runtime = makePluginRuntime()
    const clientId = crypto.randomUUID()
    const capture = runInOwnerScope(runtime, bootCapture(ctx, runtime, clientId))
    const boot = subscriptionRefSignal(runtime, capture.boot)
    const captureFailed = () => boot().status === 'failed'
    ctx.add(Panel, {
      id: recorderTab.id,
      region: 'pane',
      list: () => [recorderTab],
      render: (host) => (
        <RecorderPanel
          clientId={clientId}
          runtime={runtime}
          captureFailed={captureFailed}
          flushNow={capture.flushNow}
          host={host}
        />
      ),
    })
    ctx.add(NoteCard, {
      origins: [ctx.id],
      render: (props) => <RecordingCard note={props.note} session={props.session} runtime={runtime} />,
    })
    const render = recordingToolCard(ctx.ui)
    RECORDING_TOOLS.forEach((name) => ctx.add(ToolRegistry, {name, render}))
  },
})

export default recorder
