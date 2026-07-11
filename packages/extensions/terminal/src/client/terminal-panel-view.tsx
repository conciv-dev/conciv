import {createEffect, createResource, createSignal, on, onCleanup, onMount, Show, type JSX} from 'solid-js'
import {ORPCError} from '@orpc/client'
import type {TerminalRouter} from '../server.js'
import {Terminal, createTerminalModel, type TerminalTheme} from '@conciv/ui-kit-terminal'
import {Button} from '@conciv/ui-kit-system'
import {getHostApi, makeExtRpcClient} from '@conciv/extension'
import type {ToolViewCtx} from '@conciv/protocol/tool-view-types'
import {useTerminalContext} from './terminal-context.js'
import {MirrorRail} from './mirror-rail.js'

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

function terminalClient(apiBase: string) {
  return makeExtRpcClient<TerminalRouter>(apiBase, 'terminal')
}

function wsUrl(apiBase: string, sessionId: string | null, cols: number, rows: number): string {
  const url = new URL(
    terminalUrl(apiBase, `tty?session=${sessionId ?? ''}&cols=${cols}&rows=${rows}`),
    window.location.href,
  )
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
  return url.toString()
}

function isTerminalFocusLoss(event: Event): boolean {
  return (
    event instanceof FocusEvent &&
    event.relatedTarget === null &&
    event.target instanceof Element &&
    event.target.closest('[data-terminal-screen]') !== null
  )
}

function hasModifier(event: KeyboardEvent): boolean {
  return event.shiftKey || event.ctrlKey || event.altKey || event.metaKey
}

function isPlainEnter(event: KeyboardEvent): boolean {
  return event.type === 'keydown' && event.key === 'Enter' && !hasModifier(event)
}

function TerminalSurface(props: {generation: number; themeHost: () => Element}): JSX.Element {
  const host = getHostApi()
  const store = useTerminalContext((context) => context.store)
  const apiBase = host.useApiBase()
  const sessionId = host.useSessionId()
  const grab = host.useGrab()
  const setViewLocked = host.useViewLock()
  const leaveView = host.useLeaveView()
  const rpc = host.useRpc()
  const [meta] = createResource(() => rpc.meta.models(undefined))
  const model = createTerminalModel({
    url: () => wsUrl(apiBase, sessionId(), DEFAULT_COLS, DEFAULT_ROWS),
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
  onMount(() => {
    const doc = props.themeHost().ownerDocument
    const root = props.themeHost().getRootNode()
    const onFocusOut = (event: Event): void => {
      if (!isTerminalFocusLoss(event)) return
      queueMicrotask(() => {
        if (doc.hasFocus()) model.focus()
      })
    }
    root.addEventListener('focusout', onFocusOut, true)
    onCleanup(() => root.removeEventListener('focusout', onFocusOut, true))
  })
  const pasteStagedGrabs = (): boolean => {
    const staged = grab.staged()
    if (staged.length === 0) return true
    model.paste(`\n\n${staged.map((entry) => entry.text).join('\n\n')}`)
    model.sendInput('\r')
    grab.clear()
    return false
  }
  model.terminal.attachCustomKeyEventHandler((event) => {
    if (event.type === 'keydown' && event.key === 'Escape') event.preventDefault()
    if (!isPlainEnter(event)) return true
    return pasteStagedGrabs()
  })
  createEffect(() => {
    setViewLocked(model.busy())
    store.setBusy(model.busy())
  })
  onCleanup(() => {
    setViewLocked(false)
    store.setBusy(false)
  })
  const railCtx = (): ToolViewCtx => ({
    apiBase,
    harnessId: meta()?.harness.id ?? '',
    sendMessage: () => {},
    respondApproval: () => {},
  })
  return (
    <Terminal
      model={model}
      onBackToChat={() => leaveView()}
      class="flex-1 min-h-0"
      rail={<MirrorRail apiBase={apiBase} sessionId={sessionId} ctx={railCtx()} />}
    />
  )
}

export function TerminalPanelView(): JSX.Element {
  const host = getHostApi()
  const store = useTerminalContext((context) => context.store)
  const apiBase = host.useApiBase()
  const sessionId = host.useSessionId()
  const toast = host.useToast()
  const openError = (error: unknown): Error => {
    const busy = error instanceof ORPCError && error.code === 'BUSY'
    return new Error(busy ? 'Session is busy — wait for the current turn to finish.' : 'Couldn’t open the terminal.')
  }
  const openTerminal = async (): Promise<void> => {
    const id = sessionId()
    if (!id) throw openError(undefined)
    await terminalClient(apiBase)
      .open({sessionId: id, cols: DEFAULT_COLS, rows: DEFAULT_ROWS, model: store.spawnModel() ?? undefined})
      .catch((error: unknown) => {
        throw openError(error)
      })
  }
  const [openKey, setOpenKey] = createSignal(1)
  const [opened, {refetch}] = createResource(async () => {
    await openTerminal().catch((error: Error) => {
      toast(error.message)
      throw error
    })
    return true
  })

  const respawning = {current: false}
  const respawn = async (): Promise<void> => {
    if (respawning.current) return
    respawning.current = true
    store.setRespawning(true)
    try {
      const id = sessionId()
      if (id)
        await terminalClient(apiBase)
          .close({sessionId: id})
          .catch(() => {})
      await refetch()
      setOpenKey((key) => key + 1)
    } finally {
      respawning.current = false
      store.setRespawning(false)
    }
  }

  createEffect(
    on([sessionId, () => store.respawnTick()], (_next, prev) => {
      if (prev !== undefined) void respawn()
    }),
  )

  let themeHost: HTMLDivElement | undefined = undefined
  return (
    <div
      ref={(element) => {
        themeHost = element
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
            {(key) => <TerminalSurface generation={key} themeHost={() => themeHost ?? document.body} />}
          </Show>
        </Show>
      </Show>
    </div>
  )
}
