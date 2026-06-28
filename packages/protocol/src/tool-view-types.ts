import type {Component} from 'solid-js'
import type {ToolCallPart, ToolResultPart} from '@tanstack/ai-client'

// The card-render contract shared by the renderer (@mandarax/tool-ui) and the authoring layer
// (@mandarax/extension, whose defineTool(...).render() supplies a card). Lives in protocol so both
// sides depend on a leaf rather than each other (kept here, not in tool-ui, to avoid a package cycle).

// The color rail / accent a card renders under — a UI-local style, not a classification layer:
// page=magenta, code=teal, test=gold, read=purple, neutral=line.
export type ToolAccent = 'page' | 'code' | 'test' | 'read' | 'neutral'

// Host-app actions a card may need. The widget supplies concrete implementations; cards that don't
// need a given seam ignore it. Extension cards open their own transports via apiBase.
export type ToolViewCtx = {
  apiBase: string
  harnessId: string
  sendMessage: (text: string) => void
  // Answer a native tanstack tool approval (part.state==='approval-requested'). The widget posts the
  // decision out-of-band to unblock the harness's gate; absent → no approval controls are rendered.
  respondApproval?: (approvalId: string, approved: boolean) => void
}

// The props every tool card receives: the tool-call part, its paired result, host actions, and the
// host-measured wall-clock (tanstack parts carry no timing slot).
export type ToolCardProps = {
  part: ToolCallPart
  result: ToolResultPart | undefined
  ctx: ToolViewCtx
  durationMs?: number
}

export type ToolRenderResultOptions = {expanded: boolean; isPartial: boolean}

// Pi's render context, widened with the host seams (ToolViewCtx), the raw part, and host timing —
// so renderCall(args, ctx) / renderResult(result, options, ctx) reach everything a card needs.
export type ToolRenderContext<TArgs = unknown> = ToolViewCtx & {
  args: TArgs
  part: ToolCallPart
  toolCallId: string
  durationMs?: number
  expanded: boolean
  isPartial: boolean
  isError: boolean
}

// A tool's card component + the name(s) it renders. Self-describing entries dispatched by an ARRAY
// matched by name (Pi/TanStack model) — NOT a name→component registry. defineToolkit returns
// ToolCardEntry[]. The type-only solid-js import keeps protocol runtime-free (erased at build).
export type ToolUIComponent = Component<ToolCardProps>
export type ToolCardEntry = {names: string[]; render: ToolUIComponent; streamTitle?: string}
