import {createSignal, onCleanup, type JSX} from 'solid-js'

// Safe wrappers: showPopover/hidePopover throw if called in the wrong state.
function show(el: HTMLElement | undefined): void {
  try {
    el?.showPopover()
  } catch {
    // already open / not connected
  }
}
function hide(el: HTMLElement | undefined): void {
  try {
    el?.hidePopover()
  } catch {
    // already hidden
  }
}

// Hover/focus-triggered popover. The trigger renders inline; the content renders in the
// top layer (popover="manual") so it escapes the header's overflow and sits above the
// panel and FAB. Opens on pointer-enter OR keyboard focus, stays open while the pointer
// bridges trigger→content, closes on pointer-leave of BOTH / blur / Escape. Position is
// computed under the trigger (flips above when there's no room below) and recomputed on
// scroll/resize while open.
export function HoverCard(props: {
  trigger: JSX.Element
  children: JSX.Element
  openDelay?: number
  closeDelay?: number
  sideOffset?: number
  class?: string
  label?: string
}): JSX.Element {
  const [open, setOpen] = createSignal(false)
  let anchorEl: HTMLSpanElement | undefined
  let contentEl: HTMLDivElement | undefined
  let openTimer: ReturnType<typeof setTimeout> | undefined
  let closeTimer: ReturnType<typeof setTimeout> | undefined

  const position = () => {
    if (!anchorEl || !contentEl) return
    const a = anchorEl.getBoundingClientRect()
    const c = contentEl.getBoundingClientRect()
    const offset = props.sideOffset ?? 6
    const below = a.bottom + offset
    const flip = below + c.height > window.innerHeight && a.top - offset - c.height > 0
    const top = flip ? a.top - offset - c.height : below
    const left = Math.max(8, Math.min(a.left, window.innerWidth - c.width - 8))
    contentEl.style.left = `${left}px`
    contentEl.style.top = `${top}px`
  }
  const reposition = () => requestAnimationFrame(position)

  const detach = () => {
    window.removeEventListener('scroll', reposition, true)
    window.removeEventListener('resize', reposition)
  }
  const doOpen = () => {
    clearTimeout(closeTimer)
    if (open()) return
    openTimer = setTimeout(() => {
      setOpen(true)
      show(contentEl)
      reposition()
      window.addEventListener('scroll', reposition, true)
      window.addEventListener('resize', reposition)
    }, props.openDelay ?? 0)
  }
  const doClose = () => {
    clearTimeout(openTimer)
    closeTimer = setTimeout(() => {
      setOpen(false)
      hide(contentEl)
      detach()
    }, props.closeDelay ?? 120)
  }
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape' && open()) {
      e.stopPropagation()
      clearTimeout(openTimer)
      setOpen(false)
      hide(contentEl)
      detach()
    }
  }
  onCleanup(() => {
    clearTimeout(openTimer)
    clearTimeout(closeTimer)
    detach()
  })

  return (
    <span class="pw-hovercard">
      <span
        class="pw-hovercard-anchor"
        ref={(el) => (anchorEl = el)}
        aria-label={props.label}
        aria-expanded={open()}
        onPointerEnter={doOpen}
        onPointerLeave={doClose}
        onFocusIn={doOpen}
        onFocusOut={doClose}
        onKeyDown={onKeyDown}
      >
        {props.trigger}
      </span>
      <div
        ref={(el) => {
          contentEl = el
          el.setAttribute('popover', 'manual')
        }}
        class={`pw-popover pw-hovercard-content ${props.class ?? ''}`}
        onPointerEnter={doOpen}
        onPointerLeave={doClose}
      >
        {props.children}
      </div>
    </span>
  )
}
