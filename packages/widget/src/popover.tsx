import {createEffect, onCleanup, Show, type JSX} from 'solid-js'
import {computePosition, autoUpdate, offset, flip, shift, type Placement} from '@floating-ui/dom'

// A floating panel anchored to `anchor`, positioned with Floating UI. Closes on outside-click
// and Escape. Render it inside the widget's shadow container so styles stay scoped.
export function Popover(props: {
  anchor: HTMLElement | undefined
  open: () => boolean
  setOpen: (v: boolean) => void
  placement?: Placement
  children: JSX.Element
}): JSX.Element {
  let panel: HTMLDivElement | undefined

  // Position + keep positioned while open; tear down autoUpdate when closed/unmounted.
  createEffect(() => {
    const anchor = props.anchor
    if (!props.open() || !anchor || !panel) return
    const stop = autoUpdate(anchor, panel, () => {
      if (!panel) return
      void computePosition(anchor, panel, {
        placement: props.placement ?? 'bottom-start',
        middleware: [offset(6), flip(), shift({padding: 8})],
      }).then(({x, y}) => {
        if (panel) Object.assign(panel.style, {left: `${x}px`, top: `${y}px`})
      })
    })
    onCleanup(stop)
  })

  // Dismiss on outside pointerdown + Escape, only while open.
  createEffect(() => {
    if (!props.open()) return
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node
      if (panel && !panel.contains(t) && props.anchor && !props.anchor.contains(t)) props.setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') props.setOpen(false)
    }
    window.addEventListener('pointerdown', onDown, true)
    window.addEventListener('keydown', onKey)
    onCleanup(() => {
      window.removeEventListener('pointerdown', onDown, true)
      window.removeEventListener('keydown', onKey)
    })
  })

  return (
    <Show when={props.open()}>
      <div
        class="pw-popover"
        role="dialog"
        ref={(el) => {
          panel = el
        }}
      >
        {props.children}
      </div>
    </Show>
  )
}
