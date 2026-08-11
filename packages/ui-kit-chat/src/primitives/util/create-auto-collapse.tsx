import {createEffect, createSignal, type Accessor} from 'solid-js'

export type AutoCollapse = {
  open: Accessor<boolean>
  setOpen: (open: boolean) => void
  toggle: () => void
  isAutoOpen: Accessor<boolean>
}

export function createAutoCollapse(props: {
  streaming: Accessor<boolean>
  defaultOpen?: boolean
  forceOpen?: Accessor<boolean>
  atBottom?: Accessor<boolean>
}): AutoCollapse {
  const [userOpen, setUserOpen] = createSignal<boolean | undefined>(props.defaultOpen)
  const [autoClosed, setAutoClosed] = createSignal(false)
  const [closePending, setClosePending] = createSignal(false)
  const atBottom = () => props.atBottom?.() ?? true
  createEffect<boolean>((wasStreaming) => {
    const streaming = props.streaming()
    if (wasStreaming && !streaming && userOpen() === undefined) {
      if (atBottom()) setAutoClosed(true)
      else setClosePending(true)
    }
    return streaming
  }, false)
  createEffect(() => {
    if (!closePending() || !atBottom()) return
    setAutoClosed(true)
    setClosePending(false)
  })
  const isAutoOpen = () => userOpen() === undefined && !autoClosed() && (props.streaming() || closePending())
  const open = () => userOpen() ?? (Boolean(props.forceOpen?.()) || isAutoOpen())
  const setOpen = (next: boolean) => {
    setClosePending(false)
    setAutoClosed(true)
    setUserOpen(next)
  }
  return {open, setOpen, toggle: () => setOpen(!open()), isAutoOpen}
}
