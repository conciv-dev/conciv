import {createEffect, createResource, createSignal, on, onCleanup, Show, type JSX} from 'solid-js'
import {Terminal, createTerminalModel, type TerminalTheme} from '@conciv/ui-kit-terminal'
import type {ExtensionHostContext} from '@conciv/extension'
import {terminal} from '../client.js'
import type {TerminalStore} from './terminal-store.js'

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

type ViewContext = ExtensionHostContext & {store: TerminalStore}

function TerminalSurface(props: {ctx: ViewContext; generation: number; themeHost: () => Element}): JSX.Element {
  const ctx = props.ctx
  const model = createTerminalModel({
    url: () => wsUrl(ctx.apiBase, ctx.client.sessionId(), DEFAULT_COLS, DEFAULT_ROWS),
    theme: () => readTerminalTheme(props.themeHost()),
  })
  createEffect(() => {
    ctx.view.setLocked(model.busy())
    ctx.store.setBusy(model.busy())
  })
  onCleanup(() => {
    ctx.view.setLocked(false)
    ctx.store.setBusy(false)
  })
  return <Terminal model={model} onBackToChat={() => ctx.view.leave()} class="flex-1 min-h-0" />
}

export function TerminalPanelView(): JSX.Element {
  const ctx = terminal.useContext()
  const headers = () => ({'content-type': 'application/json', ...ctx.client.chatHeaders()})
  const openTerminal = async (): Promise<void> => {
    const res = await fetch(terminalUrl(ctx.apiBase, 'open'), {
      method: 'POST',
      credentials: 'include',
      headers: headers(),
      body: JSON.stringify({cols: DEFAULT_COLS, rows: DEFAULT_ROWS, model: ctx.store.spawnModel() ?? undefined}),
    })
    if (!res.ok) {
      const busy = res.status === 409
      throw new Error(busy ? 'Session is busy — wait for the current turn to finish.' : 'terminal open failed')
    }
  }
  const [openKey, setOpenKey] = createSignal(1)
  const [opened, {refetch}] = createResource(async () => {
    await openTerminal().catch((error: Error) => {
      ctx.notify(error.message)
      throw error
    })
    return true
  })

  const respawn = async (): Promise<void> => {
    await fetch(terminalUrl(ctx.apiBase, 'close'), {method: 'POST', credentials: 'include', headers: headers()}).catch(
      () => {},
    )
    await refetch()
    setOpenKey((key) => key + 1)
  }

  createEffect(
    on([() => ctx.client.sessionId(), () => ctx.store.respawnTick()], (_next, prev) => {
      if (prev !== undefined) void respawn()
    }),
  )

  let host: HTMLDivElement | undefined
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
          <Show keyed when={openKey()}>
            {(key) => <TerminalSurface ctx={ctx} generation={key} themeHost={() => host ?? document.body} />}
          </Show>
        </Show>
      </Show>
    </div>
  )
}
