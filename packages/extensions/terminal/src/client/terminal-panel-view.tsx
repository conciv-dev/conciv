import {createEffect, createResource, onCleanup, Show, type JSX} from 'solid-js'
import {Terminal, createTerminalModel, type TerminalTheme} from '@conciv/ui-kit-terminal'
import {terminal} from '../client.js'

const DEFAULT_COLS = 120
const DEFAULT_ROWS = 32

const ERROR_BANNER =
  'flex items-center justify-between gap-2 m-2.5 py-2.5 px-3 rounded-[10px] text-[0.75rem] bg-pw-fill border border-pw-danger-line text-pw-text'
const RETRY_BUTTON =
  'py-1.5 px-2.5 rounded-[7px] [border:none] text-[0.6875rem] font-semibold cursor-pointer bg-pw-accent text-white'

function readTerminalTheme(element: Element): TerminalTheme {
  const tokens = getComputedStyle(element)
  const token = (name: string, fallback: string): string => tokens.getPropertyValue(name).trim() || fallback
  return {
    background: token('--pw-panel', '#101014'),
    foreground: token('--pw-text-hi', '#d6d6de'),
    cursor: token('--pw-text-hi', '#d6d6de'),
    selectionBackground: token('--pw-fill-strong', '#3a3a44'),
  }
}

function terminalUrl(apiBase: string, path: string): string {
  return `${apiBase}/api/ext/terminal/${path}`
}

function wsUrl(apiBase: string, sessionId: string | null, cols: number, rows: number): string {
  const url = new URL(
    terminalUrl(apiBase, `tty?session=${sessionId ?? ''}&cols=${cols}&rows=${rows}`),
    window.location.href,
  )
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
  return url.toString()
}

export function TerminalPanelView(): JSX.Element {
  const ctx = terminal.useContext()
  const post = async (path: 'open' | 'close'): Promise<void> => {
    const res = await fetch(terminalUrl(ctx.apiBase, path), {
      method: 'POST',
      credentials: 'include',
      headers: {'content-type': 'application/json', ...ctx.client.chatHeaders()},
      body: JSON.stringify({cols: DEFAULT_COLS, rows: DEFAULT_ROWS}),
    })
    if (!res.ok) {
      const busy = res.status === 409
      throw new Error(busy ? 'Session is busy — wait for the current turn to finish.' : `terminal ${path} failed`)
    }
  }
  const [opened, {refetch}] = createResource(async () => {
    await post('open').catch((error: Error) => {
      ctx.notify(error.message)
      throw error
    })
    return true
  })

  let host: HTMLDivElement | undefined
  const model = createTerminalModel({
    url: () => wsUrl(ctx.apiBase, ctx.client.sessionId(), DEFAULT_COLS, DEFAULT_ROWS),
    theme: () => readTerminalTheme(host ?? document.body),
  })
  createEffect(() => ctx.view.setLocked(model.busy()))
  onCleanup(() => {
    ctx.view.setLocked(false)
    void post('close').catch(() => ctx.notify('Couldn’t close the terminal session.'))
  })

  return (
    <div ref={host} class="flex flex-col flex-1 min-h-0 anim-msg">
      <Show
        when={!opened.error}
        fallback={
          <div class={ERROR_BANNER} role="alert">
            <span>Couldn’t open the terminal.</span>
            <button type="button" class={RETRY_BUTTON} onClick={() => void refetch()}>
              Retry
            </button>
          </div>
        }
      >
        <Show
          when={opened()}
          fallback={
            <div class="flex flex-1 items-center justify-center text-[0.75rem] text-pw-text-2" role="status">
              connecting…
            </div>
          }
        >
          <Terminal model={model} onBackToChat={() => ctx.view.leave()} class="flex-1 min-h-0" />
        </Show>
      </Show>
    </div>
  )
}
