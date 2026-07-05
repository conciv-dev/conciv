import {createEffect, createResource, createSignal, on, onCleanup, onMount, Show, type JSX} from 'solid-js'
import {Terminal, createTerminalModel, type TerminalTheme} from '@conciv/ui-kit-terminal'
import {Button} from '@conciv/ui-kit-system'
import type {ExtensionHostContext} from '@conciv/extension'
import type {ToolViewCtx} from '@conciv/protocol/tool-view-types'
import {terminal} from '../client.js'
import {MirrorRail} from './mirror-rail.js'
import type {TerminalStore} from './terminal-store.js'

const ESCAPE_KEY = String.fromCharCode(27)
const DEFAULT_COLS = 120
const DEFAULT_ROWS = 32

const ERROR_BANNER =
  'flex items-center justify-between gap-2 m-2.5 py-2.5 px-3 rounded-[10px] text-[0.75rem] bg-pw-fill border border-pw-danger-line text-pw-text'

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
  onMount(() => {
    const win = props.themeHost().ownerDocument.defaultView
    if (!win) return
    const onEscape = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape' || !model.busy()) return
      event.preventDefault()
      event.stopImmediatePropagation()
      model.sendInput(ESCAPE_KEY)
      model.focus()
    }
    win.addEventListener('keydown', onEscape, true)
    onCleanup(() => win.removeEventListener('keydown', onEscape, true))
  })
  model.terminal.attachCustomKeyEventHandler((event) => {
    if (event.type !== 'keydown' || event.key !== 'Enter') return true
    if (event.shiftKey || event.ctrlKey || event.altKey || event.metaKey) return true
    const grabs = ctx.grab.staged()
    if (grabs.length === 0) return true
    model.paste(`\n\n${grabs.map((grab) => grab.text).join('\n\n')}`)
    model.sendInput('\r')
    ctx.grab.clear()
    return false
  })
  createEffect(() => {
    ctx.view.setLocked(model.busy())
    ctx.store.setBusy(model.busy())
  })
  onCleanup(() => {
    ctx.view.setLocked(false)
    ctx.store.setBusy(false)
  })
  const headers = () => ({...ctx.client.chatHeaders()})
  const railCtx: ToolViewCtx = {
    apiBase: ctx.apiBase,
    harnessId: ctx.harnessId,
    sendMessage: () => {},
    respondApproval: () => {},
    durationFor: ctx.durationFor,
  }
  return (
    <Terminal
      model={model}
      onBackToChat={() => ctx.view.leave()}
      class="flex-1 min-h-0"
      rail={<MirrorRail apiBase={ctx.apiBase} headers={headers} ctx={railCtx} />}
    />
  )
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
      throw new Error(busy ? 'Session is busy — wait for the current turn to finish.' : 'Couldn’t open the terminal.')
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

  const respawning = {current: false}
  const respawn = async (): Promise<void> => {
    if (respawning.current) return
    respawning.current = true
    ctx.store.setRespawning(true)
    try {
      await fetch(terminalUrl(ctx.apiBase, 'close'), {
        method: 'POST',
        credentials: 'include',
        headers: headers(),
      }).catch(() => {})
      await refetch()
      setOpenKey((key) => key + 1)
    } finally {
      respawning.current = false
      ctx.store.setRespawning(false)
    }
  }

  createEffect(
    on([() => ctx.client.sessionId(), () => ctx.store.respawnTick()], (_next, prev) => {
      if (prev !== undefined) void respawn()
    }),
  )

  let host: HTMLDivElement | undefined = undefined
  return (
    <div
      ref={(element) => {
        host = element
      }}
      class="flex flex-1 flex-col min-h-0"
    >
      <Show
        when={!opened.error}
        fallback={
          <div class={ERROR_BANNER} role="alert">
            <span>{opened.error?.message ?? 'Couldn’t open the terminal.'}</span>
            <Button variant="solid" size="sm" onClick={() => void refetch()}>
              Retry
            </Button>
          </div>
        }
      >
        <Show
          when={opened()}
          fallback={
            <div class="text-[0.75rem] text-pw-text-2 flex flex-1 items-center justify-center" role="status">
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
