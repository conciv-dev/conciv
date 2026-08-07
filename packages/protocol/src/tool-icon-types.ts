export const TOOL_ICON_KEYS = ['read', 'pointer', 'keyboard', 'react', 'edit', 'script', 'wait'] as const

export type ToolIconKey = (typeof TOOL_ICON_KEYS)[number]

export type ToolLabel = {running: string; done: string}
