import {createContext, createMemo, type Accessor, type JSX} from 'solid-js'
import {createTanstackQueryUtils, useQuery} from '@conciv/client'
import {usePlugin} from '@conciv/plugin/experimental'
import {Definition} from './rpc.js'
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
    async (call: CapturesCall, options?: {signal?: AbortSignal}): Promise<Record<string, ToolCaptureView>> => {
      const current = client()
      if (current === undefined) throw new Error(`no open session ${call.input.sessionId}`)
      const parsed = SessionCapturesSchema.safeParse(
        await current.rpc(Definition)['captures.list'](call.input, options),
      )
      return parsed.success ? toolCaptureViews(parsed.data) : {}
    },
    {path: ['plugin', 'call', 'captures']},
  )
  const captures = useQuery(() => ({
    ...pluginCall.queryOptions({input: capturesCall(sessionID() ?? '')}),
    enabled: sessionID() !== undefined && client() !== undefined,
  }))
  return (toolCallId) => (captures.isPending ? undefined : captures.data?.[toolCallId])
}

export const CaptureContext = createContext<CaptureLookup>(() => undefined)

export function SessionCaptures(props: {sessionID?: string; children: JSX.Element}): JSX.Element {
  const lookup = useSessionCaptures(() => props.sessionID)
  return <CaptureContext.Provider value={lookup}>{props.children}</CaptureContext.Provider>
}
