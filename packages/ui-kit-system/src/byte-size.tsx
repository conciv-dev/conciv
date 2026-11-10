import {splitProps, type JSX} from 'solid-js'
import {Format} from '@ark-ui/solid/format'

export function ByteSize(props: {value: number; class?: string}): JSX.Element {
  const [local, rest] = splitProps(props, ['value'])
  return (
    <span {...rest}>
      <Format.Byte value={local.value} unitDisplay="short" />
    </span>
  )
}
