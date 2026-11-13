import {
  type Accessor,
  createContext,
  createEffect,
  createMemo,
  createRoot,
  createSignal,
  getOwner,
  onCleanup,
  type Owner,
  type ParentProps,
  runWithOwner,
  untrack,
  useContext,
  type JSX,
  startTransition,
  For,
  Show,
} from 'solid-js'
import {Portal} from 'solid-js/web'
import {Dialog, activeElementIn, isShadowRoot} from '@conciv/ui-kit-system'
import {makeEventListener} from '@solid-primitives/event-listener'
import {uuid} from './uuid'
import {
  createDialogStackState,
  selectLayerClosing,
  selectLayerIndex,
  selectLayerModal,
  selectTopDialog,
  transitionDialogStack,
  type DialogStackEffect,
  type DialogStackEvent,
} from './dialog-stack-machine'

const TEXT_FIELD = [
  'input:not([type="hidden"], [type="checkbox"], [type="radio"], [type="button"], [type="submit"], [type="reset"], [type="range"], [type="file"], [type="color"], [type="image"]):not(:disabled, [readonly])',
  'textarea:not(:disabled, [readonly])',
  '[contenteditable="true"]',
].join(', ')

type DialogElement = () => JSX.Element

export type FocusReturn = {element: HTMLElement; visible: boolean; range?: Range}

type DialogRequest = {element: DialogElement; owner: Owner; onClose?: () => void}

type Layer = {
  attempt: number
  node: JSX.Element
  owner: Owner
  onClose?: () => void
  dispose: () => void
  ref: () => HTMLDivElement | undefined
}

const Context = createContext<ReturnType<typeof init>>()

const LayerContext = createContext<{
  readonly id: string
  readonly attempt: number
  readonly closing: Accessor<boolean>
  setBackdropDismiss: (value: boolean) => void
  setExitDuration: (ms: number) => void
  container?: HTMLElement
}>()

export function useDialogLayer() {
  return useContext(LayerContext)
}

function init(container: () => HTMLElement | undefined, stack: () => HTMLElement | undefined) {
  const [machine, setMachine] = createSignal(createDialogStackState<FocusReturn>())
  const [layers, setLayers] = createSignal<Layer[]>([])
  const timers = new Map<number, ReturnType<typeof setTimeout>>()
  const queue: DialogStackEvent<FocusReturn, DialogRequest>[] = []

  const root = (): Document | ShadowRoot => {
    const node = stack()?.getRootNode()

    return isShadowRoot(node) ? node : document
  }

  const dispatch = (event: DialogStackEvent<FocusReturn, DialogRequest>) => {
    queue.push(event)

    if (queue.length === 1) untrack(drain)
  }

  const drain = () => {
    const event = queue[0]

    if (!event) return

    try {
      const prev = machine()
      const next = transitionDialogStack(prev, event)

      if (next.state !== prev) isolate(() => setMachine(next.state))
      next.effects.forEach((effect) => isolate(() => run(effect)))
    } finally {
      queue.shift()
      drain()
    }
  }

  const run = (effect: DialogStackEffect<FocusReturn, DialogRequest>) => {
    if (effect.type === 'mount') return mount(effect)

    if (effect.type === 'discard') return void (effect.notify && effect.request.onClose?.())

    if (effect.type === 'timer.start') {
      clearTimeout(timers.get(effect.attempt))
      timers.set(
        effect.attempt,
        setTimeout(() => dispatch({type: 'exit.completed', attempt: effect.attempt}), effect.delayMs),
      )

      return
    }

    if (effect.type === 'timer.stop') {
      clearTimeout(timers.get(effect.attempt))
      timers.delete(effect.attempt)

      return
    }

    const layer = layers().find((item) => item.attempt === effect.attempt)

    if (effect.type === 'notify.close') return layer?.onClose?.()

    if (effect.type === 'focus.return') {
      const ref = layer?.ref()

      if (ref?.contains(activeElementIn(root()))) return queueMicrotask(() => returnFocus(effect.focus, ref, root()))

      return returnFocus(effect.focus, ref, root())
    }

    timers.delete(effect.attempt)
    setLayers((items) => items.filter((item) => item.attempt !== effect.attempt))

    if (effect.notify) isolate(() => layer?.onClose?.())
    layer?.dispose()
  }

  onCleanup(() => dispatch({type: 'disposed'}))

  const open = createMemo(() => !!selectTopDialog(machine()))

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key !== 'Escape') return

    const within = container()

    if (within && event.target instanceof Node && !within.contains(event.target)) return

    if (event.target instanceof Element && event.target.closest('[data-owns-escape]')) return
    dispatch({type: 'dismiss'})
    event.preventDefault()
    event.stopPropagation()
  }

  createEffect(() => {
    if (!open()) return

    makeEventListener<{keydown: KeyboardEvent}>(root(), 'keydown', onKeyDown, {capture: true})
  })

  const mount = (effect: Extract<DialogStackEffect<FocusReturn, DialogRequest>, {type: 'mount'}>) => {
    const attempt = effect.attempt
    const modal = () => selectLayerModal(machine(), attempt, !!container())
    let ref: HTMLDivElement | undefined
    let dispose = () => {}

    const node = runWithOwner(effect.request.owner, () =>
      createRoot((d: () => void) => {
        dispose = d
        const closing = createMemo(() => selectLayerClosing(machine(), attempt))

        const initialFocus = () => {
          if (closing()) return false
          const content = ref?.querySelector<HTMLElement>('[data-scope="dialog"][data-part="content"]')

          if (!content) return false
          const autofocus = content.querySelector<HTMLElement>('[autofocus]')
          const active = activeElementIn(root())

          const kept =
            active instanceof HTMLElement &&
            active !== content &&
            content.contains(active) &&
            !active.closest('[data-scope="dialog"][data-part="close-trigger"]')
              ? active
              : undefined

          const field = Array.from(content.querySelectorAll<HTMLElement>(TEXT_FIELD)).find(
            (element) => element.getClientRects().length > 0,
          )

          return autofocus ?? kept ?? field ?? content
        }

        const keepFocus = (event: MouseEvent) => {
          if (event.target === event.currentTarget) event.preventDefault()
        }

        const layer = () => (
          <Dialog.Layer ref={ref} data-dialog-layer={selectLayerIndex(machine(), attempt)}>
            <Dialog.Backdrop data-component="dialog-overlay" onMouseDown={keepFocus} />
            <Dialog.Positioner onMouseDown={keepFocus}>
              <LayerContext.Provider
                value={{
                  id: effect.id,
                  attempt,
                  closing,
                  setBackdropDismiss: (enabled) => dispatch({type: 'layer.backdrop-dismiss', attempt, enabled}),
                  setExitDuration: (exitMs) => dispatch({type: 'layer.exit-duration', attempt, exitMs}),
                  container: container(),
                }}
              >
                {effect.request.element()}
              </LayerContext.Provider>
            </Dialog.Positioner>
          </Dialog.Layer>
        )

        return (
          <Dialog.Root
            modal={false}
            trapFocus={modal()}
            open={!closing()}
            closeOnEscape={false}
            onInteractOutside={(event) => {
              const within = container()
              const target = event.target

              if (within && target instanceof Node && !within.contains(target)) return event.preventDefault()
              dispatch({type: 'backdrop.click', attempt})
              event.preventDefault()

              if (closing() || ref?.contains(activeElementIn(root()))) return
              const fallback = initialFocus()

              if (fallback) fallback.focus({preventScroll: true})
            }}
            initialFocusEl={initialFocus}
            onOpenChange={(details) => {
              if (!details.open) dispatch({type: 'layer.dismiss', attempt})
            }}
          >
            <Show when={container()} fallback={<Dialog.Portal>{layer()}</Dialog.Portal>}>
              {(within) => <Portal mount={within()}>{layer()}</Portal>}
            </Show>
          </Dialog.Root>
        )
      }),
    )

    setLayers((items) => [
      ...items,
      {
        attempt,
        node,
        owner: effect.request.owner,
        onClose: effect.request.onClose,
        dispose,
        ref: () => ref,
      },
    ])
  }

  return {
    dispatch,
    active: () => selectTopDialog(machine()),
    base: () => layers().at(-1)?.owner,
    open: (mode: 'show' | 'push', request: DialogRequest, id: string | undefined, aborted: boolean) =>
      dispatch({type: 'open', mode, id: id ?? uuid(), aborted, focus: captureFocus(root()), request}),
    layers,
  }
}

function isolate(fn: () => void) {
  void new Promise<void>((resolve) => resolve(fn())).catch((cause: unknown) => console.error('[dialog]', cause))
}

function captureFocus(root: Node): FocusReturn | undefined {
  const element = activeElementIn(root)

  if (!(element instanceof HTMLElement) || element === document.body) return
  const selection = document.getSelection()
  const visible = element.matches(':focus-visible')

  if (!element.isContentEditable || !selection?.rangeCount || !element.contains(selection.anchorNode)) {
    return {element, visible}
  }

  return {element, visible, range: selection.getRangeAt(0).cloneRange()}
}

function returnFocus(focus: FocusReturn | undefined, layer: HTMLElement | undefined, root: Node) {
  const active = activeElementIn(root)

  if (!focus?.element.isConnected) return

  if (active && active !== document.body && !layer?.contains(active)) return
  focus.element.focus({preventScroll: true, focusVisible: focus.visible})

  if (!focus.range || !focus.element.contains(focus.range.commonAncestorContainer)) return
  const selection = document.getSelection()
  selection?.removeAllRanges()
  selection?.addRange(focus.range)
}

export function DialogProvider(props: ParentProps<{container?: HTMLElement}>) {
  let stack: HTMLDivElement | undefined
  const ctx = init(
    () => props.container,
    () => stack,
  )

  return (
    <Context.Provider value={ctx}>
      {props.children}
      <div ref={(element) => (stack = element)} data-component="dialog-stack">
        <For each={ctx.layers()}>{(item) => item.node}</For>
      </div>
    </Context.Provider>
  )
}

export function useDialog() {
  const ctx = useContext(Context)
  const layer = useContext(LayerContext)
  const owner = getOwner()

  if (!owner) {
    throw new Error('useDialog must be used within a DialogProvider')
  }

  if (!ctx) {
    throw new Error('useDialog must be used within a DialogProvider')
  }

  return {
    get active() {
      return ctx.active()
    },
    get closing() {
      return layer?.closing() ?? false
    },
    show(element: DialogElement, onClose?: () => void, id?: string, signal?: AbortSignal) {
      const base = ctx.base() ?? owner

      return startTransition(() => ctx.open('show', {element, owner: base, onClose}, id, !!signal?.aborted))
    },
    push(element: DialogElement, onClose?: () => void, id?: string, signal?: AbortSignal) {
      const base = ctx.base() ?? owner

      return startTransition(() => ctx.open('push', {element, owner: base, onClose}, id, !!signal?.aborted))
    },
    close(id?: string) {
      ctx.dispatch({type: 'close', id, layer: layer?.attempt})
    },
    dismiss(id?: string) {
      ctx.dispatch({type: 'dismiss', id})
    },
  }
}
