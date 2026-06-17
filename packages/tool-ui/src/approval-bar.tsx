import {createSignal, Show, type JSX} from 'solid-js'
import {Check, ShieldAlert, X} from 'lucide-solid'
import type {ToolCallPart} from '@tanstack/ai-client'
import type {ToolViewCtx} from './types.js'

// The native approval prompt, rendered ON the tool card when tanstack has driven the part into its
// approval-requested state (part.state + part.approval, set from the harness's approval-requested
// event). Answering posts the decision out-of-band via ctx.respondApproval, which unblocks the
// harness gate; the live stream then settles the same part to complete/error. Optimistically hides
// the controls on click so they don't linger while the gate resolves.
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
      <div class="pw-approve" role="group" aria-label="Approve this command?">
        <span class="pw-approve-ic" aria-hidden="true">
          <ShieldAlert size={14} />
        </span>
        <span class="pw-approve-q">Run this command?</span>
        <button type="button" class="pw-approve-deny" onClick={() => decide(false)}>
          <X size={13} aria-hidden="true" />
          Deny
        </button>
        <button type="button" class="pw-approve-allow" onClick={() => decide(true)}>
          <Check size={13} aria-hidden="true" />
          Allow
        </button>
      </div>
    </Show>
  )
}
