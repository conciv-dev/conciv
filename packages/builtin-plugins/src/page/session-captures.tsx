import {createContext, createMemo, useContext, type Accessor, type JSX} from 'solid-js'
import {createTanstackQueryUtils, useQuery} from '@conciv/client'
import {usePlugin} from '@conciv/plugin/experimental'
import {useToolCallId} from '@conciv/ui-kit-chat/tools'
import {Definition} from '@conciv/plugin-page/rpc'
import {SessionCapturesSchema, toolCaptureViews, type ToolCaptureView} from '@conciv/protocol/element-capture-types'

type CapturesCall = {rpcId: typeof Definition.id; method: 'captures.list'; input: {sessionId: string}}

export type CaptureLookup = (toolCallId: string) => ToolCaptureView | undefined

function capturesCall(sessionId: string): CapturesCall {
  return {rpcId: Definition.id, method: 'captures.list', input: {sessionId}}
}

function useSessionCaptures(sessionID: Accessor<string | undefined>): CaptureLookup {
  const sessions = usePlugin().sessions
  const client = createMemo(() => {
    const id = sessionID()
    return sessions.list().find((session) => session.id === id)?.server.client
  })
  const pluginCall = createTanstackQueryUtils(
    (call: CapturesCall, options?: {signal?: AbortSignal}) => {
      const current = client()
      if (current === undefined) return Promise.reject(new Error(`no open session ${call.input.sessionId}`))
      return current.rpc(Definition)['captures.list'](call.input, options)
    },
    {path: ['plugin', 'call']},
  )
  const captures = useQuery(() => ({
    ...pluginCall.queryOptions({input: capturesCall(sessionID() ?? '')}),
    enabled: sessionID() !== undefined && client() !== undefined,
  }))
  const views = createMemo<Record<string, ToolCaptureView>>(() => {
    if (captures.isPending) return {}
    const parsed = SessionCapturesSchema.safeParse(captures.data)
    return parsed.success ? toolCaptureViews(parsed.data) : {}
  })
  return (toolCallId) => views()[toolCallId]
}

export const CaptureContext = createContext<CaptureLookup>(() => undefined)

export function SessionCaptures(props: {sessionID?: string; children: JSX.Element}): JSX.Element {
  const lookup = useSessionCaptures(() => props.sessionID)
  return <CaptureContext.Provider value={lookup}>{props.children}</CaptureContext.Provider>
}

export function useToolCapture(): Accessor<ToolCaptureView | undefined> {
  const lookup = useContext(CaptureContext)
  const callId = useToolCallId()
  return () => {
    const id = callId()
    return id === undefined ? undefined : lookup(id)
  }
}
