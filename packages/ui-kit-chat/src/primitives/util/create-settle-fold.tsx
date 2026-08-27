import {createSignal, untrack, type Accessor} from 'solid-js'

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
  const bornFolded = untrack(() => props.folded?.() ?? false)
  const [userOpen, setUserOpen] = createSignal<boolean | undefined>(props.defaultOpen)
  const open = () => userOpen() ?? (props.revealed() && !bornFolded)
  return {open, setOpen: setUserOpen, toggle: () => setUserOpen(!open())}
}
