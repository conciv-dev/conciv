import {createContext, createMemo, type Accessor, type JSX} from 'solid-js'
import {useQuery} from '@conciv/client'
import {usePlugin} from '@conciv/plugin/experimental'
import {Definition} from './rpc.js'
import {SessionCapturesSchema, toolCaptureViews, type ToolCaptureView} from '@conciv/protocol/element-capture-types'

export type CaptureLookup = (toolCallId: string) => ToolCaptureView | undefined

function useSessionCaptures(sessionID: Accessor<string | undefined>): CaptureLookup {
  const sessions = usePlugin().sessions
  const client = createMemo(() => {
    const id = sessionID()
    return sessions.list().find((session) => session.id === id)?.server.client
  })
  const captures = useQuery(() => {
    const current = client()
    const sessionId = sessionID() ?? ''
    const list = current?.rpc(Definition)['captures.list']
    return {
      queryKey: list?.key({input: {sessionId}}) ?? ['page', 'captures', sessionId],
      queryFn: async ({signal}: {signal: AbortSignal}): Promise<Record<string, ToolCaptureView>> => {
        if (list === undefined) throw new Error(`no open session ${sessionId}`)
        const parsed = SessionCapturesSchema.safeParse(await list({sessionId}, {signal}))
        return parsed.success ? toolCaptureViews(parsed.data) : {}
      },
      enabled: sessionID() !== undefined && list !== undefined,
    }
  })
  return (toolCallId) => (captures.isPending ? undefined : captures.data?.[toolCallId])
}

export const CaptureContext = createContext<CaptureLookup>(() => undefined)

export function SessionCaptures(props: {sessionID?: string; children: JSX.Element}): JSX.Element {
  const lookup = useSessionCaptures(() => props.sessionID)
  return <CaptureContext.Provider value={lookup}>{props.children}</CaptureContext.Provider>
}
