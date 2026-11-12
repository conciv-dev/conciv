import type {JSX} from 'solid-js'
import {Format} from '@ark-ui/solid/format'

export function ByteSize(props: {value: number; class?: string}): JSX.Element {
  return (
    <span class={props.class}>
      <Format.Byte value={props.value} unitDisplay="short" />
    </span>
  )
}
