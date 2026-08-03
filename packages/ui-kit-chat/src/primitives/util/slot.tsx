import {children, Show, type JSX, type ParentProps} from 'solid-js'

export function Slot(props: ParentProps<{fallback?: JSX.Element}>): JSX.Element {
  const resolved = children(() => props.children)
  return (
    <Show when={resolved()} fallback={props.fallback}>
      {resolved()}
    </Show>
  )
}
