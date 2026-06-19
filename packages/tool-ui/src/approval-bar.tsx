import {createSignal, Show, type JSX} from 'solid-js'
import {Check, ShieldAlert, X} from 'lucide-solid'
import type {ToolCallPart} from '@tanstack/ai-client'
import type {ToolViewCtx} from './types.js'

// The native approval prompt, rendered ON the tool card when tanstack has driven the part into its
// approval-requested state (part.state + part.approval, set from the harness's approval-requested
// event). Answering posts the decision out-of-band via ctx.respondApproval, which unblocks the
// harness gate; the live stream then settles the same part to complete/error. Optimistically hides
// the controls on click so they don't linger while the gate resolves.
// Allow/Deny base: `border` width/style only; each variant sets border-color + bg + text once.
const APPROVE_BTN =
  'flex-none inline-flex items-center gap-1 py-1 px-2.5 rounded-pw-sm border font-semibold text-[0.75rem] leading-none font-pw cursor-pointer focus-ring'

export function ApprovalBar(props: {part: ToolCallPart; ctx: ToolViewCtx}): JSX.Element {
  const [answered, setAnswered] = createSignal(false)
  const approval = () => props.part.approval
  const pending = () =>
    !answered() && props.part.state === 'approval-requested' && approval() !== undefined && !!props.ctx.respondApproval
  const decide = (approved: boolean) => {
    const id = approval()?.id
    if (!id) return
    setAnswered(true)
    props.ctx.respondApproval?.(id, approved)
  }
  return (
    <Show when={pending()}>
      <div
        class="text-[0.78125rem] text-pw-text font-pw mb-1.5 mt-1 px-2.75 py-2 border border-pw-accent-line rounded-pw-md bg-pw-accent-08 flex flex-wrap gap-2 items-center"
        role="group"
        aria-label="Approve this command?"
      >
        <span class="text-pw-accent inline-flex" aria-hidden="true">
          <ShieldAlert size={14} />
        </span>
        <span class="flex-auto min-w-0">Run this command?</span>
        <button
          type="button"
          class={`${APPROVE_BTN} text-pw-text-2 border-pw-line-2 bg-pw-fill hover:text-pw-danger hover:bg-pw-fill-strong`}
          onClick={() => decide(false)}
        >
          <X size={13} aria-hidden="true" />
          Deny
        </button>
        <button
          type="button"
          class={`${APPROVE_BTN} text-pw-on-accent border-pw-accent bg-pw-accent hover:bg-pw-accent-hi`}
          onClick={() => decide(true)}
        >
          <Check size={13} aria-hidden="true" />
          Allow
        </button>
      </div>
    </Show>
  )
}
