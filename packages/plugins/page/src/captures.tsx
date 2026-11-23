import {Show, createContext, createMemo, type JSX} from 'solid-js'
import {useQuery} from '@conciv/client'
import {usePlugin, type ServerRef} from '@conciv/plugin/experimental'
import {Definition} from './rpc.js'
import {toolCaptureViews, type ToolCaptureView} from './element-capture-types.js'

export type CaptureLookup = (toolCallId: string) => ToolCaptureView | undefined

export const CaptureContext = createContext<CaptureLookup>(() => undefined)

function SessionCaptureProvider(props: {
  client: ServerRef['client']
  sessionId: string
  children: JSX.Element
}): JSX.Element {
  const captures = useQuery(() => ({
    ...props.client.rpc(Definition)['captures.list'].queryOptions({input: {sessionId: props.sessionId}}),
    select: toolCaptureViews,
  }))
  const lookup: CaptureLookup = (toolCallId) => captures.data?.[toolCallId]
  return <CaptureContext.Provider value={lookup}>{props.children}</CaptureContext.Provider>
}

export function SessionCaptures(props: {sessionID?: string; children: JSX.Element}): JSX.Element {
  const sessions = usePlugin().sessions
  const open = createMemo(() => sessions.list().find((session) => session.id === props.sessionID))
  return (
    <Show when={open()} fallback={props.children}>
      {(session) => (
        <SessionCaptureProvider client={session().server.client} sessionId={session().id}>
          {props.children}
        </SessionCaptureProvider>
      )}
    </Show>
  )
}
