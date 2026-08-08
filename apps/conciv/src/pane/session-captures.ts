import {createMemo} from 'solid-js'
import {useQuery} from '@tanstack/solid-query'
import {toolCaptureViews, type ToolCaptureView} from '@conciv/protocol/element-capture-types'
import {useAppData} from '../app/context.js'

export type SessionCapturesView = {
  lookup: (toolCallId: string) => ToolCaptureView | undefined
  refresh: () => void
}

export function useSessionCaptures(sessionId: string): SessionCapturesView {
  const appData = useAppData()
  const captures = useQuery(() => appData.utils.captures.list.queryOptions({input: {sessionId}}))
  const views = createMemo<Record<string, ToolCaptureView>>(() => {
    const data = captures.data
    return data === undefined ? {} : toolCaptureViews(data)
  })
  return {lookup: (toolCallId) => views()[toolCallId], refresh: () => void captures.refetch()}
}
