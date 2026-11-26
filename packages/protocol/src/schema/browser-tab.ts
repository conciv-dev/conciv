import {z} from 'zod'
import {SessionId} from '@conciv/types/chat-types'

export const BrowserTabId = z.string().regex(/^tab_[a-f0-9-]{36}$/u)
export type BrowserTabId = z.infer<typeof BrowserTabId>

export const BrowserTab = z.object({
  id: BrowserTabId,
  url: z.string().max(16_384),
  title: z.string().max(2_048),
  focused: z.boolean(),
  visible: z.boolean(),
})
export type BrowserTab = z.infer<typeof BrowserTab>

export const BrowserTabList = z.object({tabs: z.array(BrowserTab), focusedTabId: BrowserTabId.nullable()})
export type BrowserTabList = z.infer<typeof BrowserTabList>

export const BrowserTabOpen = z.object({
  sessionId: SessionId,
  connectionId: z.string().min(1).max(256),
  tab: BrowserTab,
})
export type BrowserTabOpen = z.infer<typeof BrowserTabOpen>

export const BrowserTabsChange = z.object({version: z.number().int().nonnegative()})
export type BrowserTabsChange = z.infer<typeof BrowserTabsChange>
