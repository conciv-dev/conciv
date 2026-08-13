import {createSignal, type Accessor} from 'solid-js'

export type AutoCollapse = {
  open: Accessor<boolean>
  setOpen: (open: boolean) => void
  toggle: () => void
  isAutoOpen: Accessor<boolean>
}

export function createAutoCollapse(props: {streaming: Accessor<boolean>; defaultOpen?: boolean}): AutoCollapse {
  const [userOpen, setUserOpen] = createSignal<boolean | undefined>(props.defaultOpen)
  const isAutoOpen = () => userOpen() === undefined && props.streaming()
  const open = () => userOpen() ?? props.streaming()
  return {open, setOpen: setUserOpen, toggle: () => setUserOpen(!open()), isAutoOpen}
}
