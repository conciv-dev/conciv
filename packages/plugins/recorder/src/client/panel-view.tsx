import {Match, Switch, createResource, type JSX} from 'solid-js'
import {usePlugin} from '@conciv/plugin/experimental'
import {Recorder} from '../rpc.js'
import {REPLAY_MIN_EVENTS} from '../shared/protocol.js'
import {RecorderErrorNotice, RecorderNotice} from './notices.js'

export function RecorderPanel(props: {clientId: string}): JSX.Element {
  const ctx = usePlugin()
  const [recording, {refetch}] = createResource(
    () => props.clientId,
    (clientId) => ctx.client.rpc(Recorder).window({clientId}, {signal: ctx.signal}),
  )
  const retry = (): void => void refetch()

  return (
    <div class="p-3 flex flex-1 flex-col gap-3 min-h-0 overflow-hidden">
      <Switch fallback={<RecorderEmptyNotice />}>
        <Match when={recording.error}>
          <RecorderErrorNotice retry={retry} />
        </Match>
        <Match when={recording.loading}>
          <RecorderNotice text="Loading recording…" />
        </Match>
        <Match when={(recording()?.events.length ?? 0) < REPLAY_MIN_EVENTS}>
          <RecorderEmptyNotice />
        </Match>
      </Switch>
    </div>
  )
}

function RecorderEmptyNotice(): JSX.Element {
  return <RecorderNotice text="No recording yet: interact with the page first." />
}
