import {createEffect, createSignal, type Accessor} from 'solid-js'

export type ForceOpenOnce = {
  open: Accessor<boolean>
  setOpen: (open: boolean) => void
}

export function createForceOpenOnce(props: {active: Accessor<boolean>; defaultOpen?: boolean}): ForceOpenOnce {
  const [userOpen, setUserOpen] = createSignal<boolean | undefined>(undefined)
  const [forced, setForced] = createSignal(Boolean(props.defaultOpen))
  createEffect<boolean>((wasActive) => {
    const active = props.active()
    if (active && !wasActive) setForced(true)
    return active
  }, false)
  return {
    open: () => userOpen() ?? forced(),
    setOpen: setUserOpen,
  }
}
