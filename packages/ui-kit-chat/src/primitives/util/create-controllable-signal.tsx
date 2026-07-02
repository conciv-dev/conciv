import {createSignal, type Accessor} from 'solid-js'

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
