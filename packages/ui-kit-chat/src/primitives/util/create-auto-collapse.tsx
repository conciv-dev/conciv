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
}): AutoCollapse {
  const [userOpen, setUserOpen] = createSignal<boolean | undefined>(props.defaultOpen)
  const [autoClosed, setAutoClosed] = createSignal(false)
  createEffect<boolean>((wasStreaming) => {
    const streaming = props.streaming()
    if (wasStreaming && !streaming && userOpen() === undefined) setAutoClosed(true)
    return streaming
  }, false)
  const isAutoOpen = () => userOpen() === undefined && !autoClosed() && props.streaming()
  const open = () => userOpen() ?? (Boolean(props.forceOpen?.()) || isAutoOpen())
  const setOpen = (next: boolean) => {
    setAutoClosed(true)
    setUserOpen(next)
  }
  return {open, setOpen, toggle: () => setOpen(!open()), isAutoOpen}
}
