import {z} from 'zod'
import {isSessionId} from '@conciv/protocol/chat-types'

export const QuickSearchSchema = z.object({
  panes: z.string().catch(''),
  focus: z.number().int().min(0).catch(0),
})

export type QuickSearch = z.infer<typeof QuickSearchSchema>

export function quickPaneIds(search: QuickSearch): string[] {
  return search.panes.split(',').filter(isSessionId)
}

export function quickSearchFor(paneIds: string[], focus: number): QuickSearch {
  return {panes: paneIds.join(','), focus}
}
