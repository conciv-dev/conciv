import {createSignal, type Accessor} from 'solid-js'

export type SettleFold = {
  open: Accessor<boolean>
  setOpen: (open: boolean) => void
  toggle: () => void
}

export function createSettleFold(props: {
  revealed: Accessor<boolean>
  folded?: Accessor<boolean>
  defaultOpen?: boolean
}): SettleFold {
  const [userOpen, setUserOpen] = createSignal<boolean | undefined>(props.defaultOpen)
  const open = () => userOpen() ?? (props.revealed() && !(props.folded?.() ?? false))
  return {open, setOpen: setUserOpen, toggle: () => setUserOpen(!open())}
}
