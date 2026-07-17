import {Show, createSignal, onCleanup, type Accessor, type JSX} from 'solid-js'
import {z} from 'zod'
import {QueryClient, QueryClientProvider, useMutation, useQuery, useQueryClient} from '@tanstack/solid-query'
import {createTanstackQueryUtils} from '@orpc/tanstack-query'
import {getHostApi, makeExtRpcClient} from '@conciv/extension'
import {Button, Switch} from '@conciv/ui-kit-system'
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

function styleScope(container: HTMLDivElement): Document | ShadowRoot {
  const root = container.getRootNode()
  return root instanceof ShadowRoot ? root : document
}

function demoteInjectedStyles(scope: Document | ShadowRoot, known: Set<Element>): void {
  for (const injected of scope.querySelectorAll('style')) {
    if (known.has(injected)) continue
    injected.textContent = `@layer rrweb {\n${injected.textContent ?? ''}\n}`
    known.add(injected)
  }
}

function mountPlayer(container: HTMLDivElement, events: RrwebEvent[], skipIdle: Accessor<boolean>): () => void {
  const scope = styleScope(container)
  const known = new Set<Element>(scope.querySelectorAll('style'))
  const style = document.createElement('style')
  style.textContent = `@layer rrweb {\n${rrwebCss}\n${playerCss}\n}\n${themeCss}`
  container.appendChild(style)
  known.add(style)
  const aspect = recordedAspect(events)
  const player = new Player({
    target: container,
    props: {...playerSize(container, aspect), events: playerEvents.parse(events), autoPlay: false},
  })
  demoteInjectedStyles(scope, known)
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
  const queryClient = new QueryClient()
  return (
    <QueryClientProvider client={queryClient}>
      <RecorderPanel />
    </QueryClientProvider>
  )
}

function RecorderPanel(): JSX.Element {
  const host = getHostApi()
  const apiBase = host.useApiBase()
  const insert = host.useComposerInsert()
  const leaveView = host.useLeaveView()
  const toast = host.useToast()
  const store = useRecorderContext((context) => context.store)
  const rpc = makeExtRpcClient<RecorderRouter>(apiBase, RECORDER_NAME)
  const utils = createTanstackQueryUtils(rpc)
  const queryClient = useQueryClient()
  const recording = useQuery(() => utils.window.queryOptions({input: {}}))
  const log = useQuery(() => utils.log.queryOptions({input: {}}))
  const reset = useMutation(() =>
    utils.reset.mutationOptions({
      onSuccess: () => queryClient.invalidateQueries(),
      onError: () => toast('Could not start a new recording — is the page still connected?'),
    }),
  )
  const [skipIdle, setSkipIdle] = createSignal(true)

  const retry = (): void => void queryClient.invalidateQueries()

  const replayRef = (events: RrwebEvent[]) => (container: HTMLDivElement) => {
    if (events.length < 2) return
    onCleanup(mountPlayer(container, events, skipIdle))
  }

  const sendToAgent = (): void => {
    const entries = log.data?.entries ?? []
    const lines = entries.map((entry: ActionLogEntry) => `[${entry.kind}] ${entry.detail}`)
    insert(`Here is what just happened in my app (recorded):\n${lines.join('\n')}`)
    leaveView()
  }

  return (
    <div class="p-3 flex flex-1 flex-col gap-3 min-h-0 overflow-hidden">
      <Show when={store.status() !== 'failed'} fallback={<RecorderFailedNotice />}>
        <Show when={!recording.isError && !log.isError} fallback={<RecorderErrorNotice retry={retry} />}>
          <Show when={!recording.isPending} fallback={<RecorderNotice text="Loading recording…" />}>
            <Show keyed when={recordingWithEnoughEvents(recording.data)} fallback={<RecorderEmptyNotice />}>
              {(events) => (
                <>
                  <div ref={replayRef(events)} class="flex flex-1 min-h-0 w-full items-start justify-center" />
                  <div class="flex gap-2 items-center">
                    <Button size="sm" disabled={!log.isSuccess} onClick={sendToAgent}>
                      Send to agent
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={reset.isPending}
                      onClick={() => reset.mutate(undefined)}
                    >
                      New recording
                    </Button>
                    <Switch.Root
                      class="ml-auto"
                      checked={skipIdle()}
                      onCheckedChange={(details) => setSkipIdle(details.checked)}
                    >
                      <Switch.Control>
                        <Switch.Thumb />
                      </Switch.Control>
                      <Switch.Label>Skip idle</Switch.Label>
                      <Switch.HiddenInput />
                    </Switch.Root>
                  </div>
                </>
              )}
            </Show>
          </Show>
        </Show>
      </Show>
    </div>
  )
}

function RecorderNotice(props: {text: string}): JSX.Element {
  return <div class="text-[0.8125rem] text-pw-text-2 font-pw">{props.text}</div>
}

function RecorderErrorNotice(props: {retry: () => void}): JSX.Element {
  return (
    <div class="flex flex-col gap-2 items-start">
      <RecorderNotice text="Could not load the recording." />
      <Button variant="outline" size="sm" onClick={() => props.retry()}>
        Retry
      </Button>
    </div>
  )
}

function RecorderFailedNotice(): JSX.Element {
  return <RecorderNotice text="Recording is unavailable — capture failed to start on this page." />
}

function RecorderEmptyNotice(): JSX.Element {
  return <RecorderNotice text="No recording yet — interact with the page first." />
}
