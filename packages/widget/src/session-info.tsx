import {createSignal, Show, type JSX} from 'solid-js'

export type SessionInfo = {name: string | null; harnessId: string | null; source: 'new' | 'chat' | 'agent'}

// The body of the session-info popover: name, copyable harness id, source.
export function SessionInfoCard(props: {info: SessionInfo}): JSX.Element {
  const [copied, setCopied] = createSignal(false)
  const copy = () => {
    const id = props.info.harnessId
    if (!id) return
    void navigator.clipboard.writeText(id).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1200)
    })
  }
  return (
    <div class="pw-session-info">
      <div class="pw-session-info-name">{props.info.name ?? 'New session'}</div>
      <Show when={props.info.harnessId}>
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
        <span class="pw-session-info-key">source</span>
        <span class="pw-session-info-val">{props.info.source}</span>
      </div>
    </div>
  )
}

// The resolved one-line label for a surface (pane bar / modal subtitle).
export function sessionLabel(info: {name: string | null; harnessId: string | null}): string {
  if (info.name) return info.name
  if (info.harnessId) return info.harnessId.slice(0, 8)
  return 'New session'
}
