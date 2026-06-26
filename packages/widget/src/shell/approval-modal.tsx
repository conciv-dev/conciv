import {Show, type JSX} from 'solid-js'
import {Dialog} from '@mandarax/ui-kit-system'
import {Check, ShieldAlert, X} from 'lucide-solid'

// A permission request awaiting the user's decision. Derived per-thread by ChatPanel from the
// messages' `approval-requested` parts, reported up to the shell, and rendered here.
export type PendingApproval = {id: string; title: string; decide: (approved: boolean) => void}

const BTN =
  'flex-none inline-flex items-center gap-1 py-1.5 px-3 rounded-pw-sm border font-semibold text-[0.8125rem] leading-none font-pw cursor-pointer focus-ring'

export function ApprovalModal(props: {visible: () => boolean; approvals: () => PendingApproval[]}): JSX.Element {
  const current = () => props.approvals()[0]
  return (
    <Dialog open={props.visible() && !!current()} label="Approve this command?">
      <Show when={current()}>
        {(a) => (
          <div class="flex flex-col gap-3">
            <div class="text-pw-accent flex gap-2 items-center">
              <ShieldAlert size={16} aria-hidden="true" />
              <span class="text-[0.9375rem] text-pw-text-hi font-semibold">Permission needed</span>
            </div>
            <p class="text-[0.8125rem] text-pw-text-2 m-0">The agent wants to run:</p>
            <code class="text-[0.78125rem] text-pw-text font-pw-mono px-2.5 py-2 rounded-pw-sm bg-pw-panel-sunk block whitespace-pre-wrap break-words">
              {a().title}
            </code>
            <div class="mt-1 flex gap-2 justify-end">
              <button
                type="button"
                class={`${BTN} text-pw-text-2 border-pw-line-2 bg-pw-fill hover:text-pw-danger hover:bg-pw-fill-strong`}
                onClick={() => a().decide(false)}
              >
                <X size={14} aria-hidden="true" />
                Deny
              </button>
              <button
                type="button"
                class={`${BTN} text-pw-on-accent border-pw-accent bg-pw-accent hover:bg-pw-accent-hi`}
                onClick={() => a().decide(true)}
              >
                <Check size={14} aria-hidden="true" />
                Allow
              </button>
            </div>
          </div>
        )}
      </Show>
    </Dialog>
  )
}
