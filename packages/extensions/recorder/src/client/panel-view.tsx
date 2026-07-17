import {Show, createResource, createSignal, onCleanup, type Accessor, type JSX} from 'solid-js'
import {z} from 'zod'
import {getHostApi, makeExtRpcClient} from '@conciv/extension'
import {Button} from '@conciv/ui-kit-system'
import type {eventWithTime} from '@rrweb/types'
import playerCss from 'rrweb-player/dist/style.css?inline'
import rrwebCss from 'rrweb/dist/style.css?inline'
import themeCss from './player-theme.css?inline'
import Player from 'rrweb-player'
import {RECORDER_NAME, type ActionLogEntry, type RrwebEvent} from '../shared/protocol.js'
import type {RecorderRouter} from '../server.js'
import {computeIdleSpans, idleSpanAt} from './inactivity.js'
import {useRecorderContext} from './recorder-context.js'

const playerEvents = z.array(z.custom<eventWithTime>())
const metaSize = z.object({width: z.number(), height: z.number()})
const timePayload = z.number()

const FALLBACK_WIDTH = 620
const FALLBACK_ASPECT = 0.62
const PLAYER_CONTROLLER_HEIGHT = 80
const MIN_FRAME_HEIGHT = 120

function recordingWithEnoughEvents(recording: {events: RrwebEvent[]} | undefined): RrwebEvent[] | undefined {
  const events = recording?.events ?? []
  return events.length >= 2 ? events : undefined
}

function recordedAspect(events: RrwebEvent[]): number {
  const parsed = metaSize.safeParse(events.find((event) => event.type === 4)?.data)
  if (!parsed.success || parsed.data.width <= 0) return FALLBACK_ASPECT
  return parsed.data.height / parsed.data.width
}

function playerSize(container: HTMLDivElement, aspect: number): {width: number; height: number} {
  const availableWidth = container.clientWidth || FALLBACK_WIDTH
  const availableHeight = container.clientHeight || Math.round(availableWidth * aspect) + PLAYER_CONTROLLER_HEIGHT
  const frameBudget = Math.max(availableHeight - PLAYER_CONTROLLER_HEIGHT, MIN_FRAME_HEIGHT)
  const width = Math.min(availableWidth, Math.round(frameBudget / aspect))
  return {width, height: Math.round(width * aspect)}
}

function skipIdlePlayback(player: Player, events: RrwebEvent[], skipIdle: Accessor<boolean>): void {
  const spans = computeIdleSpans(events)
  if (!spans.length) return
  let playing = false
  player.addEventListener('ui-update-player-state', (payload) => {
    playing = payload === 'playing'
  })
  player.addEventListener('ui-update-current-time', (payload) => {
    if (!playing || !skipIdle()) return
    const parsed = timePayload.safeParse(payload)
    if (!parsed.success) return
    const span = idleSpanAt(spans, parsed.data)
    if (span) player.goto(span.endMs, true)
  })
}

function mountPlayer(container: HTMLDivElement, events: RrwebEvent[], skipIdle: Accessor<boolean>): () => void {
  const style = document.createElement('style')
  style.textContent = `@layer rrweb {\n${rrwebCss}\n${playerCss}\n}\n${themeCss}`
  container.appendChild(style)
  const aspect = recordedAspect(events)
  const player = new Player({
    target: container,
    props: {...playerSize(container, aspect), events: playerEvents.parse(events), autoPlay: false},
  })
  skipIdlePlayback(player, events, skipIdle)
  let frame = 0
  const observer = new ResizeObserver(() => {
    cancelAnimationFrame(frame)
    frame = requestAnimationFrame(() => {
      const size = playerSize(container, aspect)
      if (size.width < 80) return
      player.$set({width: size.width, height: size.height})
      player.triggerResize()
    })
  })
  observer.observe(container)
  return () => {
    cancelAnimationFrame(frame)
    observer.disconnect()
    player.$destroy()
  }
}

export function RecorderPanelView(): JSX.Element {
  const host = getHostApi()
  const apiBase = host.useApiBase()
  const insert = host.useComposerInsert()
  const store = useRecorderContext((context) => context.store)
  const rpc = makeExtRpcClient<RecorderRouter>(apiBase, RECORDER_NAME)
  const [recording, recordingControl] = createResource(() => rpc.window({}))
  const [log, logControl] = createResource(() => rpc.log({}))
  const [skipIdle, setSkipIdle] = createSignal(true)

  const replayRef = (events: RrwebEvent[]) => (container: HTMLDivElement) => {
    if (events.length < 2) return
    onCleanup(mountPlayer(container, events, skipIdle))
  }

  const sendToAgent = (): void => {
    const entries = log()?.entries ?? []
    const lines = entries.map((entry: ActionLogEntry) => `[${entry.kind}] ${entry.detail}`)
    insert(`Here is what just happened in my app (recorded):\n${lines.join('\n')}`)
  }

  const startNewRecording = async (): Promise<void> => {
    await rpc.reset(undefined).catch(() => {})
    await Promise.all([recordingControl.refetch(), logControl.refetch()])
  }

  return (
    <div class="p-3 flex flex-1 flex-col gap-3 min-h-0 overflow-hidden">
      <Show when={store.status() !== 'failed'} fallback={<RecorderFailedNotice />}>
        <Show when={!recording.loading} fallback={<div class="text-sm opacity-70">Loading recording…</div>}>
          <Show keyed when={recordingWithEnoughEvents(recording())} fallback={<RecorderEmptyNotice />}>
            {(events) => (
              <>
                <div ref={replayRef(events)} class="flex flex-1 min-h-0 w-full items-start justify-center" />
                <div class="flex gap-2 items-center">
                  <Button variant="outline" size="sm" onClick={sendToAgent}>
                    Send to agent
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    aria-pressed={skipIdle()}
                    onClick={() => setSkipIdle((current) => !current)}
                  >
                    {skipIdle() ? 'Skip idle: on' : 'Skip idle: off'}
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => void startNewRecording()}>
                    New recording
                  </Button>
                </div>
              </>
            )}
          </Show>
        </Show>
      </Show>
    </div>
  )
}

function RecorderFailedNotice(): JSX.Element {
  return <div class="text-sm opacity-70">Recording is unavailable — capture failed to start on this page.</div>
}

function RecorderEmptyNotice(): JSX.Element {
  return <div class="text-sm opacity-70">No recording yet — interact with the page first.</div>
}
