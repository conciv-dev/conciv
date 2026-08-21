import {children, Show, type JSX} from 'solid-js'
import {TerminalPrimitive} from '../primitives/terminal.js'
import type {TerminalModel} from '../model.js'

const ROOT = 'relative flex flex-col flex-1 min-h-0 [background:var(--chat-bg)]'
const SCREEN_WRAP = 'flex flex-col flex-1 min-h-0 min-w-0 overflow-hidden [transition:opacity_200ms_var(--chat-ease)]'
const SCREEN = 'flex-1 min-h-0 p-2.5'
const CONNECTING = 'absolute inset-0 flex items-center justify-center text-[0.75rem] [color:var(--chat-text-3)]'
const BANNER =
  'flex items-center justify-between gap-2 m-2.5 py-2.5 px-3 rounded-[var(--chat-radius-lg)] text-[0.75rem] [background:var(--chat-frame-bg)] [border:1px_solid_var(--chat-line)] [color:var(--chat-frame-text)]'
const BANNER_BUTTON =
  'py-1.5 px-2.5 rounded-[var(--chat-radius-sm)] border-0 text-[0.6875rem] font-semibold cursor-pointer [background:var(--chat-accent)] [color:var(--chat-on-accent)]'

export function Terminal(props: {
  model: TerminalModel
  onBackToChat?: () => void
  class?: string
  rail?: JSX.Element
}): JSX.Element {
  const settled = () => props.model.status() === 'exited' || props.model.status() === 'error'
  const rail = children(() => props.rail)
  return (
    <TerminalPrimitive.Root model={props.model} class={`${ROOT}  ${props.class ?? ''}`}>
      <div class="flex flex-1 flex-row min-h-0">
        <div class={SCREEN_WRAP} style={{opacity: settled() ? '0.45' : '1'}}>
          <TerminalPrimitive.Screen class={SCREEN} />
        </div>
        <Show when={rail()}>
          <TerminalPrimitive.Overlay anchor="rail">{rail()}</TerminalPrimitive.Overlay>
        </Show>
      </div>
      <Show when={props.model.status() === 'connecting'}>
        <div class={CONNECTING} role="status">
          connecting…
        </div>
      </Show>
      <TerminalPrimitive.Banner>
        {(state) => (
          <div class={BANNER} role="alert">
            <span>{state.message ?? 'Terminal session ended'}</span>
            <Show when={props.onBackToChat}>
              <button type="button" class={BANNER_BUTTON} onClick={() => props.onBackToChat?.()}>
                Back to chat
              </button>
            </Show>
          </div>
        )}
      </TerminalPrimitive.Banner>
    </TerminalPrimitive.Root>
  )
}
