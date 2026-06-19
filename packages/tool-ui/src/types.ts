import type {ToolCallPart, ToolResultPart} from '@tanstack/ai-client'
import type {TestEvent} from '@mandarax/protocol/test-types'

// The color rail / accent a card renders under — a UI-local style, not a classification layer:
// page=magenta, code=teal, test=gold, read=purple, neutral=line.
export type ToolAccent = 'page' | 'code' | 'test' | 'read' | 'neutral'

// Host-app actions a card may need. The widget supplies concrete implementations; cards that don't
// need a given seam ignore it. The two test seams are optional so the package stays transport-free:
// the widget injects the live SSE subscription and the editor-open route (Plan C).
export type ToolViewCtx = {
  apiBase: string
  harnessId: string
  sendMessage: (text: string) => void
  // Answer a native tanstack tool approval (part.state==='approval-requested'). The widget posts the
  // decision out-of-band to unblock the harness's gate; absent → no approval controls are rendered.
  respondApproval?: (approvalId: string, approved: boolean) => void
  // Subscribe to the live test-runner stream; returns an unsubscribe. Absent → static render only.
  subscribeTestRunner?: (onEvent: (event: TestEvent) => void) => () => void
  // Open a source file in the user's editor (the test card's "open" action).
  openEditor?: (file: string, line?: number) => void
}

// The props every tool card receives: the raw tool-call part, its paired result, and host actions.
// Each card parses part.input with its own zod schema for typed, validated rendering.
export type ToolCardProps = {
  part: ToolCallPart
  result: ToolResultPart | undefined
  ctx: ToolViewCtx
}
