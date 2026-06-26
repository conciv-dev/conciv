import {createSignal, Show, type JSX} from 'solid-js'

// The harness id is display-only "extra info" here — never read back into a header, body, or list key.
export type SessionInfo = {name: string | null; harnessSessionId: string | null; origin: 'chat' | 'agent' | 'external'}

// The body of the session-info popover: name, copyable harness id, origin.
export function SessionInfoCard(props: {info: SessionInfo}): JSX.Element {
  const [copied, setCopied] = createSignal(false)
  const copy = () => {
    const id = props.info.harnessSessionId
    if (!id) return
    void navigator.clipboard.writeText(id).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1200)
    })
  }
  return (
    <div>
      <div class="font-semibold mb-1.5 break-words">{props.info.name ?? 'New session'}</div>
      <Show when={props.info.harnessSessionId}>
        {(id) => (
          <div class="mt-1 flex gap-2 items-center">
            <span class="opacity-60 flex-none w-13">session</span>
            <code class="font-pw-mono break-all">{id()}</code>
            <button
              type="button"
              class="text-[0.6875rem] text-inherit ml-auto px-1.5 py-px border border-pw-line rounded-pw-sm flex-none cursor-pointer"
              aria-label="Copy session id"
              onClick={copy}
            >
              {copied() ? 'copied' : 'copy'}
            </button>
          </div>
        )}
      </Show>
      <div class="mt-1 flex gap-2 items-center">
        <span class="opacity-60 flex-none w-13">origin</span>
        <span>{props.info.origin}</span>
      </div>
    </div>
  )
}

// The resolved one-line label for a surface (pane bar / modal subtitle).
export function sessionLabel(info: {name: string | null; harnessSessionId: string | null}): string {
  if (info.name) return info.name
  if (info.harnessSessionId) return info.harnessSessionId.slice(0, 8)
  return 'New session'
}
