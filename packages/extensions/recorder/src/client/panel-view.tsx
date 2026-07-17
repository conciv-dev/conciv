import {Show, createResource, onCleanup, type JSX} from 'solid-js'
import {z} from 'zod'
import {getHostApi, makeExtRpcClient} from '@conciv/extension'
import {Button} from '@conciv/ui-kit-system'
import type {eventWithTime} from '@rrweb/types'
import playerCss from 'rrweb-player/dist/style.css?inline'
import rrwebCss from 'rrweb/dist/style.css?inline'
import Player from 'rrweb-player'
import {RECORDER_NAME, type ActionLogEntry, type RrwebEvent} from '../shared/protocol.js'
import type {RecorderRouter} from '../server.js'
import {useRecorderContext} from './recorder-context.js'

const playerEvents = z.array(z.custom<eventWithTime>())

function mountPlayer(container: HTMLDivElement, events: RrwebEvent[]): () => void {
  const style = document.createElement('style')
  style.textContent = `${rrwebCss}\n${playerCss}`
  container.appendChild(style)
  const width = container.clientWidth || 620
  const player = new Player({
    target: container,
    props: {events: playerEvents.parse(events), width, height: Math.round(width * 0.6), autoPlay: false},
  })
  return () => player.$destroy()
}

export function RecorderPanelView(): JSX.Element {
  const host = getHostApi()
  const apiBase = host.useApiBase()
  const insert = host.useComposerInsert()
  const store = useRecorderContext((context) => context.store)
  const rpc = makeExtRpcClient<RecorderRouter>(apiBase, RECORDER_NAME)
  const [recording] = createResource(() => rpc.window({}))
  const [log] = createResource(() => rpc.log({}))

  const replayRef = (container: HTMLDivElement): void => {
    const events = recording()?.events ?? []
    if (events.length < 2) return
    onCleanup(mountPlayer(container, events))
  }

  const sendToAgent = (): void => {
    const entries = log()?.entries ?? []
    const lines = entries.map((entry: ActionLogEntry) => `[${entry.kind}] ${entry.detail}`)
    insert(`Here is what just happened in my app (recorded):\n${lines.join('\n')}`)
  }

  return (
    <div class="p-2 flex flex-col gap-2 min-h-0 overflow-auto">
      <Show when={store.status() !== 'failed'} fallback={<RecorderFailedNotice />}>
        <Show when={!recording.loading} fallback={<div class="text-sm opacity-70">Loading recording…</div>}>
          <Show when={(recording()?.events.length ?? 0) >= 2} fallback={<RecorderEmptyNotice />}>
            <div ref={replayRef} class="min-h-0" />
            <Button variant="outline" size="sm" class="self-start" onClick={sendToAgent}>
              Send to agent
            </Button>
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
