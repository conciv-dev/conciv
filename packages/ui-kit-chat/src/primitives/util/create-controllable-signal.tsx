import {createSignal, type Accessor} from 'solid-js'

// Solid translation of assistant-ui's useControllableState: a value that follows a prop when one is
// supplied (controlled) and an internal signal otherwise (uncontrolled). `value`/`defaultValue` are
// read through accessors so the prop stays reactive; `onChange` fires on every set, controlled or not.
export function createControllableSignal<T>(props: {
  value: Accessor<T | undefined>
  defaultValue: Accessor<T | undefined>
  onChange?: (next: T) => void
}): [Accessor<T | undefined>, (next: T) => void] {
  const [internal, setInternal] = createSignal<T | undefined>(props.defaultValue())
  const isControlled = () => props.value() !== undefined
  const value = () => (isControlled() ? props.value() : internal())
  const setValue = (next: T) => {
    if (!isControlled()) setInternal(() => next)
    props.onChange?.(next)
  }
  return [value, setValue]
}
