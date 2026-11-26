export const CHAT_VIEW_ID = 'chat'

export function viewTabId(view: string): string {
  return `chat-view-tab-${view}`
}

export function viewTabPanelId(view: string): string {
  return `chat-view-panel-${view}`
}

export type ViewTabPanelAttributes = {id?: string; role?: 'tabpanel'; 'aria-labelledby'?: string}

export function viewTabPanelAttributes(view: string | undefined): ViewTabPanelAttributes {
  if (view === undefined) return {}
  return {id: viewTabPanelId(view), role: 'tabpanel', 'aria-labelledby': viewTabId(view)}
}
