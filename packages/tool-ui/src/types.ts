import type {ToolCallPart, ToolResultPart} from '@tanstack/ai-client'

// The color rail / accent a card renders under — a UI-local style, not a classification layer:
// page=magenta, code=teal, test=gold, read=purple, neutral=line.
export type ToolAccent = 'page' | 'code' | 'test' | 'read' | 'neutral'

// Host-app actions a card may need (live test stream, "fix this", "show more" retries).
export type ToolViewCtx = {
  apiBase: string
  harnessId: string
  sendMessage: (text: string) => void
}

// The props every tool card receives: the raw tool-call part, its paired result, and host actions.
// Each card parses part.input with its own zod schema for typed, validated rendering.
export type ToolCardProps = {
  part: ToolCallPart
  result: ToolResultPart | undefined
  ctx: ToolViewCtx
}
