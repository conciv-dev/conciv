import {createMemo} from 'solid-js'
import {useQuery} from '@conciv/client'
import {SessionCapturesSchema, toolCaptureViews, type ToolCaptureView} from '@conciv/protocol/element-capture-types'
import {useAppData} from '../app/context.js'
import {sessionCapturesCall} from '../data/app-data.js'

export type SessionCapturesView = {
  lookup: (toolCallId: string) => ToolCaptureView | undefined
}

export function useSessionCaptures(sessionId: string): SessionCapturesView {
  const appData = useAppData()
  const captures = useQuery(() => appData.utils.plugin.call.queryOptions({input: sessionCapturesCall(sessionId)}))
  const views = createMemo<Record<string, ToolCaptureView>>(() => {
    if (captures.isPending) return {}
    const parsed = SessionCapturesSchema.safeParse(captures.data)
    return parsed.success ? toolCaptureViews(parsed.data) : {}
  })
  return {lookup: (toolCallId) => views()[toolCallId]}
}
