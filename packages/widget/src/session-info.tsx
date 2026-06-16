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
    <div class="pw-session-info">
      <div class="pw-session-info-name">{props.info.name ?? 'New session'}</div>
      <Show when={props.info.harnessSessionId}>
        {(id) => (
          <div class="pw-session-info-row">
            <span class="pw-session-info-key">session</span>
            <code class="pw-session-info-id">{id()}</code>
            <button type="button" class="pw-session-info-copy" aria-label="Copy session id" onClick={copy}>
              {copied() ? 'copied' : 'copy'}
            </button>
          </div>
        )}
      </Show>
      <div class="pw-session-info-row">
        <span class="pw-session-info-key">origin</span>
        <span class="pw-session-info-val">{props.info.origin}</span>
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
